// webcam.tsx — Webcam page (/webcam)
// Shows a live auto-refreshing webcam image and an optional timelapse player.
// ADR-009: card-based layout, mobile-first.
// ADR-026: WCAG 2.1 AA — all interactive elements keyboard-accessible,
//           aria-live on frame counter, aria-label on icon-only controls.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { useWebcam } from '../hooks/useWeatherData';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

// Speed options in frames per second.
const SPEED_OPTIONS = [1, 2, 5, 10] as const;
type Speed = (typeof SPEED_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Helper: build the timelapse frame src from a bare filename.
// The API serves timelapse files at /api/v1/webcam/timelapse/{filename}.
// ---------------------------------------------------------------------------
function timelapseFrameSrc(filename: string): string {
  return `${API_BASE}/webcam/timelapse/${encodeURIComponent(filename)}`;
}

// ---------------------------------------------------------------------------
// Skeleton / error sub-components (match almanac.tsx pattern)
// ---------------------------------------------------------------------------

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        {t('retry')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiveView — auto-refreshing webcam image
// Forces a reload at `refreshInterval` seconds by appending ?t=<timestamp>
// to the img src. Using a key prop would unmount/remount the element (flash);
// the query-param approach is a softer reload that many CDNs and proxies pass
// through correctly.
// ---------------------------------------------------------------------------

interface LiveViewProps {
  imageUrl: string;
  refreshInterval: number;
}

function LiveView({ imageUrl, refreshInterval }: LiveViewProps) {
  const { t, i18n } = useTranslation('webcam');
  const [timestamp, setTimestamp] = useState<number>(() => Date.now());
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  useEffect(() => {
    if (refreshInterval <= 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setTimestamp(now);
      setLastUpdated(new Date(now));
    }, refreshInterval * 1000);
    return () => clearInterval(id);
  }, [refreshInterval]);

  const src = `${imageUrl}?t=${timestamp}`;

  const formattedTime = new Intl.DateTimeFormat(i18n.language, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(lastUpdated);

  return (
    <div className="flex flex-col gap-2">
      <img
        src={src}
        alt={t('imageAlt')}
        className="w-full rounded-md object-cover"
        // Prevent browsers from caching the image across refreshes.
        // The ?t= param is the primary cache-busting mechanism; this is a
        // belt-and-suspenders hint for aggressive service workers.
        crossOrigin="anonymous"
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t('lastUpdated', { time: formattedTime })}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimelapsePlayer — frame scrubber with play/pause + speed control
// ---------------------------------------------------------------------------

interface TimelapsePlayerProps {
  frames: string[];
}

function TimelapsePlayer({ frames }: TimelapsePlayerProps) {
  const { t } = useTranslation('webcam');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(2);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Advance one frame, wrapping at the end.
  const advance = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % frames.length);
  }, [frames.length]);

  // Start / stop playback interval when playing or speed changes.
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (playing && frames.length > 1) {
      intervalRef.current = setInterval(advance, Math.round(1000 / speed));
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speed, advance, frames.length]);

  // Stop playback if frames array changes (e.g. data refetch).
  useEffect(() => {
    setPlaying(false);
    setCurrentIndex(0);
  }, [frames]);

  function togglePlay() {
    setPlaying((p) => !p);
  }

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    setCurrentIndex(Number(e.target.value));
  }

  function handleSpeedChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSpeed(Number(e.target.value) as Speed);
  }

  const frameSrc = timelapseFrameSrc(frames[currentIndex]);
  // 1-based display for humans
  const displayCurrent = currentIndex + 1;
  const displayTotal = frames.length;

  return (
    <div className="flex flex-col gap-3">
      <img
        src={frameSrc}
        alt={t('imageAlt')}
        className="w-full rounded-md object-cover"
      />

      {/* Frame counter — aria-live so screen readers announce frame changes during playback */}
      <p
        className="text-xs text-muted-foreground text-center"
        aria-live="polite"
        aria-atomic="true"
      >
        {t('frameOf', { current: displayCurrent, total: displayTotal })}
      </p>

      {/* Scrubber */}
      <label className="sr-only" htmlFor="timelapse-scrubber">
        {t('scrubberLabel')}
      </label>
      <input
        id="timelapse-scrubber"
        type="range"
        min={0}
        max={frames.length - 1}
        value={currentIndex}
        onChange={handleScrub}
        className="w-full accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        aria-label={t('scrubberLabel')}
        aria-valuemin={1}
        aria-valuemax={displayTotal}
        aria-valuenow={displayCurrent}
        aria-valuetext={t('frameOf', { current: displayCurrent, total: displayTotal })}
      />

      {/* Controls row: play/pause + speed */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Play/Pause button */}
        <button
          type="button"
          aria-label={playing ? t('pause') : t('play')}
          aria-pressed={playing}
          onClick={togglePlay}
          disabled={frames.length <= 1}
          className={[
            'flex items-center justify-center rounded-md',
            'h-11 w-11',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors duration-150',
          ].join(' ')}
        >
          {playing
            ? <Pause aria-hidden="true" className="h-5 w-5" />
            : <Play aria-hidden="true" className="h-5 w-5" />}
        </button>

        {/* Speed selector */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="timelapse-speed"
            className="text-sm text-muted-foreground whitespace-nowrap"
          >
            {t('speed')}
          </label>
          <select
            id="timelapse-speed"
            value={speed}
            onChange={handleSpeedChange}
            aria-label={t('speedAriaLabel')}
            className={[
              'rounded-md border border-border bg-background text-foreground text-sm',
              'px-2 py-1.5',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'min-h-[44px]',
            ].join(' ')}
          >
            {SPEED_OPTIONS.map((fps) => (
              <option key={fps} value={fps}>
                {fps} fps
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebcamPage — top-level route component
// ---------------------------------------------------------------------------

export function WebcamPage() {
  const { t } = useTranslation('webcam');
  const { data: webcam, loading, error, refetch } = useWebcam();

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>

      {loading && (
        <>
          <span className="sr-only" role="status">{t('loading')}</span>
          <TileSkeleton className="h-64" />
          <TileSkeleton className="h-48" />
        </>
      )}

      {error && <TileError message={t('error')} onRetry={refetch} />}

      {!loading && !error && webcam !== null && (
        <>
          {/* Live View card */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('liveView')}</CardTitle>
            </CardHeader>
            <CardContent>
              {webcam.enabled && webcam.imageUrl ? (
                <LiveView
                  imageUrl={webcam.imageUrl}
                  refreshInterval={webcam.refreshInterval}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t('notConfigured')}</p>
              )}
            </CardContent>
          </Card>

          {/* Timelapse card — only renders when frames are available */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('timelapse')}</CardTitle>
            </CardHeader>
            <CardContent>
              {webcam.enabled && webcam.timelapseFrames.length > 0 ? (
                <TimelapsePlayer frames={webcam.timelapseFrames} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('noTimelapse')}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default WebcamPage;
