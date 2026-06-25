import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, Pane } from 'react-leaflet';
import { Play, Pause, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useCapabilities, useRadarFrames } from '../../hooks/useWeatherData';
import { getRadarLayerFrames, getAlerts } from '../../api/client';
import type { CapabilityDeclaration, RadarFrame, RadarFrameList, LayerDeclaration } from '../../api/types';
import type { Feature, FeatureCollection } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import { useTheme } from '../../lib/theme-provider';

interface RadarMapProps {
  center: [number, number];
  zoom?: number;
  /**
   * IANA timezone string for the station (e.g. "America/Chicago").
   * Used to format frame timestamps in station-local time (ADR-020).
   * Defaults to UTC when absent.
   */
  stationTz?: string;
  /**
   * When true, the component is rendered in the expanded /radar page view.
   * Expanded view shows full frame history; card view caps at 24 frames (T3.5).
   */
  expanded?: boolean;
  /**
   * T4.2 — External animation control for the expanded view.
   * When provided, RadarMap uses this frame index instead of its own internal
   * animationStep. The TimeSlider in the expanded view drives this value.
   * Uses the "primary frame" index (0-based), not the sub-step index.
   */
  externalFrameIndex?: number;
  /**
   * T4.2 — Callback invoked when frames are loaded so the parent (expanded
   * view) can drive the TimeSlider from the actual frame list.
   */
  onFramesLoaded?: (frames: RadarFrame[]) => void;
  /**
   * T4.5 — External opacity override (0–1 float).
   * When provided, overrides the internal MAX_OPACITY for all radar tile layers.
   * Driven by the opacity slider in the expanded view's layer panel.
   */
  opacityOverride?: number;
  /**
   * T4.4 — External color scheme override.
   * When provided, overrides the internal colorScheme state. Driven by the
   * color scheme picker in the layer panel (LibreWxR only).
   */
  colorSchemeOverride?: number;
  /**
   * T4.6–T4.8 — Set of layer IDs currently enabled in the layer panel.
   * Controls which satellite, SPC overlay, and alert polygon layers are rendered.
   * When undefined, default behavior applies (all default-enabled layers visible).
   */
  enabledLayers?: Set<string>;
}

const SUBSTEPS = 5;        // interpolation steps between each real frame pair
const MAX_OPACITY = 0.7;   // max radar overlay opacity

// Target loop duration for adaptive animation speed (T3.5).
// Keeps the animation loop near 18 seconds regardless of frame count.
const TARGET_LOOP_DURATION_MS = 18_000;

// Minimum tick interval — prevents animation from being so fast tiles can't keep up.
const MIN_TICK_MS = 30;

// Card-view frame cap: limit to most-recent N frames to keep animation manageable (T3.5).
// The expanded view (/radar page, Phase 4) will show the full history.
const CARD_FRAME_CAP = 24;

// How long to wait after frames load before starting auto-play.
// Gives the browser time to begin fetching tiles for all frames so the first
// loop isn't visibly stuttery while tiles are still in-flight.
const PRELOAD_DELAY_MS = 1500;

// RainViewer tile defaults.
// {size}    — tile size in pixels; 512 is the high-DPI option (also valid: 256).
// {color}   — colour scheme index; 2 = "Universal Blue" (meteorological standard).
// {options} — "<smooth>_<snow>"; 0_0 = no smoothing, no snow highlight.
// These are display preferences that belong in the dashboard, not the API.
// The CAPABILITY template keeps the placeholders generic; we resolve them here
// so Leaflet never sees an unknown {variable} and throws.
const RAINVIEWER_TILE_SIZE = 512;
const RAINVIEWER_OPTIONS = '0_0';

// Default color scheme index. 2 = "Universal Blue" (meteorological standard).
const DEFAULT_COLOR_SCHEME = 2;

function buildTileUrl(
  frame: RadarFrame,
  capability: CapabilityDeclaration,
  tileHost: string | null,
  colorScheme: number,
): string | null {
  // T3.1 — LibreWxR tiles go through the API proxy.
  // The URL uses Leaflet's {z}/{x}/{y} placeholders so Leaflet handles
  // tile coordinate substitution as normal. Time and color are query params
  // baked into the template URL at frame-switch time.
  if (capability.providerId === 'librewxr') {
    const t = encodeURIComponent(frame.time);
    return `/api/v1/radar/providers/librewxr/tiles/{z}/{x}/{y}?t=${t}&color=${colorScheme}`;
  }

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

  return null;
}


function getFrameOpacity(frameIndex: number, step: number, totalFrames: number, maxOpacity: number = MAX_OPACITY): number {
  const primaryFrame = Math.floor(step / SUBSTEPS) % totalFrames;
  const subStep = step % SUBSTEPS;
  const nextFrame = (primaryFrame + 1) % totalFrames;

  if (subStep === 0) {
    return frameIndex === primaryFrame ? maxOpacity : 0;
  }

  // Constant-composite cross-fade: compute opacities so two overlapping
  // semi-transparent layers composite to exactly maxOpacity throughout.
  // Formula: composite = 1 - (1-a)(1-b) = maxOpacity
  // Solved: a = 1 - transparency^(1-t), b = 1 - transparency^t
  const t = subStep / SUBSTEPS;
  const transparency = 1 - maxOpacity;
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

export function RadarMap({
  center,
  zoom = 7,
  stationTz,
  expanded = false,
  externalFrameIndex,
  onFramesLoaded,
  opacityOverride,
  colorSchemeOverride,
  enabledLayers,
}: RadarMapProps) {
  const { t } = useTranslation('radar');
  const { resolved: resolvedTheme } = useTheme();
  const baseTile = TILE_CONFIG[resolvedTheme];

  // T3.1 / T4.4 — color scheme state. Default 2 = "Universal Blue".
  // colorSchemeOverride (from the layer panel picker) takes precedence when set.
  const [colorScheme] = useState<number>(DEFAULT_COLOR_SCHEME);
  const effectiveColorScheme = colorSchemeOverride ?? colorScheme;

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

  const { data: radarFrameList, loading: framesLoading, error: framesError } = useRadarFrames(providerId);

  // T3.2 — NOAA dual-layer: fetch per-sub-layer frames when the provider is NOAA
  // and the capability includes a layers array. The NEXRAD layer (first enabled
  // radar-type layer) drives the animation timeline; MRMS renders in sync.
  const isNoaa = providerId === 'noaa';
  const capabilityLayers = radarCapability?.layers ?? null;
  const enabledRadarLayers: LayerDeclaration[] | null = isNoaa && capabilityLayers
    ? capabilityLayers.filter((l) => l.layerType === 'radar' && l.defaultEnabled)
    : null;

  // Stable string key for the NOAA layer set — used as a useEffect dep.
  const noaaLayerIdsKey = enabledRadarLayers?.map((l) => l.layerId).join(',') ?? '';

  const [noaaLayerFrameLists, setNoaaLayerFrameLists] = useState<Record<string, RadarFrameList>>({});
  const [noaaLayersLoading, setNoaaLayersLoading] = useState(false);

  useEffect(() => {
    if (!enabledRadarLayers || enabledRadarLayers.length === 0 || !providerId) {
      setNoaaLayerFrameLists({});
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setNoaaLayersLoading(true);

    Promise.all(
      enabledRadarLayers.map((layer) =>
        getRadarLayerFrames(providerId, layer.layerId, controller.signal)
          .then((resp) => ({ layerId: layer.layerId, frameList: resp.data }))
          .catch(() => ({ layerId: layer.layerId, frameList: null as RadarFrameList | null })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const merged: Record<string, RadarFrameList> = {};
      for (const r of results) {
        if (r.frameList) merged[r.layerId] = r.frameList;
      }
      setNoaaLayerFrameLists(merged);
      setNoaaLayersLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  // noaaLayerIdsKey is a stable string encoding of enabledRadarLayers ids.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, noaaLayerIdsKey]);

  // ---------------------------------------------------------------------------
  // T4.6 — Satellite layer frame fetching.
  // When the provider is NOAA and a satellite layer is enabled, fetch its frames
  // so the satellite TileLayer can animate in sync with radar.
  // ---------------------------------------------------------------------------

  // All satellite-type layers from the capability declaration.
  const allSatelliteLayers: LayerDeclaration[] = isNoaa && capabilityLayers
    ? capabilityLayers.filter((l) => l.layerType === 'satellite')
    : [];

  // Only fetch frames for satellite layers that are currently enabled in the panel.
  const activeSatelliteLayers: LayerDeclaration[] = enabledLayers
    ? allSatelliteLayers.filter((l) => enabledLayers.has(l.layerId))
    : [];

  const satelliteLayerIdsKey = activeSatelliteLayers.map((l) => l.layerId).join(',');

  const [satelliteFrameLists, setSatelliteFrameLists] = useState<Record<string, RadarFrameList>>({});

  useEffect(() => {
    if (activeSatelliteLayers.length === 0 || !providerId) {
      setSatelliteFrameLists({});
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    Promise.all(
      activeSatelliteLayers.map((layer) =>
        getRadarLayerFrames(providerId, layer.layerId, controller.signal)
          .then((resp) => ({ layerId: layer.layerId, frameList: resp.data }))
          .catch(() => ({ layerId: layer.layerId, frameList: null as RadarFrameList | null })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const merged: Record<string, RadarFrameList> = {};
      for (const r of results) {
        if (r.frameList) merged[r.layerId] = r.frameList;
      }
      setSatelliteFrameLists(merged);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  // satelliteLayerIdsKey encodes which satellite layers are active.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, satelliteLayerIdsKey]);

  // ---------------------------------------------------------------------------
  // T4.7 — SPC overlay GeoJSON fetching.
  // Fetches GeoJSON from the ArcGIS REST endpoint when an overlay layer is enabled.
  // Auto-refreshes every 5 minutes. NOT time-animated.
  // ---------------------------------------------------------------------------

  const allOverlayLayers: LayerDeclaration[] = isNoaa && capabilityLayers
    ? capabilityLayers.filter((l) => l.layerType === 'overlay')
    : [];

  const activeOverlayLayers: LayerDeclaration[] = enabledLayers
    ? allOverlayLayers.filter((l) => enabledLayers.has(l.layerId))
    : [];

  const overlayLayerIdsKey = activeOverlayLayers.map((l) => l.layerId).join(',');

  // Map of layerId → GeoJSON FeatureCollection (or null on error).
  const [spcGeoJsonData, setSpcGeoJsonData] = useState<Record<string, FeatureCollection | null>>({});

  useEffect(() => {
    if (activeOverlayLayers.length === 0) {
      setSpcGeoJsonData({});
      return;
    }

    let cancelled = false;

    async function fetchSpcData() {
      const results: Record<string, FeatureCollection | null> = {};
      await Promise.all(
        activeOverlayLayers.map(async (layer) => {
          if (!layer.wmsEndpointUrl) {
            results[layer.layerId] = null;
            return;
          }
          try {
            // SPC layers use ArcGIS REST MapServer query endpoints.
            // Append GeoJSON query params to get all features.
            const url = `${layer.wmsEndpointUrl}?where=1%3D1&outFields=*&f=geojson`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`SPC fetch failed: ${resp.status}`);
            const data = await resp.json() as FeatureCollection;
            results[layer.layerId] = data;
          } catch {
            results[layer.layerId] = null;
          }
        }),
      );
      if (!cancelled) setSpcGeoJsonData(results);
    }

    void fetchSpcData();

    // Auto-refresh every 5 minutes while any SPC layer is active.
    const refreshInterval = setInterval(() => { void fetchSpcData(); }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
    };
  // overlayLayerIdsKey encodes which overlay layers are active.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayLayerIdsKey]);

  // ---------------------------------------------------------------------------
  // T4.8 — Alert polygon fetching.
  // Fetches alerts from /api/v1/alerts when the "alerts" layer type is enabled.
  // Auto-refreshes every 5 minutes. Renders as GeoJSON polygons when geometry
  // is present; skips alerts with no geometry (zone-based alerts have no polygon).
  // ---------------------------------------------------------------------------

  // Check if any alerts-type layer is enabled.
  const allAlertLayers: LayerDeclaration[] = isNoaa && capabilityLayers
    ? capabilityLayers.filter((l) => l.layerType === 'alerts')
    : [];

  const alertsEnabled = enabledLayers
    ? allAlertLayers.some((l) => enabledLayers.has(l.layerId))
    : false;

  // GeoJSON FeatureCollection synthesised from alert records that include geometry.
  const [alertGeoJson, setAlertGeoJson] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    if (!alertsEnabled) {
      setAlertGeoJson(null);
      return;
    }

    let cancelled = false;

    async function fetchAlertData() {
      try {
        const resp = await getAlerts();
        if (cancelled) return;

        // Build a GeoJSON FeatureCollection from alerts that carry polygon geometry.
        // AlertRecord does not have a geometry field in the current type definition;
        // real NWS alerts arrive with a `geometry` field at runtime.
        // We cast through `unknown` and check for the geometry field defensively.
        const features: Feature[] = [];
        for (const alert of resp.data.alerts) {
          const raw = alert as unknown as Record<string, unknown>;
          if (
            raw['geometry'] &&
            typeof raw['geometry'] === 'object' &&
            raw['geometry'] !== null
          ) {
            features.push({
              type: 'Feature',
              geometry: raw['geometry'] as Feature['geometry'],
              properties: {
                id: alert.id,
                event: alert.event,
                headline: alert.headline,
                description: alert.description ?? '',
                severityLevel: alert.severityLevel,
                severityLabel: alert.severityLabel,
                areaDesc: alert.areaDesc,
              },
            });
          }
        }

        setAlertGeoJson(features.length > 0
          ? { type: 'FeatureCollection', features }
          : null,
        );
      } catch {
        // Silently discard — alerts overlay degrades gracefully on error.
        if (!cancelled) setAlertGeoJson(null);
      }
    }

    void fetchAlertData();

    const refreshInterval = setInterval(() => { void fetchAlertData(); }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
    };
  }, [alertsEnabled]);

  // ---------------------------------------------------------------------------
  // Alert severity → fill color mapping (T4.8).
  // Level 4 = Extreme (red), 3 = Severe (orange), 2 = Moderate (yellow),
  // 1 = Minor (green). Pairs color with a label/icon in popups (not color-only).
  // ---------------------------------------------------------------------------

  function getAlertSeverityColor(severityLevel: number | null): string {
    switch (severityLevel) {
      case 4: return '#ef4444'; // red-500 — Extreme
      case 3: return '#f97316'; // orange-500 — Severe
      case 2: return '#eab308'; // yellow-500 — Moderate
      case 1: return '#22c55e'; // green-500 — Minor
      default: return '#6b7280'; // gray-500 — Unknown
    }
  }

  // Determine the authoritative frames list.
  // For NOAA: use the NEXRAD layer's frames (first enabled radar layer) for the
  // animation timeline. For other providers: use the standard radarFrameList.
  const allFrames: RadarFrame[] = (() => {
    if (isNoaa && enabledRadarLayers && enabledRadarLayers.length > 0) {
      const nexradLayerId = enabledRadarLayers[0].layerId;
      return noaaLayerFrameLists[nexradLayerId]?.frames ?? radarFrameList?.frames ?? [];
    }
    return radarFrameList?.frames ?? [];
  })();

  // T3.5 — Card view caps displayed frames at CARD_FRAME_CAP (most recent).
  // Expanded view (/radar page, Phase 4) shows full history.
  const frames: RadarFrame[] = !expanded && allFrames.length > CARD_FRAME_CAP
    ? allFrames.slice(-CARD_FRAME_CAP)
    : allFrames;

  const tileHost = radarFrameList?.tileHost ?? null;

  // T4.2 — Notify parent when frame list changes so TimeSlider can render the track.
  // Using a ref to hold the callback avoids re-triggering on every render.
  const onFramesLoadedRef = useRef(onFramesLoaded);
  onFramesLoadedRef.current = onFramesLoaded;
  useEffect(() => {
    if (frames.length > 0 && onFramesLoadedRef.current) {
      onFramesLoadedRef.current(frames);
    }
  // frames reference changes when the array content changes (new frame list).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames.length, providerId]);

  // --- Animation state ---
  const [animationStep, setAnimationStep] = useState(0);
  // Start paused; auto-play begins after PRELOAD_DELAY_MS once frames are ready.
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which (frame, layer) pairs have fully loaded their tiles.
  const loadedLayersRef = useRef(new Set<number>());

  const frameCount = frames.length;

  // T3.5 — Adaptive tick interval. Targets TARGET_LOOP_DURATION_MS per full loop.
  // More frames → smaller tick so the total loop stays near 18 seconds.
  const adaptiveTickMs = frameCount > 0
    ? Math.max(MIN_TICK_MS, Math.floor(TARGET_LOOP_DURATION_MS / (frameCount * SUBSTEPS)))
    : MIN_TICK_MS;

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
      setIsPlaying(true);
    }, PRELOAD_DELAY_MS);

    return () => {
      if (preloadTimerRef.current !== null) {
        clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }
    };
  }, [frameCount]);

  // Animation timer — advances animationStep one sub-step at a time; cross-fade
  // between real frames is handled by getFrameOpacity. No URL swaps or tile
  // re-fetches after the initial load, resulting in smooth looping.
  // Uses adaptiveTickMs so long frame lists still produce an ~18s loop (T3.5).
  // T4.2 — When externalFrameIndex is set, the expanded view's TimeSlider drives
  // the display; internal animation is suppressed to avoid conflicting state.
  const isExternallyControlled = externalFrameIndex !== undefined;
  useEffect(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (isPlaying && frameCount > 1 && !isExternallyControlled) {
      const totalSteps = frameCount * SUBSTEPS;
      intervalRef.current = setInterval(() => {
        setAnimationStep((s) => (s + 1) % totalSteps);
      }, adaptiveTickMs);
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, frameCount, adaptiveTickMs, isExternallyControlled]);

  // T4.2 — When externalFrameIndex is set (expanded view with TimeSlider), convert
  // it to an animationStep by snapping to the keyframe boundary (SUBSTEPS alignment).
  // This lets the expanded view's TimeSlider drive the frame shown on the map.
  const effectiveAnimationStep = externalFrameIndex !== undefined && frameCount > 0
    ? (externalFrameIndex % frameCount) * SUBSTEPS
    : animationStep;

  // T4.5 — Effective opacity: use the override from the layer panel when provided,
  // otherwise fall back to the internal MAX_OPACITY constant.
  const effectiveMaxOpacity = opacityOverride !== undefined ? opacityOverride : MAX_OPACITY;

  // Derive the display frame index from animationStep for timestamp/counter display.
  const displayFrameIndex = frameCount > 0 ? Math.floor(effectiveAnimationStep / SUBSTEPS) % frameCount : 0;
  const currentFrame: RadarFrame | null = frames[displayFrameIndex] ?? null;

  const isLoading = capLoading || framesLoading || noaaLayersLoading;

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

  // Attribution text: prefer the frames response (provider-specific per-fetch),
  // fall back to the capability-level attribution (T3.3).
  const providerAttribution = radarFrameList?.attribution ?? radarCapability?.attribution ?? undefined;

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

          T3.2 — NOAA dual-layer: when the provider is NOAA with sub-layers,
          each frame slot renders TWO TileLayers (NEXRAD + MRMS) at the same
          opacity, both animated in sync by the shared animationStep.
        */}
        <MapContainer
          center={center}
          zoom={zoom}
          className="h-full w-full"
          scrollWheelZoom={false}
          zoomControl={true}
        >
          <TileLayer
            key={baseTile.url}
            url={baseTile.url}
            attribution={baseTile.attribution}
          />

          {/* Single-layer tile providers (RainViewer, LibreWxR) — use TileLayer */}
          {radarCapability !== null && !isNoaa && radarCapability.tileUrlTemplate && frames.map((frame, i) => {
            const url = buildTileUrl(frame, radarCapability, tileHost, effectiveColorScheme);
            if (!url) return null;
            const frameIndex = i;
            return (
              <TileLayer
                key={frame.time}
                url={url}
                opacity={Math.max(getFrameOpacity(i, effectiveAnimationStep, frameCount, effectiveMaxOpacity), 0.001)}
                attribution={i === 0 ? providerAttribution : undefined}
                eventHandlers={{
                  load: () => {
                    loadedLayersRef.current.add(frameIndex);
                    if (loadedLayersRef.current.size >= frames.length) {
                      if (preloadTimerRef.current !== null) {
                        clearTimeout(preloadTimerRef.current);
                        preloadTimerRef.current = null;
                      }
                      setIsPlaying(true);
                    }
                  },
                }}
              />
            );
          })}

          {/* Single-layer WMS-T providers (MSC GeoMet, DWD Radolan) — use WMSTileLayer.
              WMSTileLayer computes BBOX from tile coordinates automatically.
              TIME is baked into the base URL so each frame is a distinct layer instance. */}
          {radarCapability !== null && !isNoaa && !radarCapability.tileUrlTemplate &&
            radarCapability.wmsEndpointUrl && radarCapability.wmsLayerName && frames.map((frame, i) => {
            const wmsUrl = `${radarCapability.wmsEndpointUrl}?TIME=${encodeURIComponent(frame.time)}`;
            const frameIndex = i;
            return (
              <WMSTileLayer
                key={frame.time}
                url={wmsUrl}
                layers={radarCapability.wmsLayerName!}
                format="image/png"
                transparent={true}
                version="1.1.1"
                opacity={Math.max(getFrameOpacity(i, effectiveAnimationStep, frameCount, effectiveMaxOpacity), 0.001)}
                attribution={i === 0 ? providerAttribution : undefined}
                eventHandlers={{
                  load: () => {
                    loadedLayersRef.current.add(frameIndex);
                    if (loadedLayersRef.current.size >= frames.length) {
                      if (preloadTimerRef.current !== null) {
                        clearTimeout(preloadTimerRef.current);
                        preloadTimerRef.current = null;
                      }
                      setIsPlaying(true);
                    }
                  },
                }}
              />
            );
          })}

          {/* T3.2 — NOAA dual-layer: render NEXRAD + MRMS simultaneously, in sync.
              Each frame slot produces one WMSTileLayer per sub-layer; both share
              the same opacity computed from the shared animationStep.
              WMSTileLayer handles BBOX computation automatically — the TIME param
              is baked into the base URL so each frame is a distinct layer instance. */}
          {radarCapability !== null && isNoaa && enabledRadarLayers && frames.map((frame, i) => {
            const frameOpacity = Math.max(getFrameOpacity(i, effectiveAnimationStep, frameCount, effectiveMaxOpacity), 0.001);
            const layerCount = enabledRadarLayers.length;
            return enabledRadarLayers.map((layer, layerIdx) => {
              if (!layer.wmsEndpointUrl || !layer.wmsLayerName) return null;
              const layerFrameList = noaaLayerFrameLists[layer.layerId];
              const layerFrame = layerFrameList?.frames[i] ?? frame;
              const wmsUrl = `${layer.wmsEndpointUrl}?TIME=${encodeURIComponent(layerFrame.time)}`;
              const loadKey = i * layerCount + layerIdx;
              const expectedLoads = frames.length * layerCount;
              return (
                <WMSTileLayer
                  key={`${layer.layerId}-${frame.time}`}
                  url={wmsUrl}
                  layers={layer.wmsLayerName}
                  format="image/png"
                  transparent={true}
                  version="1.1.1"
                  opacity={frameOpacity}
                  attribution={i === 0 && layerIdx === 0 ? providerAttribution : undefined}
                  eventHandlers={{
                    load: () => {
                      loadedLayersRef.current.add(loadKey);
                      if (loadedLayersRef.current.size >= expectedLoads) {
                        if (preloadTimerRef.current !== null) {
                          clearTimeout(preloadTimerRef.current);
                          preloadTimerRef.current = null;
                        }
                        setIsPlaying(true);
                      }
                    },
                  }}
                />
              );
            });
          })}

          {/*
            T4.6 — Satellite WMS TileLayers.
            Rendered in a custom Pane at z-index 100 (below radar at z-index 200).
            Each active satellite layer renders one WMSTileLayer per frame, animated
            in sync with the shared animationStep (same cross-fade logic as radar).
            WMSTileLayer handles BBOX computation; TIME is baked into the base URL.
          */}
          {activeSatelliteLayers.length > 0 && (
            <Pane name="satellite-pane" style={{ zIndex: 100 }}>
              {activeSatelliteLayers.map((layer) => {
                if (!layer.wmsEndpointUrl || !layer.wmsLayerName) return null;
                const layerFrameList = satelliteFrameLists[layer.layerId];
                const satFrames = layerFrameList?.frames ?? frames;
                return satFrames.map((frame, i) => {
                  const wmsUrl = `${layer.wmsEndpointUrl}?TIME=${encodeURIComponent(frame.time)}`;
                  const opacity = Math.max(
                    getFrameOpacity(i, effectiveAnimationStep, satFrames.length, effectiveMaxOpacity),
                    0.001,
                  );
                  return (
                    <WMSTileLayer
                      key={`sat-${layer.layerId}-${frame.time}`}
                      url={wmsUrl}
                      layers={layer.wmsLayerName!}
                      format="image/png"
                      transparent={true}
                      version="1.1.1"
                      opacity={opacity}
                      pane="satellite-pane"
                    />
                  );
                });
              })}
            </Pane>
          )}

          {/*
            T4.7 — SPC overlay GeoJSON layers.
            Rendered in a custom Pane at z-index 300 (above radar at z-index 200).
            NOT time-animated — current snapshot only; auto-refreshed every 5 min.
            Click on any feature shows a popup with risk label and details.
            Colors come from GeoJSON feature properties when available, falling
            back to a neutral stroke color.
            Color is NOT the only signal — the popup includes the risk label text.
          */}
          {activeOverlayLayers.length > 0 && (
            <Pane name="spc-overlay-pane" style={{ zIndex: 300 }}>
              {activeOverlayLayers.map((layer) => {
                const data = spcGeoJsonData[layer.layerId];
                if (!data) return null;
                return (
                  <GeoJSON
                    key={`spc-${layer.layerId}-${JSON.stringify(data).length}`}
                    data={data}
                    pane="spc-overlay-pane"
                    style={(feature?: Feature) => {
                      // Use stroke/fill from GeoJSON properties when present.
                      const props = feature?.properties ?? {};
                      const stroke: PathOptions = {
                        color: (props['stroke'] as string | undefined) ??
                               (props['stroke_color'] as string | undefined) ??
                               '#f97316',
                        fillColor: (props['fill'] as string | undefined) ??
                                   (props['fill_color'] as string | undefined) ??
                                   '#f97316',
                        fillOpacity: 0.25,
                        weight: 2,
                        opacity: 0.9,
                      };
                      return stroke;
                    }}
                    onEachFeature={(feature: Feature, leafletLayer: Layer) => {
                      // Build popup content from feature properties.
                      // Uses textContent assignment (safe, no XSS risk).
                      const props = feature.properties ?? {};
                      const label =
                        (props['Label'] as string | undefined) ??
                        (props['LABEL'] as string | undefined) ??
                        (props['label'] as string | undefined) ??
                        (props['DN'] as string | undefined) ??
                        layer.layerName;
                      const dn = (props['DN'] as string | number | undefined) ?? '';
                      const popupDiv = document.createElement('div');
                      popupDiv.style.fontFamily = 'var(--font-sans)';
                      popupDiv.style.fontSize = 'var(--text-label, 0.75rem)';
                      popupDiv.style.maxWidth = '200px';
                      const title = document.createElement('strong');
                      title.textContent = String(label);
                      popupDiv.appendChild(title);
                      if (dn) {
                        const detail = document.createElement('p');
                        detail.style.margin = '4px 0 0';
                        detail.textContent = `Risk level: ${String(dn)}`;
                        popupDiv.appendChild(detail);
                      }
                      leafletLayer.bindPopup(popupDiv);
                    }}
                  />
                );
              })}
            </Pane>
          )}

          {/*
            T4.8 — Alert polygon GeoJSON layer.
            Rendered in a custom Pane at z-index 400 (topmost layer).
            Color-coded by severityLevel — but color is NOT the only signal:
            the popup includes the severity label text and event name.
            Alerts with no geometry are silently skipped (zone-based alerts).
            Auto-refreshed every 5 minutes when the alerts layer is enabled.
          */}
          {alertsEnabled && alertGeoJson && (
            <Pane name="alert-polygon-pane" style={{ zIndex: 400 }}>
              <GeoJSON
                key={`alerts-${alertGeoJson.features.length}`}
                data={alertGeoJson}
                pane="alert-polygon-pane"
                style={(feature?: Feature) => {
                  const props = feature?.properties ?? {};
                  const level = props['severityLevel'] as number | null | undefined;
                  const fillColor = getAlertSeverityColor(level ?? null);
                  return {
                    color: fillColor,
                    fillColor,
                    fillOpacity: 0.3,
                    weight: 2,
                    opacity: 0.9,
                  };
                }}
                onEachFeature={(feature: Feature, leafletLayer: Layer) => {
                  const props = feature.properties ?? {};
                  const event = (props['event'] as string | undefined) ?? 'Alert';
                  const headline = (props['headline'] as string | undefined) ?? '';
                  const severityLabel = (props['severityLabel'] as string | undefined) ?? '';
                  const description = (props['description'] as string | undefined) ?? '';
                  const areaDesc = (props['areaDesc'] as string | undefined) ?? '';

                  const popupDiv = document.createElement('div');
                  popupDiv.style.fontFamily = 'var(--font-sans)';
                  popupDiv.style.fontSize = 'var(--text-label, 0.75rem)';
                  popupDiv.style.maxWidth = '240px';

                  const title = document.createElement('strong');
                  title.textContent = event;
                  popupDiv.appendChild(title);

                  if (severityLabel) {
                    const severity = document.createElement('p');
                    severity.style.margin = '4px 0 0';
                    severity.style.fontWeight = '600';
                    severity.textContent = `Severity: ${severityLabel}`;
                    popupDiv.appendChild(severity);
                  }

                  if (headline) {
                    const hl = document.createElement('p');
                    hl.style.margin = '4px 0 0';
                    hl.textContent = headline;
                    popupDiv.appendChild(hl);
                  }

                  if (areaDesc) {
                    const area = document.createElement('p');
                    area.style.margin = '4px 0 0';
                    area.style.color = 'var(--muted-foreground, #666)';
                    area.textContent = areaDesc;
                    popupDiv.appendChild(area);
                  }

                  if (description) {
                    const desc = document.createElement('p');
                    desc.style.margin = '8px 0 0';
                    desc.style.maxHeight = '120px';
                    desc.style.overflowY = 'auto';
                    // description is from our own API (not user-supplied HTML), but
                    // we use textContent to prevent any XSS risk from provider data.
                    desc.textContent = description.slice(0, 500) +
                      (description.length > 500 ? '…' : '');
                    popupDiv.appendChild(desc);
                  }

                  leafletLayer.bindPopup(popupDiv);
                }}
              />
            </Pane>
          )}
        </MapContainer>

        {/* Color legend — visible when radar frames are loaded */}
        {!isLoading && frameCount > 0 && <RadarLegend />}
      </div>

      {/* Animation controls — only shown when there are frames to animate and this
          is NOT in externally-controlled expanded mode (expanded view has its own
          TimeSlider; showing both would duplicate controls).
          flex-shrink-0 keeps the control bar from being squashed by the map. */}
      {frameCount > 0 && !isExternallyControlled && (
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
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default RadarMap;
