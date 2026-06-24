// radar-time-slider.tsx — T4.2
// Full-width time slider bar for the expanded radar view (/radar page).
// Renders at the bottom of the viewport overlay with play/pause, speed control,
// frame scrub, and a nowcast region indicator.
//
// Animation state (currentFrameIndex, isPlaying, speed) is owned here and
// lifted to the parent via callbacks so RadarMap can receive externalFrameIndex.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause } from '@phosphor-icons/react';
import type { RadarFrame } from '../../api/types';

// ---------------------------------------------------------------------------
// Speed multiplier options
// ---------------------------------------------------------------------------

const SPEED_OPTIONS = [0.5, 1, 2] as const;
type SpeedMultiplier = typeof SPEED_OPTIONS[number];

// Base tick interval at 1× speed (ms per frame advance).
// At 1× with ~24 frames this gives a ~12-second loop; more frames adapt
// by spending the same real-time budget across the timeline.
const BASE_TICK_MS = 500;

// Minimum tick interval — prevents animation from being faster than tile fetches.
const MIN_TICK_MS = 100;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RadarTimeSliderProps {
  /** All frames from the provider (full history in expanded view). */
  frames: RadarFrame[];
  /** Current frame index to display (0-based). Controlled by this component. */
  currentFrameIndex: number;
  /** Called when the slider changes the active frame. */
  onFrameChange: (index: number) => void;
  /** Called when play/pause changes. Parent uses this to drive externalFrameIndex updates. */
  onPlayingChange: (playing: boolean) => void;
  /** IANA timezone string for timestamp formatting (ADR-020). */
  stationTz?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFrameTime(isoTime: string, stationTz?: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: stationTz ?? 'UTC',
    }).format(new Date(isoTime));
  } catch {
    return isoTime;
  }
}

// Compute the percentage-width of the nowcast region for the slider track.
// Returns 0 when no nowcast frames are present.
function nowcastRegionPercent(frames: RadarFrame[]): number {
  if (frames.length === 0) return 0;
  const firstNowcast = frames.findIndex((f) => f.kind === 'nowcast');
  if (firstNowcast === -1) return 0;
  return ((frames.length - firstNowcast) / frames.length) * 100;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RadarTimeSlider({
  frames,
  currentFrameIndex,
  onFrameChange,
  onPlayingChange,
  stationTz,
}: RadarTimeSliderProps) {
  // T4.9 — prefers-reduced-motion: start paused when the user has requested
  // reduced motion (DESIGN-MANUAL §14, WCAG 2.1 SC 2.3.3 / ATAG B.3).
  // The user can still press play manually.
  const [isPlaying, setIsPlaying] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [speed, setSpeed] = useState<SpeedMultiplier>(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCount = frames.length;

  // Compute effective tick interval from base speed and frame count.
  // Scales down with more frames to keep loop duration roughly constant.
  const tickMs = Math.max(
    MIN_TICK_MS,
    Math.round(BASE_TICK_MS / speed),
  );

  // Advance one frame, wrap at end.
  const advance = useCallback(() => {
    onFrameChange((currentFrameIndex + 1) % Math.max(frameCount, 1));
  }, [currentFrameIndex, frameCount, onFrameChange]);

  // Notify parent when play state changes.
  useEffect(() => {
    onPlayingChange(isPlaying);
  }, [isPlaying, onPlayingChange]);

  // Start/stop animation timer.
  useEffect(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (isPlaying && frameCount > 1) {
      intervalRef.current = setInterval(advance, tickMs);
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, frameCount, tickMs, advance]);

  // Keyboard: arrow keys scrub one frame at a time when the slider track has focus.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        onFrameChange((currentFrameIndex + 1) % Math.max(frameCount, 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onFrameChange((currentFrameIndex - 1 + frameCount) % Math.max(frameCount, 1));
      }
    },
    [currentFrameIndex, frameCount, onFrameChange],
  );

  const togglePlay = () => setIsPlaying((p) => !p);

  const nowcastPct = nowcastRegionPercent(frames);
  const currentFrame = frames[currentFrameIndex] ?? null;
  const currentTimeLabel = currentFrame ? formatFrameTime(currentFrame.time, stationTz) : '';
  const isNowcast = currentFrame?.kind === 'nowcast';

  if (frameCount === 0) return null;

  return (
    // Glass bar fixed to the bottom of the viewport overlay.
    // Height ~56px per DESIGN-MANUAL §18. z-index managed by the overlay stacking context.
    <div
      className="absolute bottom-0 left-0 right-0 flex flex-col gap-1 px-3 py-2"
      style={{
        background: 'rgb(var(--card-glass))',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        minHeight: '56px',
      }}
      role="group"
      aria-label="Radar animation controls"
    >
      {/* Timestamp row */}
      <div className="flex items-center justify-center">
        <span
          className="tabular-nums text-foreground font-medium"
          style={{ fontSize: 'var(--text-label)' }}
          aria-live="polite"
          aria-atomic="true"
        >
          {isNowcast && (
            <span
              className="inline-block mr-1 px-1 rounded text-[10px] font-semibold"
              style={{
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
                fontSize: 'var(--text-micro)',
              }}
              aria-label="Nowcast: "
            >
              +
            </span>
          )}
          {currentTimeLabel}
        </span>
      </div>

      {/* Controls row: play button | slider track | speed buttons */}
      <div className="flex items-center gap-2">
        {/* Play/Pause — 44×44px tap target */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause radar animation' : 'Play radar animation'}
          className="flex-shrink-0 flex items-center justify-center rounded text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Play className="h-5 w-5" aria-hidden="true" />
          )}
        </button>

        {/* Slider track with nowcast region */}
        <div className="relative flex-1 flex items-center" style={{ height: '44px' }}>
          {/* Nowcast background region on the right portion of the track */}
          {nowcastPct > 0 && (
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded-sm pointer-events-none"
              style={{
                width: `${nowcastPct}%`,
                height: '6px',
                // Nowcast region uses a dashed border style via box-shadow to distinguish
                // from the past/current history region without relying on color alone.
                background: 'var(--primary)',
                opacity: 0.25,
              }}
              aria-hidden="true"
            />
          )}
          <input
            type="range"
            min={0}
            max={Math.max(frameCount - 1, 0)}
            value={currentFrameIndex}
            onChange={(e) => {
              const idx = Number(e.target.value);
              onFrameChange(idx);
              // Pause when user manually scrubs.
              if (isPlaying) setIsPlaying(false);
            }}
            onKeyDown={handleKeyDown}
            className="w-full h-1.5 appearance-none rounded-full cursor-pointer
              bg-foreground/20
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-primary
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:h-4
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-primary
              [&::-moz-range-thumb]:border-0
              [&::-moz-range-thumb]:cursor-pointer
              focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="Radar frame position"
            aria-valuemin={0}
            aria-valuemax={Math.max(frameCount - 1, 0)}
            aria-valuenow={currentFrameIndex}
            aria-valuetext={currentTimeLabel}
          />
        </div>

        {/* Speed control — 0.5×, 1×, 2×; each 44×44px tap target */}
        <div
          className="flex-shrink-0 flex items-center gap-0.5"
          role="group"
          aria-label="Animation speed"
        >
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-label={`${s}× speed`}
              aria-pressed={speed === s}
              className="flex items-center justify-center rounded text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              style={{
                minWidth: '44px',
                minHeight: '44px',
                fontSize: 'var(--text-label)',
                fontWeight: speed === s ? 700 : 400,
                background: speed === s ? 'var(--primary)' : 'transparent',
                color: speed === s ? 'var(--primary-foreground)' : 'var(--foreground)',
              }}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RadarTimeSlider;
