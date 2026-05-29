import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer } from 'react-leaflet';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCapabilities, useRadarFrames } from '../../hooks/useWeatherData';
import type { CapabilityDeclaration, RadarFrame } from '../../api/types';

interface RadarMapProps {
  center: [number, number];
  zoom?: number;
  /**
   * IANA timezone string for the station (e.g. "America/Chicago").
   * Used to format frame timestamps in station-local time (ADR-020).
   * Defaults to UTC when absent.
   */
  stationTz?: string;
}

const SUBSTEPS = 5;        // interpolation steps between each real frame pair
const TICK_MS = 100;       // milliseconds per sub-step
const MAX_OPACITY = 0.7;   // max radar overlay opacity

// How long to wait after frames load before starting auto-play.
// Gives the browser time to begin fetching tiles for all frames so the first
// loop isn't visibly stuttery while tiles are still in-flight.
const PRELOAD_DELAY_MS = 1500;

// RainViewer tile defaults.
// {size}    — tile size in pixels; 512 is the high-DPI option (also valid: 256).
// {color}   — colour scheme index; 2 = "Original" (meteorological standard).
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
    url = url.replace('{color}', String(RAINVIEWER_COLOR));
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

function getFrameOpacity(frameIndex: number, step: number, totalFrames: number): number {
  const primaryFrame = Math.floor(step / SUBSTEPS) % totalFrames;
  const subStep = step % SUBSTEPS;
  const nextFrame = (primaryFrame + 1) % totalFrames;

  if (subStep === 0) {
    return frameIndex === primaryFrame ? MAX_OPACITY : 0;
  }

  // Constant-composite cross-fade: compute opacities so two overlapping
  // semi-transparent layers composite to exactly MAX_OPACITY throughout.
  // Formula: composite = 1 - (1-a)(1-b) = MAX_OPACITY
  // Solved: a = 1 - transparency^(1-t), b = 1 - transparency^t
  const t = subStep / SUBSTEPS;
  const transparency = 1 - MAX_OPACITY;
  if (frameIndex === primaryFrame) {
    return 1 - Math.pow(transparency, 1 - t);
  }
  if (frameIndex === nextFrame) {
    return 1 - Math.pow(transparency, t);
  }
  return 0;
}

export function RadarMap({ center, zoom = 7, stationTz }: RadarMapProps) {
  const { t } = useTranslation('radar');

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

  const frames: RadarFrame[] = radarFrameList?.frames ?? [];
  const tileHost = radarFrameList?.tileHost ?? null;

  // --- Animation state ---
  const [animationStep, setAnimationStep] = useState(0);
  // Start paused; auto-play begins after PRELOAD_DELAY_MS once frames are ready.
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which frame indices have fully loaded all their tiles.
  const loadedLayersRef = useRef(new Set<number>());

  const frameCount = frames.length;

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
  useEffect(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (isPlaying && frameCount > 1) {
      const totalSteps = frameCount * SUBSTEPS;
      intervalRef.current = setInterval(() => {
        setAnimationStep((s) => (s + 1) % totalSteps);
      }, TICK_MS);
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, frameCount]);

  // Derive the display frame index from animationStep for timestamp/counter display.
  const displayFrameIndex = frameCount > 0 ? Math.floor(animationStep / SUBSTEPS) % frameCount : 0;
  const currentFrame: RadarFrame | null = frames[displayFrameIndex] ?? null;

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
      <div className="flex flex-col gap-2">
        <div
          className="h-96 rounded-lg overflow-hidden"
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
          <p className="text-xs text-muted-foreground">{radarCapability.operatorNotes}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="h-96 rounded-lg overflow-hidden relative"
        role="region"
        aria-label={t('radarTitle')}
      >
        {isLoading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-muted rounded-lg"
            aria-live="polite"
            aria-atomic="true"
          >
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          </div>
        )}

        {!isLoading && (capError || framesError) && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-muted rounded-lg"
            role="alert"
          >
            <p className="text-sm text-destructive">{t('noFrames')}</p>
          </div>
        )}

        {!isLoading && !capError && !framesError && !radarCapability && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-muted rounded-lg"
            role="status"
          >
            <p className="text-sm text-muted-foreground">{t('noProvider')}</p>
          </div>
        )}

        {!isLoading && frameCount === 0 && radarCapability && !framesError && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-muted rounded-lg"
            role="status"
          >
            <p className="text-sm text-muted-foreground">{t('noFrames')}</p>
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
          className="h-full w-full"
          scrollWheelZoom={false}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {radarCapability !== null && frames.map((frame, i) => {
            // Capture the non-null capability so TypeScript can confirm it inside
            // the map callback closure.
            const cap = radarCapability;
            const url = buildTileUrl(frame, cap, tileHost);
            if (!url) return null;
            // Capture the loop index in a stable const for use inside closures.
            const frameIndex = i;
            return (
              <TileLayer
                key={frame.time}
                url={url}
                opacity={Math.max(getFrameOpacity(i, animationStep, frameCount), 0.001)}
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
                      setIsPlaying(true);
                    }
                  },
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* Animation controls — only shown when there are frames to animate */}
      {frameCount > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            aria-label={t('previousFrame')}
            className="rounded p-1 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
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
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>

          <span className="text-xs text-muted-foreground tabular-nums ml-1">
            {t('frameOf', { current: displayFrameIndex + 1, total: frameCount })}
          </span>

          {currentFrame && (
            <span className="text-xs text-muted-foreground tabular-nums ml-auto">
              {formatFrameTime(currentFrame.time)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default RadarMap;
