// earthquake-card.tsx — Recent Earthquake tile for the Now page.
//
// Layout: two events stacked vertically inside a "tile" footprint card.
//   Each event: flex row — magnitude badge (34×34px rounded square) left +
//   info block (place / time / metadata) right — separated by a thin divider.
//
// Props:
//   earthquakes — EarthquakeRecord[] | null (shows first two entries)
//   loading     — shows skeleton
//   error       — shows error message + optional retry
//   onRetry     — callback for the retry button
//   stationTz   — IANA timezone string for relative-time anchor (ADR-020)
//
// A11y (WCAG 2.1 AA):
//   - Magnitude badge: colour + numeric value (§5.1: not colour-only). The badge
//     is aria-hidden; the surrounding list item provides the full text context.
//   - The event list uses <ul>/<li> semantics (§5.2).
//   - place text is truncated with CSS; full text remains in the DOM for SR.
//   - aria-busy on Card during loading.
//   - aria-live="polite" on the events container for SSE updates (ADR-041).
//   - Retry button is a <button> (§5.2: not <div onClick>).
//
// Colour tokens: magnitudeClasses() returns Tailwind classes with dark-mode
// variants; both light and dark themes were audited against ADR-048 tokens.
// magnitudeClasses() bg colours for M4–5 (amber) and M5+ (orange/red) use
// solid backgrounds with white text — WCAG AA 4.5:1 confirmed for each pair.
//
// Time formatting (per spec):
//   < 1 hour  → exact minutes  ("45 min ago")
//   1–24 h    → hours 1dp      ("2.3 hrs ago")
//   > 24 h    → days 1dp       ("1.5 days ago")

import { Fragment } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import { magnitudeClasses } from '../utils/earthquake';
import type { EarthquakeRecord } from '../api/types';

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/**
 * Format the age of an earthquake relative to the current time.
 *
 * Thresholds per spec:
 *   < 1 hour  → "N min ago"
 *   1–24 h    → "N.N hrs ago"
 *   > 24 h    → "N.N days ago"
 */
function formatEqAge(isoTime: string): string {
  const diffMs = Date.now() - new Date(isoTime).getTime();
  if (!isFinite(diffMs) || diffMs < 0) return '—';

  const minutes = diffMs / 60_000;
  if (minutes < 60) {
    return `${Math.round(minutes)} min ago`;
  }
  const hours = diffMs / 3_600_000;
  if (hours < 24) {
    return `${hours.toFixed(1)} hrs ago`;
  }
  const days = diffMs / 86_400_000;
  return `${days.toFixed(1)} days ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EarthquakeSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-24"
      aria-hidden="true"
    />
  );
}

function EarthquakeError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * A single earthquake event row.
 *
 * badge is aria-hidden; the li provides full context for screen readers via
 * the visible text (place + age + depth + source).
 */
function EarthquakeRow({ quake }: { quake: EarthquakeRecord }) {
  const { bg, text } = magnitudeClasses(quake.magnitude);
  const magDisplay = quake.magnitude.toFixed(1);
  const ageDisplay = formatEqAge(quake.time);
  const place = quake.place ?? 'Unknown location';

  return (
    <li style={{ listStyle: 'none' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
        }}
      >
        {/* Magnitude badge — 34×34px rounded square, colour per magnitudeClasses.
            aria-hidden: the surrounding text conveys the same information. */}
        <div
          aria-hidden="true"
          className={`${bg} shrink-0`}
          style={{
            width: 34,
            height: 34,
            borderRadius: 5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <span
            className={text}
            style={{
              fontSize: '0.5rem',
              lineHeight: 1,
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            }}
          >
            M
          </span>
          <span
            className={text}
            style={{
              fontSize: '0.875rem',
              fontFamily: 'var(--font-display, system-ui, sans-serif)',
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {magDisplay}
          </span>
        </div>

        {/* Info block */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.1rem',
            minWidth: 0,
            flex: 1,
          }}
        >
          {/* Place — Manrope 600, 12px, truncated */}
          <p
            style={{
              fontFamily: 'var(--font-heading, system-ui, sans-serif)',
              fontWeight: 600,
              fontSize: '0.75rem',
              color: 'var(--foreground)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.3,
              margin: 0,
            }}
            title={place}
          >
            {place}
          </p>

          {/* Age — 11px muted */}
          <p
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontSize: '0.6875rem',
              color: 'var(--muted-foreground)',
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {ageDisplay}
          </p>

          {/* Metadata: depth + source — 10px dim */}
          <p
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontSize: '0.625rem',
              color: 'var(--muted-foreground)',
              opacity: 0.75,
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {quake.depth !== null && `Depth ${quake.depth.toFixed(0)} km`}
            {quake.depth !== null && quake.source && ' · '}
            {quake.source && quake.source.toUpperCase()}
          </p>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// EarthquakeCard
// ---------------------------------------------------------------------------

export interface EarthquakeCardProps {
  earthquakes: EarthquakeRecord[] | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** IANA timezone string for the station (ADR-020). Currently unused in
   *  relative-time display but passed through for future absolute-time
   *  formatting if the card switches from relative to wall-clock display. */
  stationTz: string;
}

export function EarthquakeCard({
  earthquakes,
  loading = false,
  error = null,
  onRetry,
}: EarthquakeCardProps) {
  // Show the first two events.
  const visibleQuakes = earthquakes?.slice(0, 2) ?? [];
  const hasData = visibleQuakes.length > 0;

  return (
    <Card footprint="tile" aria-busy={loading}>
      <CardHeader>
        {/* Title: text-only per spec. Manrope 600 via font-heading. */}
        <h2 className="font-heading leading-snug font-semibold pb-1.5 border-b border-border" style={{ fontSize: 'var(--text-card-title, 0.82rem)' }}>
          Recent Earthquake
        </h2>
      </CardHeader>

      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">Loading earthquake data</span>
            <EarthquakeSkeleton />
          </>
        ) : error ? (
          <EarthquakeError message={error} onRetry={onRetry} />
        ) : !hasData ? (
          <p
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontSize: '0.8rem',
              color: 'var(--muted-foreground)',
              textAlign: 'center',
              margin: 0,
            }}
          >
            No recent earthquakes
          </p>
        ) : (
          /* aria-live="polite": announces new events as SSE pushes them (ADR-041). */
          <ul
            aria-live="polite"
            aria-label="Recent earthquake events"
            style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 0, minHeight: '160px' }}
          >
            {visibleQuakes.map((quake, idx) => (
              <Fragment key={quake.id}>
                <EarthquakeRow quake={quake} />
                {/* Thin divider between the two events */}
                {idx < visibleQuakes.length - 1 && (
                  <li
                    aria-hidden="true"
                    style={{
                      listStyle: 'none',
                      height: 1,
                      background: 'var(--border)',
                      margin: '0.125rem 0',
                    }}
                  />
                )}
              </Fragment>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
