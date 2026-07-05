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

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from './ui/card';
import { magnitudeClasses } from '../utils/earthquake';
import { formatRelativeTime } from '../utils/format-date';
import { formatNumber } from '../utils/format-number';
import type { EarthquakeRecord, UnitsBlock } from '../api/types';
import type { CardComponentProps } from '../lib/card-registry';

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/**
 * Format the age of an earthquake relative to the current time as a
 * locale-correct relative time string (e.g. "3 minutes ago", "vor 3
 * Minuten"). Delegates unit selection (minutes/hours/days) to
 * formatRelativeTime — see utils/format-date.ts.
 */
function formatEqAge(isoTime: string, locale: string): string {
  const offsetMs = new Date(isoTime).getTime() - Date.now();
  if (!isFinite(offsetMs) || offsetMs > 0) return '—';
  return formatRelativeTime(offsetMs, locale);
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
  const { t } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-col gap-2 items-start" style={{ fontSize: 'var(--text-body)' }}>
      <p className="text-destructive">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
          style={{ fontSize: 'var(--text-label)' }}
        >
          {t('retry')}
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
function EarthquakeRow({
  quake,
  t,
  locale,
  depthUnit,
  distanceUnit,
}: {
  quake: EarthquakeRecord;
  t: TFunction;
  locale: string;
  depthUnit: string;
  distanceUnit: string;
}) {
  const { bg, text } = magnitudeClasses(quake.magnitude);
  const magDisplay = formatNumber(quake.magnitude, 1, locale);
  const ageDisplay = formatEqAge(quake.time, locale);
  const place = quake.place ?? t('earthquake.unknownLocation');

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
              fontSize: 'var(--text-micro)',
              lineHeight: 1,
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            }}
          >
            M
          </span>
          <span
            className={text}
            style={{
              fontSize: 'var(--text-secondary)',
              fontFamily: 'var(--font-display, system-ui, sans-serif)',
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {magDisplay}
          </span>
        </div>

        {/* Info block. Line-height is tightened to 1.15 (from 1.3) on this
            3-line text stack specifically to keep 2 rows + the "View all"
            link (added below, T7.4) within the tile's fixed rigid-mode
            content box (DESIGN-MANUAL §5) — the box does not grow, so the
            new link has to be paid for out of existing whitespace rather
            than pushed off (which `overflow: hidden` would silently clip). */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.05rem',
            minWidth: 0,
            flex: 1,
          }}
        >
          {/* Place — Manrope 600, truncated */}
          <p
            style={{
              fontFamily: 'var(--font-heading, system-ui, sans-serif)',
              fontWeight: 600,
              fontSize: 'var(--text-label)',
              color: 'var(--foreground)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.15,
              margin: 0,
            }}
            title={place}
          >
            {place}
          </p>

          {/* Age — muted */}
          <p
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontSize: 'var(--text-label)',
              color: 'var(--muted-foreground)',
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            {ageDisplay}
          </p>

          {/* Metadata: depth + distance from station — dim */}
          <p
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontSize: 'var(--text-micro)',
              color: 'var(--muted-foreground)',
              opacity: 0.75,
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            {quake.depth !== null && t('earthquake.depth', { depth: formatNumber(quake.depth, 0, locale), unit: depthUnit })}
            {quake.depth !== null && quake.distance !== null && ' · '}
            {quake.distance !== null && t('earthquake.distanceAway', { distance: formatNumber(quake.distance, 0, locale), unit: distanceUnit })}
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
  /** Response envelope's `units` block (depth/distance unit labels). */
  units?: UnitsBlock;
}

function EarthquakeCardContent({
  earthquakes,
  loading = false,
  error = null,
  onRetry,
  units,
}: EarthquakeCardProps) {
  const { t, i18n } = useTranslation(['now', 'seismic']);
  const locale = i18n.language;
  const depthUnit = units?.depth ?? 'km';
  const distanceUnit = units?.distance ?? 'km';

  // Show the first two events.
  const visibleQuakes = earthquakes?.slice(0, 2) ?? [];
  const hasData = visibleQuakes.length > 0;

  return (
    <Card footprint="tile" aria-busy={loading}>
      <CardHeader>
        {/* Title: text-only per spec. Manrope 600 via font-heading. */}
        <CardTitle as="h2">{t('recentEarthquake')}</CardTitle>
      </CardHeader>

      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loading.earthquake')}</span>
            <EarthquakeSkeleton />
          </>
        ) : error ? (
          onRetry ? (
            <EarthquakeError message={t('error.earthquake')} onRetry={onRetry} />
          ) : (
            <p role="alert" className="text-muted-foreground" style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', fontSize: 'var(--text-secondary)' }}>
              {t('error.earthquake')}
            </p>
          )
        ) : !hasData ? (
          <p
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontSize: 'var(--text-body)',
              color: 'var(--muted-foreground)',
              textAlign: 'center',
              margin: 0,
            }}
          >
            {t('noData.earthquake')}
          </p>
        ) : (
          <>
            {/* aria-live="polite": announces new events as SSE pushes them (ADR-041). */}
            <ul
              aria-live="polite"
              aria-label={t('earthquake.eventsAriaLabel')}
              style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}
            >
              {visibleQuakes.map((quake) => (
                <EarthquakeRow
                  key={quake.id}
                  quake={quake}
                  t={t}
                  locale={locale}
                  depthUnit={depthUnit}
                  distanceUnit={distanceUnit}
                />
              ))}
            </ul>
            <Link
              to="/seismic"
              className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded self-start"
              style={{ fontSize: 'var(--text-micro)', marginTop: '0.125rem' }}
            >
              {t('viewAll', { ns: 'seismic' })} →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DataBag-aware component (CardComponentProps — T0B.2 contract)
// ---------------------------------------------------------------------------

export function EarthquakeCard(props: CardComponentProps): React.ReactElement;
export function EarthquakeCard(props: EarthquakeCardProps): React.ReactElement;
export function EarthquakeCard(props: CardComponentProps | EarthquakeCardProps): React.ReactElement {
  if ('dataBag' in props) {
    // DataBag path — self-extract from /api/v1/earthquakes; use stationTz from CardComponentProps
    const eqData = props.dataBag['/api/v1/earthquakes'] as {
      data?: EarthquakeRecord[] | null;
      loading?: boolean;
      error?: unknown;
      units?: UnitsBlock;
    } | undefined;

    return (
      <EarthquakeCardContent
        earthquakes={eqData?.data ?? null}
        loading={eqData?.loading ?? true}
        error={eqData?.error ? 'error' : null}
        stationTz={props.stationTz}
        units={eqData?.units}
        // omit onRetry → renders muted text instead of retry button
      />
    );
  }
  // Legacy path — explicit props
  return (
    <EarthquakeCardContent
      earthquakes={props.earthquakes}
      loading={props.loading}
      error={props.error}
      onRetry={props.onRetry}
      stationTz={props.stationTz}
      units={props.units}
    />
  );
}

export default EarthquakeCard;
