import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { MapContainer, TileLayer, CircleMarker, Tooltip, GeoJSON, useMap } from 'react-leaflet';
import { Play, Pause, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useCapabilities, useRadarFrames } from '../../hooks/useWeatherData';
import type { CapabilityDeclaration, RadarFrame } from '../../api/types';
import { useTheme } from '../../lib/theme-provider';
import type { FeatureCollection } from 'geojson';

interface RadarMapProps {
  center: [number, number];
  zoom?: number;
  /**
   * IANA timezone string for the station (e.g. "America/Chicago").
   * Used to format frame timestamps in station-local time (ADR-020).
   * Defaults to UTC when absent.
   */
  stationTz?: string;
  /** When true, show all frames and the expanded control bar (time slider + speed). */
  expanded?: boolean;
  /**
   * Leaflet maxBounds: [[south, west], [north, east]].
   * Constrains pan/zoom to the given bounding box.
   */
  maxBounds?: [[number, number], [number, number]];
  /** Radar overlay opacity 0–1. Defaults to MAX_OPACITY (0.7). */
  opacity?: number;
  /** Color scheme ID for tile URL {color} placeholder. Defaults to RAINVIEWER_COLOR (2). */
  colorScheme?: number;
  /**
   * When true and alertUrl is provided, fetches and renders GeoJSON alert polygons.
   * LibreWxR only.
   */
  showAlerts?: boolean;
  /** Alert GeoJSON endpoint URL (e.g. "/librewxr/v2/alerts"). */
  alertUrl?: string | null;
  /**
   * When true, renders a wind arrow tile overlay from LibreWxR.
   * Best-effort — gracefully degrades if wind tile URL is not yet serving.
   */
  showWind?: boolean;
  /** Caddy prefix for the radar provider (used to construct wind tile URL). */
  caddyPrefix?: string | null;
  /**
   * When true and satellite frames exist, renders satellite tile layers below
   * the radar tiles. Satellite tiles come from LibreWxR's infrared imagery.
   */
  showSatellite?: boolean;
  /** When true (default), render radar tile layers. When false, hide them. */
  showRadar?: boolean;
}

const SUBSTEPS = 5;        // interpolation steps between each real frame pair
const TICK_MS = 100;       // milliseconds per sub-step (fallback when frameCount is 0)
const MAX_OPACITY = 0.7;   // max radar overlay opacity

// How long to wait after frames load before starting auto-play.
// Gives the browser time to begin fetching tiles for all frames so the first
// loop isn't visibly stuttery while tiles are still in-flight.
const PRELOAD_DELAY_MS = 1500;

// Cap frame count in card view to keep animation tight and memory manageable.
const MAX_CARD_FRAMES = 24;

// Target full-loop duration. Tick interval is derived from frame count so
// short frame lists (e.g. 6 frames) don't blaze through in 3 seconds.
const TARGET_LOOP_MS = 17000;

// Idle timeout — pause animation and stop live refresh after this long
// without any user interaction.
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

// Speed multiplier options for expanded mode.
const SPEED_OPTIONS = [0.5, 1, 2] as const;

// Alert polygon severity → stroke color mapping.
// Severity labels match the NWS CAP standard used by LibreWxR.
const SEVERITY_COLORS: Record<string, string> = {
  Extreme: '#CC0033',   // dark red
  Severe: '#FF6600',    // orange
  Moderate: '#FFCC00',  // yellow
  Minor: '#339900',     // green
  Unknown: '#888888',   // gray
};

// RainViewer tile defaults.
// {size}    — tile size in pixels; 512 is the high-DPI option (also valid: 256).
// {color}   — colour scheme index; 2 = "Universal Blue" (meteorological standard).
// {options} — "<smooth>_<snow>"; 0_0 = no smoothing, no snow highlight.
// These are display preferences that belong in the dashboard, not the API.
// The CAPABILITY template keeps the placeholders generic; we resolve them here
// so Leaflet never sees an unknown {variable} and throws.
const RAINVIEWER_TILE_SIZE = 512;
const RAINVIEWER_COLOR = 2;
const RAINVIEWER_OPTIONS = '0_0';

function buildTileUrl(
  frame: RadarFrame,
  capability: CapabilityDeclaration,
  tileHost: string | null,
  colorScheme: number = RAINVIEWER_COLOR,
): string | null {
  const template = capability.tileUrlTemplate;

  if (template) {
    let url = template;
    if (tileHost) url = url.replace('{host}', tileHost);
    if (frame.path) url = url.replace('{path}', frame.path);
    url = url.replace('{time}', encodeURIComponent(frame.time));
    // Resolve RainViewer-specific placeholders that Leaflet doesn't know about.
    // Leaflet's getTileUrl throws "No value provided for variable {X}" for any
    // {placeholder} it cannot expand from its built-in set ({x},{y},{z},{s},{r}).
    url = url.replace('{size}', String(RAINVIEWER_TILE_SIZE));
    url = url.replace('{color}', String(colorScheme));
    url = url.replace('{options}', RAINVIEWER_OPTIONS);
    return url;
  }

  // WMS-T fallback: compose from wmsEndpointUrl
  if (capability.wmsEndpointUrl && capability.wmsLayerName) {
    const base = capability.wmsEndpointUrl;
    const layer = encodeURIComponent(capability.wmsLayerName);
    const time = encodeURIComponent(frame.time);
    return (
      `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
      `&LAYERS=${layer}&TIME=${time}` +
      `&BBOX={bbox-epsg-3857}&CRS=EPSG:3857` +
      `&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE`
    );
  }

  return null;
}

function getFrameOpacity(
  frameIndex: number,
  step: number,
  totalFrames: number,
  effectiveMaxOpacity: number = MAX_OPACITY,
): number {
  const primaryFrame = Math.floor(step / SUBSTEPS) % totalFrames;
  const subStep = step % SUBSTEPS;
  const nextFrame = (primaryFrame + 1) % totalFrames;

  if (subStep === 0) {
    return frameIndex === primaryFrame ? effectiveMaxOpacity : 0;
  }

  // Constant-composite cross-fade: compute opacities so two overlapping
  // semi-transparent layers composite to exactly effectiveMaxOpacity throughout.
  // Formula: composite = 1 - (1-a)(1-b) = effectiveMaxOpacity
  // Solved: a = 1 - transparency^(1-t), b = 1 - transparency^t
  const t = subStep / SUBSTEPS;
  const transparency = 1 - effectiveMaxOpacity;
  if (frameIndex === primaryFrame) {
    return 1 - Math.pow(transparency, 1 - t);
  }
  if (frameIndex === nextFrame) {
    return 1 - Math.pow(transparency, t);
  }
  return 0;
}

// Precipitation color stops per color scheme ID.
// Sources: RainViewer color-schemes page, LibreWxR rendered tile sampling,
// standard NWS/NEXRAD/TWC palettes.
const SCHEME_GRADIENTS: Record<number, string> = {
  0: 'linear-gradient(to right, #C8C8C8, #969696, #646464, #323232, #000000)',
  1: 'linear-gradient(to right, #88DDEE, #00AA00, #FFFF00, #FF6600, #FF0000, #CC00CC)',
  2: 'linear-gradient(to right, #96C8FA, #0096FA, #00D800, #FFFF00, #FF9600, #E80000, #C000C0)',
  3: 'linear-gradient(to right, #08C864, #2CFA46, #FAFA00, #FF9600, #FA0000, #FA00FA)',
  4: 'linear-gradient(to right, #00E600, #01B301, #FFE600, #FFA500, #FF0000, #CC0000, #FF00FF)',
  5: 'linear-gradient(to right, #A0E6FF, #00B4FF, #00DC00, #FFE600, #FF8C00, #FF0000, #C800C8)',
  6: 'linear-gradient(to right, #04E9E7, #019FF4, #0300F4, #02FD02, #01C501, #008E00, #FFFE33, #F87C09, #E40000, #FD00FD, #9854C6)',
  7: 'linear-gradient(to right, #0000FF, #00FFFF, #00FF00, #FFFF00, #FF8000, #FF0000, #FF00FF)',
  8: 'linear-gradient(to right, #6EC1EA, #4DAFDA, #3B9FCC, #5BBF5B, #FFFF00, #FF8C00, #FF0000, #CC0000)',
  9: 'linear-gradient(to right, #00BFFF, #00FF00, #FFFF00, #FF6600, #FF0000, #9900CC)',
  10: 'linear-gradient(to right, #00E0E0, #00C000, #FFFF00, #E0A000, #FF0000, #D060C0, #E0E0FF)',
  11: 'linear-gradient(to right, #00E0E0, #0080FF, #00C000, #FFE000, #FF8000, #FF0000, #C000C0, #FFFFFF)',
};
const DEFAULT_GRADIENT = SCHEME_GRADIENTS[2];

function RadarLegend({ colorScheme = 2 }: { colorScheme?: number }) {
  const { t } = useTranslation('radar');
  const gradient = SCHEME_GRADIENTS[colorScheme] ?? DEFAULT_GRADIENT;
  return (
    <div
      className="absolute bottom-8 right-2 z-[1001] flex flex-col gap-0.5 rounded bg-background/80 px-2 py-1.5 backdrop-blur-sm"
      aria-hidden="true"
    >
      <div
        className="h-2.5 w-36 rounded-sm"
        style={{ background: gradient }}
      />
      <div className="flex justify-between text-[10px] leading-tight text-muted-foreground">
        <span>{t('legendLight')}</span>
        <span>{t('legendHeavy')}</span>
      </div>
    </div>
  );
}

/**
 * Graphical frame progress bar — shows timeline position with color-coded
 * past vs nowcast segments.  Clickable to seek.
 *
 * Past/current frames: muted track color.
 * Nowcast frames: primary accent color.
 * Playhead: small circle at the current frame position.
 *
 * On mobile the "Forecast" label is hidden to avoid wordwrap shifts.
 */
function FrameProgressBar({
  frameCount,
  displayFrameIndex,
  nowcastStartIndex,
  onSeek,
  ariaLabel,
}: {
  frameCount: number;
  displayFrameIndex: number;
  nowcastStartIndex: number;
  onSeek: (frameIndex: number) => void;
  ariaLabel?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar || frameCount <= 1) return;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const idx = Math.round(ratio * (frameCount - 1));
    onSeek(idx);
  };

  if (frameCount <= 0) return null;

  const playheadPct = frameCount > 1
    ? (displayFrameIndex / (frameCount - 1)) * 100
    : 50;

  const hasNowcast = nowcastStartIndex > 0 && nowcastStartIndex < frameCount;
  const nowcastPct = hasNowcast
    ? (nowcastStartIndex / frameCount) * 100
    : 100;

  return (
    <div
      ref={barRef}
      className="relative cursor-pointer select-none"
      style={{ height: 20, touchAction: 'none' }}
      onClick={handleClick}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={frameCount - 1}
      aria-valuenow={displayFrameIndex}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onSeek(Math.min(displayFrameIndex + 1, frameCount - 1));
        else if (e.key === 'ArrowLeft') onSeek(Math.max(displayFrameIndex - 1, 0));
      }}
    >
      {/* Track */}
      <div
        className="absolute left-0 right-0 rounded-full overflow-hidden"
        style={{ top: 7, height: 6 }}
      >
        {/* Past segment */}
        <div
          className="absolute inset-y-0 left-0 bg-muted-foreground/40"
          style={{ width: `${nowcastPct}%` }}
        />
        {/* Nowcast segment */}
        {hasNowcast && (
          <div
            className="absolute inset-y-0 right-0 bg-primary/50"
            style={{ left: `${nowcastPct}%` }}
          />
        )}
        {/* Filled (elapsed) portion */}
        <div
          className={displayFrameIndex >= nowcastStartIndex && hasNowcast
            ? 'absolute inset-y-0 left-0 bg-primary/80'
            : 'absolute inset-y-0 left-0 bg-muted-foreground/70'}
          style={{ width: `${playheadPct}%` }}
        />
      </div>

      {/* Nowcast boundary tick */}
      {hasNowcast && (
        <div
          className="absolute bg-primary"
          style={{
            left: `${nowcastPct}%`,
            top: 5,
            width: 2,
            height: 10,
            transform: 'translateX(-1px)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Playhead dot */}
      <div
        className="absolute bg-foreground rounded-full shadow-sm"
        style={{
          left: `${playheadPct}%`,
          top: 4,
          width: 12,
          height: 12,
          transform: 'translateX(-6px)',
        }}
        aria-hidden="true"
      />
    </div>
  );
}

// Basemap tile configurations for light and dark themes.
// Light: standard OpenStreetMap tiles.
// Dark: CartoDB dark_all — free, no API key required.
// The key prop on TileLayer forces Leaflet to re-mount when the URL changes
// because Leaflet's TileLayer does not support dynamic URL updates in-place.
const TILE_CONFIG = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
} as const;

const SATELLITE_LABELS_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';
const SATELLITE_LABELS_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/**
 * Inner component that applies maxBounds dynamically to the Leaflet map.
 * MapContainer is an uncontrolled component — it reads props only on mount.
 * This component uses the useMap() hook to call setMaxBounds imperatively
 * whenever the bounds prop changes.
 */
function MapBoundsEnforcer({ bounds }: { bounds?: [[number, number], [number, number]] }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.setMaxBounds(bounds);
      const boundsObj = L.latLngBounds(bounds);
      const minZoom = map.getBoundsZoom(boundsObj, false);
      map.setMinZoom(minZoom);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.setMaxBounds([] as any);
      map.setMinZoom(0);
    }
  }, [map, bounds]);
  return null;
}

export function RadarMap({ center, zoom = 7, stationTz, expanded = false, maxBounds, opacity, colorScheme, showAlerts, alertUrl, showWind, caddyPrefix, showSatellite, showRadar }: RadarMapProps) {
  const { t } = useTranslation('radar');
  const { resolved: resolvedTheme } = useTheme();

  // --- Capabilities fetch to discover radar provider ---
  const { data: capabilities, loading: capLoading, error: capError } = useCapabilities();

  const radarCapability: CapabilityDeclaration | null =
    capabilities?.providers.find((p) => p.domain === 'radar') ?? null;

  // Only pass a providerId to useRadarFrames once capabilities have loaded and a
  // radar provider is confirmed. Passing null causes the hook to skip the fetch,
  // which prevents a spurious call (using the fallback DEFAULT_PROVIDER_ID) that
  // would 404/503 and trigger the error overlay instead of the "no provider" UI.
  const providerId: string | null =
    !capLoading && !capError && radarCapability !== null
      ? radarCapability.providerId
      : null;

  const { data: radarFrameList, loading: framesLoading, error: framesError, refetch } = useRadarFrames(providerId);

  // In card view, cap frames to MAX_CARD_FRAMES most recent.
  // In expanded view, show ALL frames from the API.
  const allFrames: RadarFrame[] = radarFrameList?.frames ?? [];
  const frames: RadarFrame[] = (!expanded && allFrames.length > MAX_CARD_FRAMES)
    ? allFrames.slice(allFrames.length - MAX_CARD_FRAMES)
    : allFrames;

  // Satellite frames — extracted from the same radarFrameList response.
  // Satellite frames use hourly cadence (fewer frames than radar's 10-min cadence).
  // Staleness guard: if the newest satellite frame is >24 hours old, the provider's
  // satellite pipeline is likely broken — treat as no satellite data available.
  const allSatelliteFrames: RadarFrame[] = (() => {
    const raw = radarFrameList?.satelliteFrames ?? [];
    if (raw.length === 0) return raw;
    const newestMs = new Date(raw[raw.length - 1].time).getTime();
    const ageMs = Date.now() - newestMs;
    if (ageMs > 24 * 60 * 60 * 1000) return [];
    return raw;
  })();
  const satelliteFrames: RadarFrame[] = (!expanded && allSatelliteFrames.length > MAX_CARD_FRAMES)
    ? allSatelliteFrames.slice(allSatelliteFrames.length - MAX_CARD_FRAMES)
    : allSatelliteFrames;
  const satelliteFrameCount = satelliteFrames.length;

  const satelliteActive = showSatellite && satelliteFrameCount > 0;
  const baseTile = TILE_CONFIG[resolvedTheme];

  const tileHost = radarFrameList?.tileHost ?? null;

  // --- Idle state ---
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsIdle(true), IDLE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    const events = ['mousemove', 'touchstart', 'keydown', 'scroll'] as const;
    events.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  // --- Animation state ---
  const [animationStep, setAnimationStep] = useState(0);
  // Start paused; auto-play begins after PRELOAD_DELAY_MS once frames are ready.
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which frame indices have fully loaded all their tiles.
  const loadedLayersRef = useRef(new Set<number>());

  // --- Satellite animation state (independent frame index, shared play/pause) ---
  const [satelliteAnimationStep, setSatelliteAnimationStep] = useState(0);
  const satelliteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Satellite preload: tiles must load before animation starts, otherwise
  // frames flicker (visible when cached, blank when still loading).
  const [satelliteReady, setSatelliteReady] = useState(false);
  const satellitePreloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedSatLayersRef = useRef(new Set<number>());

  // --- Loading progress state (for the tile-load progress indicator) ---
  const [radarLoadedCount, setRadarLoadedCount] = useState(0);
  const [satelliteLoadedCount, setSatelliteLoadedCount] = useState(0);

  // --- Speed multiplier state (expanded mode only) ---
  const [speedIndex, setSpeedIndex] = useState(1); // default 1x
  const speedMultiplier = SPEED_OPTIONS[speedIndex];
  const cycleSpeed = useCallback(() => {
    setSpeedIndex((i) => (i + 1) % SPEED_OPTIONS.length);
  }, []);

  // --- prefers-reduced-motion: suppress auto-play when user has opted out ---
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Alert polygon state (T4.6) ---
  // GeoJSON FeatureCollection fetched from alertUrl. Null when alerts are off or unavailable.
  const [alertData, setAlertData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    if (!showAlerts || !alertUrl) {
      setAlertData(null);
      return;
    }

    let cancelled = false;

    async function fetchAlerts() {
      try {
        const resp = await fetch(alertUrl!);
        if (!resp.ok) return;
        const data = await resp.json() as FeatureCollection;
        if (!cancelled) setAlertData(data);
      } catch {
        // Alerts are best-effort — don't surface an error to the user.
      }
    }

    void fetchAlerts();
    // ADR-075: alert GeoJSON is a standalone fetch (not via useApiQuery), so a
    // fixed interval is used. 300s matches the NWS alert update cadence.
    const id = setInterval(() => { void fetchAlerts(); }, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [showAlerts, alertUrl]);

  const frameCount = frames.length;

  // Resolve effective opacity and color scheme from props, falling back to defaults.
  const effectiveMaxOpacity = opacity ?? MAX_OPACITY;
  const effectiveColorScheme = colorScheme ?? RAINVIEWER_COLOR;

  // Adaptive tick interval — target ~17s full loop regardless of frame count.
  // In expanded mode, the speed multiplier shortens/lengthens the effective interval.
  const tickMs = frameCount > 0
    ? Math.max(50, Math.floor(TARGET_LOOP_MS / (frameCount * SUBSTEPS)))
    : TICK_MS;

  const effectiveTickMs = Math.max(30, Math.round(tickMs / speedMultiplier));

  const goNext = useCallback(() => {
    const total = frameCount * SUBSTEPS;
    if (total > 0) {
      setAnimationStep((s) => {
        // Snap to the next keyframe
        const currentKey = Math.floor(s / SUBSTEPS);
        return ((currentKey + 1) % frameCount) * SUBSTEPS;
      });
    }
  }, [frameCount]);

  const goPrev = useCallback(() => {
    const total = frameCount * SUBSTEPS;
    if (total > 0) {
      setAnimationStep((s) => {
        const currentKey = Math.floor(s / SUBSTEPS);
        return ((currentKey - 1 + frameCount) % frameCount) * SUBSTEPS;
      });
    }
  }, [frameCount]);

  // Clamp animationStep when frames change; start the preload delay when a new
  // frame list arrives so the browser has time to fetch tiles before animation starts.
  useEffect(() => {
    if (frameCount === 0) return;

    // Reset to step 0 on new frame list.
    setAnimationStep(0);

    // Reset tile-load tracking for the new frame list.
    loadedLayersRef.current = new Set<number>();
    setRadarLoadedCount(0);

    // Cancel any previous preload timer, then start a fresh fallback one.
    // The fallback fires only if tiles haven't all reported loaded yet.
    if (preloadTimerRef.current !== null) {
      clearTimeout(preloadTimerRef.current);
    }
    preloadTimerRef.current = setTimeout(() => {
      // Respect prefers-reduced-motion: only auto-play when the user
      // has not opted out of motion.  Manual play/pause still works.
      if (!prefersReducedMotion) {
        setIsPlaying(true);
      }
    }, PRELOAD_DELAY_MS);

    return () => {
      if (preloadTimerRef.current !== null) {
        clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }
    };
  }, [frameCount]);

  // Reset satellite preload when frames change or satellite is toggled on.
  useEffect(() => {
    if (!showSatellite || satelliteFrameCount === 0) {
      setSatelliteReady(false);
      loadedSatLayersRef.current = new Set<number>();
      setSatelliteLoadedCount(0);
      if (satellitePreloadTimerRef.current !== null) {
        clearTimeout(satellitePreloadTimerRef.current);
        satellitePreloadTimerRef.current = null;
      }
      return;
    }

    setSatelliteAnimationStep(0);
    setSatelliteReady(false);
    loadedSatLayersRef.current = new Set<number>();
    setSatelliteLoadedCount(0);

    satellitePreloadTimerRef.current = setTimeout(() => {
      setSatelliteReady(true);
    }, PRELOAD_DELAY_MS);

    return () => {
      if (satellitePreloadTimerRef.current !== null) {
        clearTimeout(satellitePreloadTimerRef.current);
        satellitePreloadTimerRef.current = null;
      }
    };
  }, [showSatellite, satelliteFrameCount]);

  // Pause animation when idle.
  useEffect(() => {
    if (isIdle) {
      setIsPlaying(false);
    }
  }, [isIdle]);

  // Animation timer — advances animationStep one sub-step at a time; cross-fade
  // between real frames is handled by getFrameOpacity. No URL swaps or tile
  // re-fetches after the initial load, resulting in smooth looping.
  useEffect(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (isPlaying && frameCount > 1) {
      const totalSteps = frameCount * SUBSTEPS;
      intervalRef.current = setInterval(() => {
        setAnimationStep((s) => (s + 1) % totalSteps);
      }, effectiveTickMs);
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, frameCount, effectiveTickMs]);

  // Satellite animation timer — gated on satelliteReady so tiles have time
  // to load before animation starts (prevents flickering on toggle-on).
  useEffect(() => {
    if (satelliteIntervalRef.current !== null) {
      clearInterval(satelliteIntervalRef.current);
      satelliteIntervalRef.current = null;
    }
    if (isPlaying && satelliteReady && showSatellite && satelliteFrameCount > 1) {
      const satTotalSteps = satelliteFrameCount * SUBSTEPS;
      const satTickMs = Math.max(50, Math.floor(TARGET_LOOP_MS / (satelliteFrameCount * SUBSTEPS)));
      const effectiveSatTickMs = Math.max(30, Math.round(satTickMs / speedMultiplier));
      satelliteIntervalRef.current = setInterval(() => {
        setSatelliteAnimationStep((s) => (s + 1) % satTotalSteps);
      }, effectiveSatTickMs);
    }
    return () => {
      if (satelliteIntervalRef.current !== null) {
        clearInterval(satelliteIntervalRef.current);
        satelliteIntervalRef.current = null;
      }
    };
  }, [isPlaying, satelliteReady, showSatellite, satelliteFrameCount, speedMultiplier]);

  // Live refresh — re-fetch frame metadata at the provider's configured interval.
  // ADR-075: refreshIntervalMs derives from radarCapability?.refreshInterval (provider-
  // configured, served from the API) — not a hardcoded constant. isIdle suppresses
  // the interval when the user is idle, per ADR-075 §7.
  const refreshIntervalMs = (radarCapability?.refreshInterval ?? 600) * 1000;
  useEffect(() => {
    if (!providerId || framesLoading || isIdle) return;
    const id = setInterval(() => {
      void refetch();
    }, refreshIntervalMs);
    return () => clearInterval(id);
  }, [providerId, refreshIntervalMs, framesLoading, refetch, isIdle]);

  // Page Visibility API — pause animation when tab hidden, refresh when visible.
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        setIsPlaying(false);
      } else {
        setIsIdle(false);
        // Refresh data when tab becomes visible.
        if (providerId) void refetch();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [providerId, refetch]);

  // Derive the display frame index from animationStep for timestamp/counter display.
  const displayFrameIndex = frameCount > 0 ? Math.floor(animationStep / SUBSTEPS) % frameCount : 0;
  const currentFrame: RadarFrame | null = frames[displayFrameIndex] ?? null;

  // Index at which nowcast frames start (used to label the slider in expanded mode).
  const nowcastStartIndex = frames.findIndex((f) => f.kind === 'nowcast');

  const isLoading = capLoading || framesLoading;

  const formatFrameTime = (isoTime: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        // ADR-020: display in station-local time, not browser time.
        timeZone: stationTz ?? 'UTC',
      }).format(new Date(isoTime));
    } catch {
      return isoTime;
    }
  };

  // --- Iframe provider: embed directly ---
  if (!capLoading && radarCapability?.providerId === 'iframe' && radarCapability.iframeUrl) {
    return (
      // h-full so the iframe fills the CardContent flex area (flex-1 min-h-0 on CardContent).
      <div className="flex flex-col h-full gap-2">
        <div
          className="flex-1 min-h-0 rounded-lg overflow-hidden"
          role="region"
          aria-label={t('radarTitle')}
        >
          <iframe
            src={radarCapability.iframeUrl}
            title={t('radarTitle')}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
        {radarCapability.operatorNotes && (
          <p className="text-muted-foreground flex-shrink-0" style={{ fontSize: 'var(--text-label)' }}>{radarCapability.operatorNotes}</p>
        )}
      </div>
    );
  }

  return (
    // flex-col h-full: fills the available CardContent height (flex-1 min-h-0).
    // The map container uses flex-1 min-h-0 so Leaflet fills the available space
    // rather than a fixed pixel height that extends beyond the card.
    <div className="flex flex-col h-full gap-3">
      <div
        className="flex-1 min-h-0 rounded-lg overflow-hidden relative"
        role="region"
        aria-label={t('radarTitle')}
      >
        {isLoading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-muted rounded-lg"
            aria-live="polite"
            aria-atomic="true"
          >
            <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('loading')}</p>
          </div>
        )}

        {!isLoading && (capError || framesError) && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-muted rounded-lg"
            role="alert"
          >
            <p className="text-destructive" style={{ fontSize: 'var(--text-body)' }}>{t('noFrames')}</p>
          </div>
        )}

        {!isLoading && !capError && !framesError && !radarCapability && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-muted rounded-lg"
            role="status"
          >
            <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('noProvider')}</p>
          </div>
        )}

        {!isLoading && frameCount === 0 && radarCapability && !framesError && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-muted rounded-lg"
            role="status"
          >
            <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('noFrames')}</p>
          </div>
        )}

        {/*
          All frame TileLayers are rendered simultaneously so the browser fetches
          and caches every frame's tiles on first load. Cross-fade between frames
          is achieved by computing per-frame opacity via getFrameOpacity — frames
          near the current animationStep are blended together, all others get
          0.001 (invisible but kept alive in Leaflet so tiles stay cached).
          Advancing the animation only changes `animationStep` — no URL swaps, no
          tile re-fetches after the initial load, resulting in smooth looping.

          Each radar TileLayer has a stable key derived from the frame timestamp
          so React never unmounts/remounts a layer between renders (which would
          discard cached tiles). The key is intentional here — it is the correct
          pattern to keep layers stable across re-renders.
        */}
        <MapContainer
          center={center}
          zoom={zoom}
          maxBounds={maxBounds}
          className="h-full w-full"
          style={satelliteActive ? { backgroundColor: '#0a0a1a' } : undefined}
          scrollWheelZoom={false}
          zoomControl={true}
        >
          <MapBoundsEnforcer bounds={maxBounds} />
          {!satelliteActive && (
            <TileLayer
              key={baseTile.url}
              url={baseTile.url}
              attribution={baseTile.attribution}
            />
          )}
          {/* Station location marker */}
          <CircleMarker
            center={center}
            radius={6}
            pathOptions={{ color: '#E80000', fillColor: '#FF3333', fillOpacity: 0.9, weight: 2 }}
          >
            <Tooltip direction="top" offset={[0, -8]} permanent={false}>
              {t('stationMarker')}
            </Tooltip>
          </CircleMarker>
          {/* Satellite tile layers — rendered BELOW radar for correct z-order.
              During preload (!satelliteReady), first frame shows at full opacity
              while all others load at 0.001.  Once ready, cross-fade animation
              starts using the shared play/pause state. */}
          {showSatellite && caddyPrefix && satelliteFrameCount > 0 && satelliteFrames.map((frame, i) => {
            if (!frame.path) return null;
            const satUrl = `${caddyPrefix}${frame.path}/${RAINVIEWER_TILE_SIZE}/{z}/{x}/{y}/0/0_0.webp`;
            const satFrameIndex = i;
            const satOpacity = satelliteReady
              ? Math.max(getFrameOpacity(i, satelliteAnimationStep, satelliteFrameCount, effectiveMaxOpacity), 0.001)
              : (i === 0 ? effectiveMaxOpacity : 0.001);
            return (
              <TileLayer
                key={`sat-${frame.time}`}
                url={satUrl}
                opacity={satOpacity}
                zIndex={100}
                tileSize={512}
                zoomOffset={-1}
                eventHandlers={{
                  load: () => {
                    loadedSatLayersRef.current.add(satFrameIndex);
                    setSatelliteLoadedCount(loadedSatLayersRef.current.size);
                    if (loadedSatLayersRef.current.size >= satelliteFrameCount) {
                      if (satellitePreloadTimerRef.current !== null) {
                        clearTimeout(satellitePreloadTimerRef.current);
                        satellitePreloadTimerRef.current = null;
                      }
                      setSatelliteReady(true);
                    }
                  },
                }}
              />
            );
          })}
          {showRadar !== false && radarCapability !== null && frames.map((frame, i) => {
            // Capture the non-null capability so TypeScript can confirm it inside
            // the map callback closure.
            const cap = radarCapability;
            const url = buildTileUrl(frame, cap, tileHost, effectiveColorScheme);
            if (!url) return null;
            // Capture the loop index in a stable const for use inside closures.
            const frameIndex = i;
            return (
              <TileLayer
                key={frame.time}
                url={url}
                opacity={Math.max(getFrameOpacity(i, animationStep, frameCount, effectiveMaxOpacity), 0.001)}
                zIndex={200}
                attribution={i === 0 ? (radarFrameList?.attribution ?? undefined) : undefined}
                eventHandlers={{
                  load: () => {
                    // Mark this frame as fully loaded. When all frames are ready,
                    // start playback immediately rather than waiting for the
                    // PRELOAD_DELAY_MS fallback timeout.
                    loadedLayersRef.current.add(frameIndex);
                    setRadarLoadedCount(loadedLayersRef.current.size);
                    if (loadedLayersRef.current.size >= frames.length) {
                      if (preloadTimerRef.current !== null) {
                        clearTimeout(preloadTimerRef.current);
                        preloadTimerRef.current = null;
                      }
                      // Respect prefers-reduced-motion for early-start too.
                      if (!prefersReducedMotion) {
                        setIsPlaying(true);
                      }
                    }
                  },
                }}
              />
            );
          })}
          {/* Labels overlay — renders ABOVE satellite and radar so place names
              are always readable on opaque satellite imagery. Only shown when
              satellite is active; otherwise the normal basemap has labels. */}
          {satelliteActive && (
            <TileLayer
              url={SATELLITE_LABELS_URL}
              attribution={SATELLITE_LABELS_ATTRIBUTION}
              zIndex={300}
            />
          )}
          {/* Wind arrow tile overlay (T4.7) — LibreWxR only; best-effort */}
          {showWind && caddyPrefix && (
            <TileLayer
              url={`${caddyPrefix}/v2/wind/{z}/{x}/{y}/arrows.png`}
              opacity={0.6}
              zIndex={500}
            />
          )}

          {/* Alert polygon overlay (T4.6) — GeoJSON polygons from LibreWxR */}
          {showAlerts && alertData && (
            <GeoJSON
              key={JSON.stringify(alertData).slice(0, 100)}
              data={alertData}
              style={(feature) => {
                const severity = feature?.properties?.severity as string | undefined ?? 'Unknown';
                return {
                  color: SEVERITY_COLORS[severity] ?? '#888888',
                  weight: 2,
                  fillOpacity: 0.15,
                  opacity: 0.8,
                };
              }}
              onEachFeature={(feature, layer) => {
                const props = feature.properties ?? {};
                const title = (props.title as string | undefined)
                  || (props.headline as string | undefined)
                  || (props.event as string | undefined)
                  || 'Weather Alert';
                const severity = props.severity as string | undefined;
                const description = props.description as string | undefined;
                const regions = props.regions as string[] | undefined;
                const expires = props.expires as number | undefined;
                let html = `<strong>${title}</strong>`;
                if (severity) html += `<br/><em>${severity}</em>`;
                if (description && description !== title) html += `<br/>${description}`;
                if (regions?.length) html += `<br/>${regions.join(', ')}`;
                if (expires) {
                  const exp = new Date(expires * 1000);
                  // ADR-020/ADR-075: always format in station-local time zone.
                  html += `<br/>Expires: ${exp.toLocaleString(undefined, { timeZone: stationTz ?? 'UTC' })}`;
                }
                layer.bindPopup(html, { maxWidth: 300 });
              }}
            />
          )}
        </MapContainer>

        {/* Tile-load progress indicator — bottom-left pill showing frame counts.
            Disappears once all tiles for each active layer are loaded.
            pointer-events-none so it never blocks map interaction. */}
        {(() => {
          const radarLoading = showRadar !== false && frameCount > 0 && radarLoadedCount < frameCount;
          const satelliteLoading = showSatellite && satelliteFrameCount > 0 && satelliteLoadedCount < satelliteFrameCount;
          const anyLoading = radarLoading || satelliteLoading;
          return anyLoading ? (
            <div
              className="absolute bottom-8 left-3 z-[1000] rounded-lg bg-background/80 backdrop-blur-sm border px-3 py-2 text-xs pointer-events-none select-none"
              role="status"
              aria-live="polite"
            >
              <div className="flex flex-col gap-1">
                {radarLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Radar {radarLoadedCount} / {frameCount}</span>
                  </div>
                )}
                {satelliteLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Satellite {satelliteLoadedCount} / {satelliteFrameCount}</span>
                  </div>
                )}
              </div>
            </div>
          ) : null;
        })()}

        {/* Color legend — visible when radar frames are loaded */}
        {!isLoading && frameCount > 0 && <RadarLegend colorScheme={effectiveColorScheme} />}
      </div>

      {/* Screen-reader live region: announces the current frame timestamp when the
          display frame index changes (play, pause, or manual scrub). Polite so it
          does not interrupt other announcements. aria-atomic so the full string is
          read rather than just the diff. */}
      {frameCount > 0 && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {currentFrame ? formatFrameTime(currentFrame.time) : ''}
          {currentFrame?.kind === 'nowcast' ? ` (${t('nowcastLabel')})` : ''}
        </span>
      )}

      {/* Animation controls — only shown when there are frames to animate.
          flex-shrink-0 keeps the control bar from being squashed by the map.
          Both expanded and card modes show the graphical frame progress bar
          above the button row.  The bar is color-coded: past frames in muted
          color, nowcast frames in primary accent.  "Forecast" label hidden
          on mobile (<768 px) to prevent wordwrap shifts. */}
      {frameCount > 0 && (
        expanded ? (
          <div className="flex flex-col gap-1 flex-shrink-0">
            {/* Graphical frame progress bar */}
            <FrameProgressBar
              frameCount={frameCount}
              displayFrameIndex={displayFrameIndex}
              nowcastStartIndex={nowcastStartIndex}
              onSeek={(idx) => setAnimationStep(idx * SUBSTEPS)}
              ariaLabel={t('timeSlider')}
            />

            {/* Nowcast label — hidden on mobile to avoid wordwrap */}
            {nowcastStartIndex > 0 && frameCount > 1 && (
              <div className="relative hidden md:block" style={{ height: 16 }}>
                <span
                  className="absolute text-primary pointer-events-none"
                  style={{
                    fontSize: 'var(--text-micro)',
                    left: `${(nowcastStartIndex / frameCount) * 100}%`,
                    transform: 'translateX(-50%)',
                    top: 0,
                  }}
                  aria-hidden="true"
                >
                  {t('nowcastLabel')}
                </span>
              </div>
            )}

            {/* Controls row */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                aria-label={t('previousFrame')}
                className="rounded p-1 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <CaretLeft className="h-5 w-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                aria-label={isPlaying ? t('pause') : t('play')}
                className="rounded p-1 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Play className="h-5 w-5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={goNext}
                aria-label={t('nextFrame')}
                className="rounded p-1 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <CaretRight className="h-5 w-5" aria-hidden="true" />
              </button>

              {/* Speed cycle button */}
              <button
                type="button"
                onClick={cycleSpeed}
                aria-label={t('speed')}
                className="rounded px-2 py-1 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 tabular-nums"
                style={{ fontSize: 'var(--text-label)' }}
              >
                {speedMultiplier}x
              </button>

              <span className="text-muted-foreground tabular-nums ml-1" style={{ fontSize: 'var(--text-label)' }}>
                {t('frameOf', { current: displayFrameIndex + 1, total: frameCount })}
              </span>

              {currentFrame && (
                <span className="text-muted-foreground tabular-nums ml-auto" style={{ fontSize: 'var(--text-label)' }}>
                  {formatFrameTime(currentFrame.time)}
                  {currentFrame.kind === 'nowcast' && (
                    <span className="ml-1 text-primary hidden md:inline" aria-label={t('nowcastLabel')}>
                      {t('nowcastLabel')}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* Card-view control bar with graphical frame progress bar */
          <div className="flex flex-col gap-1 flex-shrink-0">
            {/* Graphical frame progress bar */}
            <FrameProgressBar
              frameCount={frameCount}
              displayFrameIndex={displayFrameIndex}
              nowcastStartIndex={nowcastStartIndex}
              onSeek={(idx) => setAnimationStep(idx * SUBSTEPS)}
              ariaLabel={t('timeSlider')}
            />

            {/* Controls row */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                aria-label={t('previousFrame')}
                className="rounded p-1 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <CaretLeft className="h-5 w-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                aria-label={isPlaying ? t('pause') : t('play')}
                className="rounded p-1 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Play className="h-5 w-5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={goNext}
                aria-label={t('nextFrame')}
                className="rounded p-1 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <CaretRight className="h-5 w-5" aria-hidden="true" />
              </button>

              {currentFrame && (
                <span className="text-muted-foreground tabular-nums ml-auto" style={{ fontSize: 'var(--text-label)' }}>
                  {formatFrameTime(currentFrame.time)}
                  {currentFrame.kind === 'nowcast' && (
                    <span className="ml-1 text-primary hidden md:inline" aria-label={t('nowcastLabel')}>
                      {t('nowcastLabel')}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default RadarMap;
