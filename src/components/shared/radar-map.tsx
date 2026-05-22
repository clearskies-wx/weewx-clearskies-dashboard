import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer } from 'react-leaflet';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getCapabilities, getRadarFrames } from '../../api/client';
import type { CapabilityDeclaration, RadarFrame } from '../../api/types';

interface RadarMapProps {
  center: [number, number];
  zoom?: number;
}

const ANIMATION_INTERVAL_MS = 750;
const DEFAULT_PROVIDER_ID = 'rainviewer';

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
  const { data: capabilitiesEnvelope, loading: capLoading } = useApiQuery(
    (signal) => getCapabilities(signal),
  );

  const radarCapability: CapabilityDeclaration | null =
    capabilitiesEnvelope?.data?.providers.find((p) => p.domain === 'radar') ?? null;

  const providerId = radarCapability?.providerId ?? DEFAULT_PROVIDER_ID;

  // --- Frames fetch ---
  const skipFrames = capLoading;
  const { data: framesEnvelope, loading: framesLoading, error: framesError } = useApiQuery(
    (signal) => getRadarFrames(providerId, signal),
    { skip: skipFrames, deps: [providerId] },
  );

  const frames: RadarFrame[] = framesEnvelope?.data?.frames ?? [];
  const tileHost = framesEnvelope?.data?.tileHost ?? null;

  // --- Animation state ---
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const frameCount = frames.length;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (frameCount > 0 ? (i + 1) % frameCount : 0));
  }, [frameCount]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (frameCount > 0 ? (i - 1 + frameCount) % frameCount : 0));
  }, [frameCount]);

  // Clamp index when frames change
  useEffect(() => {
    if (frameCount > 0 && currentIndex >= frameCount) {
      setCurrentIndex(frameCount - 1);
    }
  }, [frameCount, currentIndex]);

  // Animation timer
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

  const currentTileUrl: string | null =
    currentFrame && radarCapability
      ? buildTileUrl(currentFrame, radarCapability, tileHost)
      : null;

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

        {!isLoading && framesError && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-muted rounded-lg"
            role="alert"
          >
            <p className="text-sm text-destructive">{t('noFrames')}</p>
          </div>
        )}

        {!isLoading && !framesError && !capLoading && !radarCapability && (
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
          MapContainer must not be unmounted/remounted on frame changes — that causes
          a full Leaflet reset. It's always rendered; tile URL is swapped via key prop
          on TileLayer so Leaflet fetches new tiles without destroying the map instance.
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
          {currentTileUrl && (
            <TileLayer
              key={currentTileUrl}
              url={currentTileUrl}
              opacity={0.7}
              attribution={framesEnvelope?.data?.attribution ?? undefined}
            />
          )}
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
