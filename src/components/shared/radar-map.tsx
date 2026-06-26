import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
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

// RainViewer "Universal Blue" (scheme 2) precipitation intensity color stops.
// Source: RainViewer API color-schemes page + rendered tile sampling.
const LEGEND_GRADIENT =
  'linear-gradient(to right, #96C8FA, #0096FA, #00D800, #FFFF00, #FF9600, #E80000, #C000C0)';

function RadarLegend() {
  const { t } = useTranslation('radar');
  return (
    <div
      className="absolute bottom-8 right-2 z-10 flex flex-col gap-0.5 rounded bg-background/80 px-2 py-1.5 backdrop-blur-sm"
      aria-hidden="true"
    >
      <div
        className="h-2.5 w-36 rounded-sm"
        style={{ background: LEGEND_GRADIENT }}
      />
      <div className="flex justify-between text-[10px] leading-tight text-muted-foreground">
        <span>{t('legendLight')}</span>
        <span>{t('legendHeavy')}</span>
      </div>
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
    } else {
      // Remove bounds constraint by passing an empty array.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.setMaxBounds([] as any);
    }
  }, [map, bounds]);
  return null;
}

export function RadarMap({ center, zoom = 7, stationTz, expanded = false, maxBounds, opacity, colorScheme, showAlerts, alertUrl, showWind, caddyPrefix }: RadarMapProps) {
  const { t } = useTranslation('radar');
  const { resolved: resolvedTheme } = useTheme();
  const baseTile = TILE_CONFIG[resolvedTheme];

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
    // Auto-refresh every 5 minutes.
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

  // Live refresh — re-fetch frame metadata at the provider's configured interval.
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
          scrollWheelZoom={false}
          zoomControl={true}
        >
          <MapBoundsEnforcer bounds={maxBounds} />
          <TileLayer
            key={baseTile.url}
            url={baseTile.url}
            attribution={baseTile.attribution}
          />
          {radarCapability !== null && frames.map((frame, i) => {
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
                attribution={i === 0 ? (radarFrameList?.attribution ?? undefined) : undefined}
                eventHandlers={{
                  load: () => {
                    // Mark this frame as fully loaded. When all frames are ready,
                    // start playback immediately rather than waiting for the
                    // PRELOAD_DELAY_MS fallback timeout.
                    loadedLayersRef.current.add(frameIndex);
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
                const headline = (props.headline as string | undefined) || (props.event as string | undefined) || 'Weather Alert';
                layer.bindPopup(`<strong>${headline}</strong>`);
              }}
            />
          )}
        </MapContainer>

        {/* Color legend — visible when radar frames are loaded */}
        {!isLoading && frameCount > 0 && <RadarLegend />}
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
          Expanded mode shows a time slider above the button row; card mode
          shows the compact button row only. */}
      {frameCount > 0 && (
        expanded ? (
          <div className="flex flex-col gap-2 flex-shrink-0">
            {/* Time slider */}
            <div className="relative">
              <input
                type="range"
                min={0}
                max={Math.max(frameCount - 1, 0)}
                value={displayFrameIndex}
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  setAnimationStep(idx * SUBSTEPS);
                }}
                className="w-full accent-primary"
                aria-label={t('timeSlider')}
                aria-valuetext={currentFrame ? formatFrameTime(currentFrame.time) : ''}
              />
              {/* Nowcast start marker label */}
              {nowcastStartIndex > 0 && frameCount > 1 && (
                <span
                  className="absolute top-full mt-0.5 text-primary pointer-events-none"
                  style={{
                    fontSize: 'var(--text-label)',
                    left: `${(nowcastStartIndex / (frameCount - 1)) * 100}%`,
                    transform: 'translateX(-50%)',
                  }}
                  aria-hidden="true"
                >
                  {t('nowcastLabel')}
                </span>
              )}
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2 mt-4">
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
                    <span className="ml-1 text-primary" aria-label={t('nowcastLabel')}>
                      {t('nowcastLabel')}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* Compact card-view control bar (unchanged) */
          <div className="flex items-center gap-2 flex-shrink-0">
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

            <span className="text-muted-foreground tabular-nums ml-1" style={{ fontSize: 'var(--text-label)' }}>
              {t('frameOf', { current: displayFrameIndex + 1, total: frameCount })}
            </span>

            {currentFrame && (
              <span className="text-muted-foreground tabular-nums ml-auto" style={{ fontSize: 'var(--text-label)' }}>
                {formatFrameTime(currentFrame.time)}
                {currentFrame.kind === 'nowcast' && (
                  <span className="ml-1 text-primary" aria-label={t('nowcastLabel')}>
                    {t('nowcastLabel')}
                  </span>
                )}
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default RadarMap;
