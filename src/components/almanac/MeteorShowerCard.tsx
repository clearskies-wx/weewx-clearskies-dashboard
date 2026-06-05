// MeteorShowerCard.tsx — Surface G: Meteor Showers (T2.7)
// Horizontally-scrollable shower columns with image, data blocks, and description.
// Layout matches the approved C7-almanac-page.html mockup.

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../ui/card';
import type { MeteorShowerEntry } from '../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MeteorShowerCardProps {
  showers: MeteorShowerEntry[] | null;
  stationTz: string;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Viewing quality — ADR-053 unified 5-tier color scale
// ---------------------------------------------------------------------------

/**
 * Maps the API viewingQuality string to a CSS color.
 * Colors match the mockup exactly:
 *   Excellent=#22c55e, Good=#84cc16, Fair=#eab308, Poor=#f97316, Not Visible=#ef4444
 * Icon fill also uses this color so the eye icon matches the quality text (non-color-only
 * signal: both icon and text label carry the quality information, satisfying WCAG 1.4.1).
 */
function viewingQualityColor(quality: MeteorShowerEntry['viewingQuality']): string {
  switch (quality) {
    case 'Excellent':    return '#22c55e';
    case 'Good':         return '#84cc16';
    case 'Fair':         return '#eab308';
    case 'Poor':         return '#f97316';
    case 'Not Visible':  return '#ef4444';
    default:             return 'currentColor';
  }
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

/**
 * Format an ISO date string (YYYY-MM-DD or full ISO-8601) to a short local
 * date string, e.g. "Jan 3" or "Aug 12".
 * stationTz is accepted but the display is intentionally just month+day —
 * year is omitted for brevity in the range display.
 */
function formatShortDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return isoDate;
  }
}

/**
 * Format an ISO date string to a short date that INCLUDES the year,
 * used for peak-night values (e.g. "Jan 3, 2026").
 */
function formatDateWithYear(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

/**
 * Produce the active date range string, e.g. "Dec 28 – Jan 12".
 * Falls back to just the peak date if active window is absent.
 */
function formatActiveRange(shower: MeteorShowerEntry): string {
  if (shower.activeStart && shower.activeEnd) {
    return `${formatShortDate(shower.activeStart)} – ${formatShortDate(shower.activeEnd)}`;
  }
  return formatShortDate(shower.peakDate);
}

/**
 * Produce the peak-night display string: the peakDate night and next morning,
 * e.g. "Jan 3 – 4, 2026".
 */
function formatPeakNight(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  try {
    const peak = new Date(isoDate);
    const nextDay = new Date(peak);
    nextDay.setDate(peak.getDate() + 1);
    const month = peak.toLocaleDateString('en-US', { month: 'short' });
    const day1 = peak.getDate();
    const day2 = nextDay.getDate();
    const year = peak.getFullYear();
    // Same-month range: "Aug 12 – 13, 2026"
    // Cross-month range: "Dec 31 – Jan 1, 2026" — fall back to full dates
    if (peak.getMonth() === nextDay.getMonth()) {
      return `${month} ${day1} – ${day2}, ${year}`;
    }
    return `${formatDateWithYear(isoDate)} – ${formatShortDate(nextDay.toISOString())}`;
  } catch {
    return formatDateWithYear(isoDate);
  }
}

// ---------------------------------------------------------------------------
// Inline SVG icons (Phosphor-style, matching the mockup paths exactly)
// All icons are aria-hidden — the surrounding label text carries the meaning.
// ---------------------------------------------------------------------------

/** Calendar icon (Phosphor calendar-blank regular) */
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" />
    </svg>
  );
}

/** Shooting star icon (Phosphor shooting-star regular) — used for "Rate" */
function ShootingStarIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M239.35,70.08a13.41,13.41,0,0,0-11.77-9.28l-36.94-2.92L176.43,24.22a13.51,13.51,0,0,0-24.86,0L137.36,57.88,100.42,60.8a13.39,13.39,0,0,0-7.66,23.58l28.06,23.68-8.56,35.39a13.32,13.32,0,0,0,5.1,13.91,13.51,13.51,0,0,0,15,.69L164,139l31.65,19.06a13.54,13.54,0,0,0,15-.69,13.34,13.34,0,0,0,5.09-13.91l-8.56-35.39,28.06-23.68A13.32,13.32,0,0,0,239.35,70.08Z" />
    </svg>
  );
}

/** Eye icon (Phosphor eye regular) — used for "Visibility" */
function EyeIcon({ className, color }: { className?: string; color?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 256 256"
      fill={color ?? 'currentColor'}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z" />
    </svg>
  );
}

/** Info icon (Phosphor info regular) — used in the footer note */
function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: '-2px', marginRight: '4px', flexShrink: 0 }}
    >
      <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ShowerColumn — one shower in the scroll row
// ---------------------------------------------------------------------------

interface ShowerColumnProps {
  shower: MeteorShowerEntry;
}

function ShowerColumn({ shower }: ShowerColumnProps) {
  const qualityColor = viewingQualityColor(shower.viewingQuality ?? null);
  const imageSrc = shower.image
    ? `/images/meteors/${shower.image}`
    : null;

  return (
    /*
     * Each column is a flex column, fixed 190px wide per the mockup.
     * gap-[0.4rem] matches the mockup's .meteor-col gap.
     */
    <article
      className="flex-none w-[190px] flex flex-col gap-[0.4rem]"
      aria-label={shower.name}
    >
      {/* Date row: name + active range left, "Peak" badge right */}
      <div className="flex items-start justify-between w-full gap-[0.3rem]">
        <div className="flex flex-col min-w-0">
          <span
            className="text-[0.9rem] font-bold leading-tight truncate"
            title={shower.name}
          >
            {shower.name}
          </span>
          <span className="text-[0.75rem] text-muted-foreground leading-tight mt-0.5">
            {formatActiveRange(shower)}
          </span>
        </div>
        {/* Red "Peak" pill badge — matches .peak-badge in mockup */}
        <span
          className="flex-shrink-0 px-[0.4rem] py-[0.1rem] rounded-full text-[0.7rem] font-bold uppercase"
          style={{ background: 'rgba(239,68,68,0.18)', color: '#ef4444' }}
          aria-label="Peak period"
        >
          Peak
        </span>
      </div>

      {/* Meteor streak image — 16:10 aspect, cover fit, 4px radius */}
      {imageSrc !== null ? (
        <img
          src={imageSrc}
          alt={`${shower.name} meteor streak`}
          className="w-full block rounded-[4px] object-cover"
          style={{ aspectRatio: '16/10' }}
          loading="lazy"
        />
      ) : (
        /*
         * Fallback placeholder when no image is available.
         * Uses a dark muted background so the card isn't broken visually.
         * aria-hidden because it conveys no information beyond "no image."
         */
        <div
          className="w-full rounded-[4px] bg-muted/40 flex items-center justify-center"
          style={{ aspectRatio: '16/10' }}
          aria-hidden="true"
        >
          <span className="text-[0.7rem] text-muted-foreground/60">—</span>
        </div>
      )}

      {/* Data block — Peak Night */}
      <div className="flex items-center gap-[0.3rem] mt-[0.15rem]">
        <CalendarIcon className="flex-shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-0 leading-none">
          <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground font-semibold leading-[1.2]">
            Peak Night
          </span>
          <span
            className="text-[0.75rem] font-semibold leading-[1.3]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {formatPeakNight(shower.peakDate)}
          </span>
        </div>
      </div>

      {/* Data block — Rate */}
      <div className="flex items-center gap-[0.3rem]">
        <ShootingStarIcon className="flex-shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-0 leading-none">
          <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground font-semibold leading-[1.2]">
            Rate
          </span>
          <span
            className="text-[0.75rem] font-semibold leading-[1.3]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {shower.zhr !== null && shower.zhr !== undefined
              ? `Up to ${shower.zhr} meteors/hr`
              : '—'}
          </span>
        </div>
      </div>

      {/* Data block — Visibility */}
      <div className="flex items-center gap-[0.3rem]">
        {/*
         * Eye icon fill = quality color. The label text ("Visibility") and the
         * quality value text also carry the quality label — no color-only signal
         * (WCAG 1.4.1 satisfied).
         */}
        <EyeIcon color={qualityColor} />
        <div className="flex flex-col gap-0 leading-none">
          <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground font-semibold leading-[1.2]">
            Visibility
          </span>
          <span
            className="text-[0.75rem] font-semibold leading-[1.3]"
            style={{ fontFamily: 'var(--font-display)', color: qualityColor }}
          >
            {shower.viewingQuality ?? '—'}
          </span>
        </div>
      </div>

      {/* Description */}
      {shower.description && (
        <p className="text-[0.85rem] text-muted-foreground leading-[1.4] mt-[0.1rem]">
          {shower.description}
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-64"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// MeteorShowerCard
// ---------------------------------------------------------------------------

/**
 * MeteorShowerCard — Surface G of the Almanac page.
 *
 * Displays a horizontally-scrollable row of meteor shower columns.
 * Each column shows the shower name, active date range, a meteor streak image,
 * three data blocks (Peak Night, Rate, Visibility), and a description.
 *
 * Accessibility notes:
 * - Scroll tabs are <button> elements, keyboard-reachable, with aria-label.
 * - Shower columns are <article> elements with aria-label={name}.
 * - Images have descriptive alt text; missing images have aria-hidden placeholder.
 * - Visibility value is communicated via both color AND text label (WCAG 1.4.1).
 * - Eye icon fill matches quality color; text label also conveys the quality.
 * - Focus indicator: scroll tab buttons use Tailwind's default focus-visible ring.
 * - No outline:none without replacement.
 * - Card heading uses CardTitle as="h2" for correct landmark heading level.
 */
export function MeteorShowerCard({
  showers,
  loading,
  error,
}: MeteorShowerCardProps) {
  const { t } = useTranslation('almanac');

  // Ref for the scrollable row element
  const rowRef = useRef<HTMLDivElement>(null);

  function scrollLeft() {
    rowRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
  }

  function scrollRight() {
    rowRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
  }

  // Loading state
  if (loading) {
    return <CardSkeleton />;
  }

  // Error state — surface the error, no retry (hook owns the fetch; wired in T2.9)
  if (error !== null) {
    return (
      <Card footprint="full">
        <CardContent className="py-8">
          <div role="alert" className="text-sm text-destructive">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (showers === null || showers.length === 0) {
    return (
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h2">{t('meteorShowers.title')}</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          {t('meteorShowers.empty')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card footprint="full">
      <CardHeader>
        {/*
         * CardTitle renders with font-heading (Manrope) per typography tokens.
         * Right-side note "All times local" matches the mockup card-note pattern.
         */}
        <div className="flex items-center justify-between w-full">
          <CardTitle as="h2">{t('meteorShowers.title')}</CardTitle>
          <span className="text-[0.75rem] text-muted-foreground/70 flex items-center gap-[0.3rem]">
            {t('meteorShowers.timesLocal')}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        {/* Subtitle */}
        <p className="text-[0.75rem] text-muted-foreground/70 mb-4">
          {t('meteorShowers.subtitle')}
        </p>

        {/*
         * Scroll container — position:relative so the gradient tabs can be
         * positioned absolute against it.
         * Negative horizontal margin + matching padding offsets let the gradient
         * fade visually reach the card edge while the scroll content stays padded.
         */}
        <div className="relative mx-[-1.5rem] px-[1.5rem]">
          {/*
           * Scroll row — overflow-x:auto, hidden scrollbar (matches mockup).
           * gap-[1.5rem] between columns.
           */}
          <div
            ref={rowRef}
            className="flex gap-[1.5rem] overflow-x-auto pb-1"
            style={{ scrollbarWidth: 'none' }}
            role="list"
            aria-label={t('meteorShowers.scrollRegionLabel')}
          >
            {/* Hide webkit scrollbar via inline style; cannot use Tailwind for this */}
            <style>{`.meteor-scroll-row::-webkit-scrollbar { display: none; }`}</style>

            {showers.map((shower) => (
              <div key={shower.name} role="listitem">
                <ShowerColumn shower={shower} />
              </div>
            ))}
          </div>

          {/*
           * Scroll tabs — full-height gradient fades at left/right edges.
           * Each is a <button> so it is keyboard-reachable and announced as
           * a button by screen readers (not a <div onClick>, per a11y rules).
           * aria-label names the action for screen readers.
           * The ‹ / › chevron characters are decorative; the label carries the meaning.
           */}
          <button
            type="button"
            onClick={scrollLeft}
            aria-label={t('meteorShowers.scrollLeft')}
            className="absolute top-0 bottom-0 left-0 w-7 flex items-center justify-center z-10 text-[18px] font-bold text-muted-foreground hover:text-foreground border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors"
            style={{
              background: 'linear-gradient(to right, var(--card-glass-bg, rgb(30 35 55 / 0.55)) 50%, transparent)',
            }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={scrollRight}
            aria-label={t('meteorShowers.scrollRight')}
            className="absolute top-0 bottom-0 right-0 w-7 flex items-center justify-center z-10 text-[18px] font-bold text-muted-foreground hover:text-foreground border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors"
            style={{
              background: 'linear-gradient(to left, var(--card-glass-bg, rgb(30 35 55 / 0.55)) 50%, transparent)',
            }}
          >
            ›
          </button>
        </div>

        {/* Footer note */}
        <p className="text-[0.7rem] text-muted-foreground/60 mt-3 flex items-center">
          <InfoIcon />
          {t('meteorShowers.footNote')}
        </p>
      </CardContent>
    </Card>
  );
}
