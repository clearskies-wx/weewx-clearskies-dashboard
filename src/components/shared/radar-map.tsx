import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { MapContainer, TileLayer } from 'react-leaflet';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCapabilities, useRadarFrames } from '../../hooks/useWeatherData';
import type { CapabilityDeclaration, RadarFrame } from '../../api/types';

interface RadarMapProps {
  center: [number, number];
  zoom?: number;
}

const ANIMATION_INTERVAL_MS = 500;

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

export function RadarMap({ center, zoom = 7 }: RadarMapProps) {
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
  const [currentIndex, setCurrentIndex] = useState(0);
  // Start paused; auto-play begins after PRELOAD_DELAY_MS once frames are ready.
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which frame indices have fully loaded all their tiles.
  const loadedLayersRef = useRef(new Set<number>());

  const frameCount = frames.length;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (frameCount > 0 ? (i + 1) % frameCount : 0));
  }, [frameCount]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (frameCount > 0 ? (i - 1 + frameCount) % frameCount : 0));
  }, [frameCount]);

  // Clamp index when frames change; start the preload delay when a new frame
  // list arrives so the browser has time to fetch tiles before animation starts.
  useEffect(() => {
    if (frameCount === 0) return;

    if (currentIndex >= frameCount) {
      setCurrentIndex(frameCount - 1);
    }

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
    // Intentionally omit currentIndex to avoid re-firing when only the index
    // changes; this effect is about frame-list changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameCount]);

  // Animation timer — only advances the index; no URL swap or tile re-fetch.
  // Tiles for every frame are already rendered as TileLayers; toggling opacity
  // between 0 and 0.7 shows the active frame while keeping all others cached.
  useEffect(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (isPlaying && frameCount > 1) {
      intervalRef.current = setInterval(goNext, ANIMATION_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, frameCount, goNext]);

  const currentFrame: RadarFrame | null = frames[currentIndex] ?? null;

  const isLoading = capLoading || framesLoading;

  const formatFrameTime = (isoTime: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
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
          and caches every frame's tiles on first load. The active frame is shown
          at opacity 0.7; all others are at opacity 0 (invisible but cached).
          Advancing the animation only changes `currentIndex` — no URL swaps, no
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
                opacity={i === currentIndex ? 0.7 : 0}
                attribution={i === 0 ? (radarFrameList?.attribution ?? undefined) : undefined}
                eventHandlers={{
                  add: (e) => {
                    // Apply a CSS transition so opacity changes animate smoothly
                    // via the browser compositor instead of cutting instantly.
                    const container = (e.target as L.TileLayer).getContainer();
                    if (container) {
                      container.style.transition = 'opacity 300ms ease-in-out';
                    }
                  },
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
            {t('frameOf', { current: currentIndex + 1, total: frameCount })}
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
