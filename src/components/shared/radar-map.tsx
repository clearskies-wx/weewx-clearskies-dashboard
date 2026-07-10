import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { MapContainer, TileLayer, CircleMarker, Tooltip, GeoJSON, ScaleControl, useMap } from 'react-leaflet';
import { Play, Pause, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { leafletLayer, LineSymbolizer } from 'protomaps-leaflet';
import type { PaintRule } from 'protomaps-leaflet';
import { PMTiles } from 'pmtiles';
import { useCapabilities, useRadarFrames } from '../../hooks/useWeatherData';
import type { CapabilityDeclaration, RadarFrame } from '../../api/types';
import { useTheme } from '../../lib/theme-provider';
import { OSM_ATTRIBUTION, CARTO_OSM_ATTRIBUTION, OSM_ODBL_ATTRIBUTION } from '../../lib/map-attribution';
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

// Cap frame count in card view to keep animation tight and memory manageable.
const MAX_CARD_FRAMES = 24;

// Target full-loop duration. Tick interval is derived from frame count so
// short frame lists (e.g. 6 frames) don't blaze through in 3 seconds.
const TARGET_LOOP_MS = 17000;

// Number of frames that must load before auto-play begins.
// Replaces the old LAYER_BUFFER-based threshold (LAYER_BUFFER was removed when
// switching from display:none/mount-churn to permanent visibility:hidden layers).
const PRELOAD_FRAME_COUNT = 7;

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
  arrowStyle: 'light' | 'dark' | null = null,
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
    // Wind arrows via ?arrows= query parameter (LibreWxR only).
    // LibreWxR renders directional wind barbs directly onto radar tiles when
    // this param is present. RainViewer tiles don't support it.
    if (arrowStyle && capability.caddyPrefix) {
      url += `?arrows=${arrowStyle}`;
    }
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
  // Hard-cut: only the current frame is visible. No cross-fade — two
  // overlapping semi-transparent radar layers create a double-image flash.
  // Per RainViewer reference: old frame → 0, new frame → target opacity.
  const primaryFrame = Math.floor(step / SUBSTEPS) % totalFrames;
  return frameIndex === primaryFrame ? effectiveMaxOpacity : 0;
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
    attribution: OSM_ATTRIBUTION,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_OSM_ATTRIBUTION,
  },
} as const;

const SATELLITE_OVERLAY_ATTRIBUTION = CARTO_OSM_ATTRIBUTION;
const SATELLITE_LABELS_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';

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
      const minZoom = map.getBoundsZoom(boundsObj, true);
      map.setMinZoom(minZoom);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.setMaxBounds([] as any);
      map.setMinZoom(0);
    }
  }, [map, bounds]);
  return null;
}

/**
 * BoundsMask — renders an opaque polygon covering the entire world EXCEPT the
 * BBOX, creating a hard visual cutoff at the map edges.  Leaflet maxBounds only
 * restricts panning; tiles at the viewport edges still extend beyond the boundary.
 * This overlay sits on top of all layers and hides everything outside the BBOX so
 * satellite, radar, and base map all clip cleanly.
 *
 * Uses imperative Leaflet API (not the GeoJSON component) to avoid renderer
 * lifecycle issues with custom panes.
 */
function BoundsMask({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const map = useMap();
  const { resolved } = useTheme();
  const fillColor = resolved === 'dark' ? '#0a0a1a' : '#ffffff';

  useEffect(() => {
    const [[south, west], [north, east]] = bounds;

    const outer: L.LatLngTuple[] = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
    const hole: L.LatLngTuple[] = [[south, west], [north, west], [north, east], [south, east]];

    const mask = L.polygon([outer, hole], {
      fillColor,
      fillOpacity: 1,
      stroke: false,
      interactive: false,
    });

    mask.addTo(map);
    const el = mask.getElement() as HTMLElement | undefined;
    if (el) {
      el.style.zIndex = '9999';
      el.style.pointerEvents = 'none';
    }

    return () => { mask.remove(); };
  }, [map, bounds, fillColor]);

  return null;
}


/**
 * GeoFeaturesLayer — adds a protomaps-leaflet Canvas vector tile layer for geographic
 * context (boundaries, roads, water) when satellite view is active.
 *
 * Self-contained: checks /api/v1/geographic-features/status on mount. If available is
 * false (PMTiles file not yet downloaded), does nothing — no error, no console warning.
 * Renders null (no DOM output); the layer is added imperatively to the Leaflet map.
 * Sits below alert polygons (zIndex 350, alerts use Leaflet default SVG overlay above).
 */
const GEO_FEATURES_PAINT_RULES: PaintRule[] = [
  {
    dataLayer: 'earth',
    symbolizer: new LineSymbolizer({
      color: '#ffffff',
      width: 1.5,
      opacity: 0.7,
    }),
  },
  {
    dataLayer: 'boundaries',
    symbolizer: new LineSymbolizer({
      color: '#ffffff',
      width: 1.5,
      opacity: 0.7,
    }),
  },
  {
    dataLayer: 'roads',
    symbolizer: new LineSymbolizer({
      color: '#999999',
      width: 1,
      opacity: 0.5,
    }),
    filter: (_zoom: number, feature: { props: Record<string, unknown> }) => {
      const kind = feature.props['kind'];
      return kind === 'highway' || kind === 'major_road';
    },
  },
  {
    dataLayer: 'water',
    symbolizer: new LineSymbolizer({
      color: '#4a90d9',
      width: 1,
      opacity: 0.6,
    }),
    filter: (_zoom: number, feature: { props: Record<string, unknown> }) => {
      return feature.props['kind'] !== 'ocean';
    },
  },
];

function GeoFeaturesLayer() {
  const map = useMap();

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let layer: any = null;

    async function init() {
      try {
        const resp = await fetch('/api/v1/geographic-features/status');
        if (!resp.ok || cancelled) return;
        const status = await resp.json() as { available?: boolean };
        if (!status.available || cancelled) return;

        // Create a custom pane above satellite/radar tiles (z200) and labels (z300)
        // but below alert polygons (overlay pane, z400).
        if (!map.getPane('geoFeaturesPane')) {
          const pane = map.createPane('geoFeaturesPane');
          pane.style.zIndex = '350';
        }

        // PMTiles v4 from our dependency vs v3 bundled in protomaps-leaflet —
        // runtime-compatible but types diverge. Cast to satisfy both.
        const pmtiles = new PMTiles('/api/v1/geographic-features/tiles');
        layer = leafletLayer({
          url: pmtiles as any,  // eslint-disable-line @typescript-eslint/no-explicit-any
          paintRules: GEO_FEATURES_PAINT_RULES,
          labelRules: [],
          attribution: OSM_ODBL_ATTRIBUTION,
          pane: 'geoFeaturesPane',
        });
        layer.addTo(map);
      } catch {
        // Geographic features are non-critical — never surface errors to users.
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (layer !== null) {
        map.removeLayer(layer);
      }
    };
  }, [map]);

  return null;
}

export function RadarMap({ center, zoom = 7, stationTz, expanded = false, maxBounds, opacity, colorScheme, showAlerts, alertUrl, showWind, caddyPrefix, showSatellite, showRadar }: RadarMapProps) {
  const { t } = useTranslation(['radar', 'common']);
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

  // When satellite is active, exclude nowcast frames so radar and satellite
  // have matching frame counts (both 24) for consistent animation cadence.
  // The original `frames` variable is kept for reference; downstream code
  // uses `activeFrames` so the satellite/radar tick rates stay in lock-step.
  const activeFrames: RadarFrame[] = satelliteActive
    ? frames.filter((f) => f.kind !== 'nowcast')
    : frames;

  // Wind arrow style for LibreWxR's ?arrows= query parameter on radar tiles.
  // Picks light arrows on dark backgrounds (satellite or dark theme) and dark
  // arrows on light backgrounds so the barbs stay visible against any basemap.
  const arrowStyle: 'light' | 'dark' | null = !showWind ? null
    : (satelliteActive || resolvedTheme === 'dark') ? 'light' : 'dark';

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
  // animationStep lives in a REF, not state.  The setInterval tick updates
  // opacity on cached Leaflet layer instances imperatively (no React render).
  // Only displayFrameIndex is state — it drives the progress bar and updates
  // once per keyframe, not once per sub-step.
  const animationStepRef = useRef(0);
  const [displayFrameIndex, setDisplayFrameIndex] = useState(0);
  // Start paused; auto-play begins when PRELOAD_FRAME_COUNT layers fire load.
  const [isPlaying, setIsPlaying] = useState(false);
  // Tracks which frame indices have fully loaded all their tiles.
  const loadedLayersRef = useRef(new Set<number>());

  // Refs to Leaflet layer instances for imperative opacity control.
  const radarLayerRefs = useRef<Map<number, L.TileLayer>>(new Map());
  const satLayerRefs = useRef<Map<number, L.TileLayer>>(new Map());

  // Stable event-handler objects per frame index.  Cached in refs so
  // react-leaflet sees the same object reference across re-renders and
  // does not detach/reattach event listeners on every progress-bar update.
  const radarHandlersRef = useRef<Map<number, Record<string, () => void>>>(new Map());
  const satHandlersRef = useRef<Map<number, Record<string, () => void>>>(new Map());

  // --- Satellite animation state (independent frame index, shared play/pause) ---
  const satelliteStepRef = useRef(0);
  // Satellite preload: tiles must load before animation starts, otherwise
  // frames flicker (visible when cached, blank when still loading).
  const [satelliteReady, setSatelliteReady] = useState(false);
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
        // Pass BBOX so LibreWxR filters to alerts within the provider's
        // coverage area.  Format: west,south,east,north.
        let url = alertUrl!;
        if (maxBounds) {
          const [[south, west], [north, east]] = maxBounds;
          url += `?bbox=${west},${south},${east},${north}`;
        }
        const resp = await fetch(url);
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
  }, [showAlerts, alertUrl, maxBounds]);

  const frameCount = activeFrames.length;

  // Resolve effective opacity and color scheme from props, falling back to defaults.
  const effectiveMaxOpacity = opacity ?? MAX_OPACITY;
  const effectiveColorScheme = colorScheme ?? RAINVIEWER_COLOR;

  // Adaptive tick interval — target ~17s full loop regardless of frame count.
  // In expanded mode, the speed multiplier shortens/lengthens the effective interval.
  const tickMs = frameCount > 0
    ? Math.max(50, Math.floor(TARGET_LOOP_MS / (frameCount * SUBSTEPS)))
    : TICK_MS;

  const effectiveTickMs = Math.max(30, Math.round(tickMs / speedMultiplier));

  // Apply the current animationStepRef to cached Leaflet radar layers.
  // Uses only Leaflet's setOpacity() — no direct container style manipulation.
  // setOpacity(0) is cheap (Chromium skips compositing opacity:0 layers) and
  // keeps tiles in cache. Per RainViewer's reference implementation, opacity
  // is the correct way to show/hide pre-loaded tile layers.
  const applyRadarStep = useCallback((step: number) => {
    animationStepRef.current = step;
    radarLayerRefs.current.forEach((layer, i) => {
      const next = getFrameOpacity(i, step, frameCount, effectiveMaxOpacity);
      layer.setOpacity(next);
    });
    const frame = frameCount > 0 ? Math.floor(step / SUBSTEPS) % frameCount : 0;
    setDisplayFrameIndex((prev) => (prev !== frame ? frame : prev));
  }, [frameCount, effectiveMaxOpacity]);

  const applySatStep = useCallback((step: number) => {
    satelliteStepRef.current = step;
    satLayerRefs.current.forEach((layer, i) => {
      const next = getFrameOpacity(i, step, satelliteFrameCount, effectiveMaxOpacity);
      layer.setOpacity(next);
    });
  }, [satelliteFrameCount, effectiveMaxOpacity]);

  const findNearestSatFrame = useCallback((radarIdx: number): number => {
    if (satelliteFrameCount === 0 || radarIdx < 0 || radarIdx >= activeFrames.length) return 0;
    const targetMs = new Date(activeFrames[radarIdx].time).getTime();
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < satelliteFrames.length; i++) {
      const diff = Math.abs(new Date(satelliteFrames[i].time).getTime() - targetMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [activeFrames, satelliteFrames, satelliteFrameCount]);

  const seekToRadarFrame = useCallback((radarIdx: number) => {
    applyRadarStep(radarIdx * SUBSTEPS);
    if (satelliteActive) {
      applySatStep(findNearestSatFrame(radarIdx) * SUBSTEPS);
    }
  }, [applyRadarStep, applySatStep, satelliteActive, findNearestSatFrame]);

  const goNext = useCallback(() => {
    if (frameCount > 0) {
      const currentKey = Math.floor(animationStepRef.current / SUBSTEPS);
      seekToRadarFrame((currentKey + 1) % frameCount);
    }
  }, [frameCount, seekToRadarFrame]);

  const goPrev = useCallback(() => {
    if (frameCount > 0) {
      const currentKey = Math.floor(animationStepRef.current / SUBSTEPS);
      seekToRadarFrame((currentKey - 1 + frameCount) % frameCount);
    }
  }, [frameCount, seekToRadarFrame]);

  // Clamp animationStep when frames change; start the preload delay when a new
  // frame list arrives so the browser has time to fetch tiles before animation starts.
  useEffect(() => {
    if (frameCount === 0) return;

    // Reset to step 0 on new frame list.
    animationStepRef.current = 0;
    setDisplayFrameIndex(0);

    // Reset tile-load tracking for the new frame list.
    // Animation starts only when PRELOAD_FRAME_COUNT layers fire their
    // load event — no fallback timer that would start before tiles are ready.
    loadedLayersRef.current = new Set<number>();
    setRadarLoadedCount(0);
  }, [frameCount]);

  // Reset satellite preload when frames change or satellite is toggled on.
  useEffect(() => {
    if (!showSatellite || satelliteFrameCount === 0) {
      setSatelliteReady(false);
      loadedSatLayersRef.current = new Set<number>();
      setSatelliteLoadedCount(0);
      return;
    }

    satelliteStepRef.current = 0;
    setSatelliteReady(false);
    loadedSatLayersRef.current = new Set<number>();
    setSatelliteLoadedCount(0);
  }, [showSatellite, satelliteFrameCount]);

  // Build stable event-handler objects synchronously during render (not in
  // useEffect) so they're available on the FIRST render when TileLayer
  // components mount. Ref mutation during render is safe — no side effects.
  if (radarHandlersRef.current.size !== frameCount) {
    radarHandlersRef.current.clear();
    for (let fi = 0; fi < frameCount; fi++) {
      radarHandlersRef.current.set(fi, {
        loading: () => {
          loadedLayersRef.current.delete(fi);
          setRadarLoadedCount(loadedLayersRef.current.size);
        },
        load: () => {
          loadedLayersRef.current.add(fi);
          setRadarLoadedCount(loadedLayersRef.current.size);
          if (loadedLayersRef.current.size >= Math.min(frameCount, PRELOAD_FRAME_COUNT)) {
            if (!prefersReducedMotion) {
              setIsPlaying(true);
            }
          }
        },
      });
    }
  }
  if (satHandlersRef.current.size !== satelliteFrameCount) {
    satHandlersRef.current.clear();
    for (let fi = 0; fi < satelliteFrameCount; fi++) {
      satHandlersRef.current.set(fi, {
        loading: () => {
          loadedSatLayersRef.current.delete(fi);
          setSatelliteLoadedCount(loadedSatLayersRef.current.size);
          setSatelliteReady(false);
        },
        load: () => {
          loadedSatLayersRef.current.add(fi);
          setSatelliteLoadedCount(loadedSatLayersRef.current.size);
          if (loadedSatLayersRef.current.size >= Math.min(satelliteFrameCount, PRELOAD_FRAME_COUNT)) {
            setSatelliteReady(true);
          }
        },
      });
    }
  }

  // Pause animation when idle.
  useEffect(() => {
    if (isIdle) {
      setIsPlaying(false);
    }
  }, [isIdle]);

  // Self-scheduling setTimeout animation loop.  Unlike setInterval, each
  // tick schedules the next AFTER the current one's work completes.  This
  // prevents callback queuing during browser busy periods (compositor work,
  // GC pauses) which causes the fast-slow-fast cadence with setInterval.
  // Pattern matches the RainViewer reference implementation.
  //
  // Opacity changes are imperative (Leaflet setOpacity on cached layer refs)
  // so the tick callback is lightweight — no React re-render per sub-step.
  // displayFrameIndex state updates only on keyframe boundaries.
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const radarActive = isPlaying && frameCount > 1;
    const satActive = isPlaying && satelliteReady && showSatellite && satelliteFrameCount > 1;

    if (!radarActive && !satActive) {
      if (animTimerRef.current !== null) {
        clearTimeout(animTimerRef.current);
        animTimerRef.current = null;
      }
      return;
    }

    const satTickMs = satActive
      ? Math.max(30, Math.round(
          Math.max(50, Math.floor(TARGET_LOOP_MS / (satelliteFrameCount * SUBSTEPS)))
          / speedMultiplier))
      : Infinity;

    const radarTotal = frameCount * SUBSTEPS;
    const satTotal = satelliteFrameCount * SUBSTEPS;

    let satAcc = 0;

    function tick() {
      if (radarActive) {
        applyRadarStep((animationStepRef.current + 1) % radarTotal);
      }

      if (satActive) {
        satAcc += effectiveTickMs;
        if (satAcc >= satTickMs) {
          satAcc -= satTickMs;
          applySatStep((satelliteStepRef.current + 1) % satTotal);
        }
      }

      animTimerRef.current = setTimeout(tick, effectiveTickMs);
    }

    animTimerRef.current = setTimeout(tick, effectiveTickMs);
    return () => {
      if (animTimerRef.current !== null) {
        clearTimeout(animTimerRef.current);
        animTimerRef.current = null;
      }
    };
  }, [isPlaying, frameCount, effectiveTickMs, satelliteReady, showSatellite, satelliteFrameCount, speedMultiplier, applyRadarStep, applySatStep]);

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

  // displayFrameIndex is now state, updated by applyRadarStep on keyframe boundaries.
  const currentFrame: RadarFrame | null = activeFrames[displayFrameIndex] ?? null;

  // Index at which nowcast frames start (used to label the slider in expanded mode).
  // When satellite is active, nowcast frames are excluded from activeFrames, so this
  // returns -1 — FrameProgressBar and the nowcast label both guard on > 0, so -1
  // safely means "no nowcast segment shown."
  const nowcastStartIndex = activeFrames.findIndex((f) => f.kind === 'nowcast');

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
          All frame TileLayers remain mounted permanently. Inactive layers are
          hidden via setOpacity(0) — Leaflet's native method, keeps tiles cached,
          costs nothing on the GPU compositor (Chromium skips opacity:0 layers).
          No direct container style manipulation (display/visibility) — that
          fights Leaflet's internal _updateOpacity fade-in animation and causes
          brightness pulsing. Tile prefetching via new Image() populates the
          browser HTTP cache before animation starts.
        */}
        <MapContainer
          center={center}
          zoom={zoom}
          maxBounds={maxBounds}
          className="h-full w-full"
          style={satelliteActive ? { backgroundColor: '#0a0a1a' } : undefined}
          scrollWheelZoom={false}
          zoomControl={true}
          preferCanvas={true}
        >
          <MapBoundsEnforcer bounds={maxBounds} />
          {maxBounds && <BoundsMask bounds={maxBounds} />}
          {!satelliteActive && (
            <TileLayer
              key={baseTile.url}
              url={baseTile.url}
              attribution={baseTile.attribution}
            />
          )}
          <ScaleControl position="topleft" imperial metric={false} />
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
              while all others load at 0.  Once ready, cross-fade animation
              starts using the shared play/pause state. */}
          {showSatellite && caddyPrefix && satelliteFrameCount > 0 && satelliteFrames.map((frame, i) => {
            if (!frame.path) return null;
            const satUrl = `${caddyPrefix}${frame.path}/${RAINVIEWER_TILE_SIZE}/{z}/{x}/{y}/0/0_0.webp`;
            const satInitialOpacity = i === 0 ? effectiveMaxOpacity : 0;
            return (
              <TileLayer
                key={`sat-${frame.time}`}
                url={satUrl}
                opacity={satInitialOpacity}
                zIndex={100}
                tileSize={512}
                zoomOffset={-1}
                ref={(layer: L.TileLayer | null) => {
                  if (layer) satLayerRefs.current.set(i, layer);
                  else satLayerRefs.current.delete(i);
                }}
                eventHandlers={satHandlersRef.current.get(i)}
              />
            );
          })}
          {showRadar !== false && radarCapability !== null && activeFrames.map((frame, i) => {
            const cap = radarCapability;
            const url = buildTileUrl(frame, cap, tileHost, effectiveColorScheme, arrowStyle);
            if (!url) return null;
            return (
              <TileLayer
                key={frame.time}
                url={url}
                opacity={i === 0 ? effectiveMaxOpacity : 0}
                zIndex={200}
                attribution={i === 0 ? (radarFrameList?.attribution ?? undefined) : undefined}
                ref={(layer: L.TileLayer | null) => {
                  if (layer) radarLayerRefs.current.set(i, layer);
                  else radarLayerRefs.current.delete(i);
                }}
                eventHandlers={radarHandlersRef.current.get(i)}
              />
            );
          })}
          {/* Labels overlay — city/state names on top of everything so they're
              always readable. Voyager labels have bolder text than Positron. */}
          {satelliteActive && (
            <TileLayer
              url={SATELLITE_LABELS_URL}
              attribution={SATELLITE_OVERLAY_ATTRIBUTION}
              zIndex={300}
            />
          )}
          {/* Geographic features vector tile overlay (ADR-078) — boundaries, roads, water.
              Rendered below alert polygons and wind arrows. Only active in satellite view
              (basemap already includes roads/boundaries; no overlay needed). */}
          {satelliteActive && <GeoFeaturesLayer />}
          {/* Wind arrows (T4.7) — rendered via ?arrows=light|dark query param on
              radar tiles (see buildTileUrl). No separate layer needed. */}

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
                  || t('radar.weatherAlert', { ns: 'common' });
                const severity = props.severity as string | undefined;
                const description = props.description as string | undefined;
                const regions = props.regions as string[] | undefined;
                const expires = props.expires as number | undefined;
                const uid = `ap${Math.random().toString(36).slice(2, 8)}`;

                let detail = '';
                if (severity) detail += `<em>${severity}</em><br/>`;
                if (description && description !== title) detail += `${description}<br/>`;
                if (regions?.length) detail += `${regions.join('; ')}<br/>`;
                if (expires) {
                  const exp = new Date(expires * 1000);
                  detail += `Expires: ${exp.toLocaleString(undefined, { timeZone: stationTz ?? 'UTC' })}`;
                }

                const html = `<div style="font-size:13px;line-height:1.4">`
                  + `<strong>${title}</strong>`
                  + (detail ? `<div style="margin-top:6px">`
                    + `<a href="#" id="${uid}-tog" onclick="`
                    + `var d=document.getElementById('${uid}-det'),a=this;`
                    + `if(d.style.display==='none'){d.style.display='block';a.textContent='▲'}`
                    + `else{d.style.display='none';a.textContent='▼'}`
                    + `;return false" style="display:inline-block;width:24px;height:24px;line-height:24px;`
                    + `text-align:center;border-radius:4px;background:#e5e7eb;color:#374151;`
                    + `text-decoration:none;font-size:11px;vertical-align:middle;cursor:pointer">▼</a>`
                    + `<div id="${uid}-det" style="display:none;margin-top:8px;padding-top:8px;`
                    + `border-top:1px solid #e5e7eb;max-height:250px;overflow-y:auto">`
                    + detail
                    + `</div></div>` : '')
                  + `</div>`;

                layer.on('click', (e: L.LeafletMouseEvent) => {
                  const map = e.target._map ?? (layer as unknown as { _map: L.Map })._map;
                  if (!map) return;
                  const containerPt = map.latLngToContainerPoint(e.latlng);
                  const mapSize = map.getSize();
                  const nearTop = containerPt.y < mapSize.y * 0.35;
                  const popup = L.popup({
                    maxWidth: 360,
                    autoPan: false,
                    offset: nearTop ? L.point(0, 10) : L.point(0, -10),
                    className: nearTop ? 'leaflet-popup-below' : '',
                  })
                    .setLatLng(e.latlng)
                    .setContent(html)
                    .openOn(map);
                  if (nearTop) {
                    const tip = popup.getElement()?.querySelector('.leaflet-popup-tip-container') as HTMLElement | null;
                    const wrapper = popup.getElement()?.querySelector('.leaflet-popup-content-wrapper') as HTMLElement | null;
                    if (tip) { tip.style.top = '-11px'; tip.style.transform = 'rotate(180deg)'; }
                    if (wrapper) wrapper.style.marginTop = '12px';
                  }
                });
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
              onSeek={(idx) => seekToRadarFrame(idx)}
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
              onSeek={(idx) => seekToRadarFrame(idx)}
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
