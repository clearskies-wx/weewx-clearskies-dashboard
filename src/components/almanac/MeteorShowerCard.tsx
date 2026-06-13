// MeteorShowerCard.tsx — Surface G: Meteor Showers (T2.7)
// Horizontally-scrollable shower columns with image, data blocks, and description.
// Layout matches the approved C7-almanac-page.html mockup.

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeSlash } from '@phosphor-icons/react';
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
function viewingQualityClass(quality: MeteorShowerEntry['viewingQuality']): string {
  switch (quality) {
    case 'Excellent':    return 'text-green-700 dark:text-green-400';
    case 'Good':         return 'text-lime-700 dark:text-lime-400';
    case 'Fair':         return 'text-amber-700 dark:text-amber-400';
    case 'Poor':         return 'text-orange-700 dark:text-orange-400';
    case 'Not Visible':  return 'text-red-700 dark:text-red-400';
    default:             return 'text-muted-foreground';
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
  const qClass = viewingQualityClass(shower.viewingQuality ?? null);
  const isNotVisible = shower.viewingQuality === 'Not Visible';
  const imageSrc = shower.image
    ? `/images/meteors/${shower.image}`
    : null;

  return (
    /*
     * Mobile: full-width vertical block (width controlled by parent wrapper).
     * Desktop (md+): fixed 190px wide per the mockup.
     * gap-[0.4rem] matches the mockup's .meteor-col gap.
     */
    <article
      className="flex-none w-full md:w-[190px] flex flex-col gap-[0.4rem]"
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
        {isNotVisible
          ? <EyeSlash size={16} weight="regular" aria-hidden="true" className={qClass} />
          : <Eye size={16} weight="regular" aria-hidden="true" className={qClass} />
        }
        <div className="flex flex-col gap-0 leading-none">
          <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground font-semibold leading-[1.2]">
            Visibility
          </span>
          <span
            className={`text-[0.75rem] font-semibold leading-[1.3] ${qClass}`}
            style={{ fontFamily: 'var(--font-display)' }}
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
         * Mobile: vertical stack — each shower column gets its own full-width block.
         *   No scroll container, no arrow buttons, no negative margin trick.
         * Desktop (md+): horizontal scroll row — original layout with scroll arrows
         *   and gradient fade tabs.
         *
         * The relative/mx-[-1.5rem] wrapper is only needed on desktop for the
         * absolute-positioned scroll buttons to reach the card edge.
         */}

        {/* Mobile layout: vertical stack (below md) */}
        <div
          className="flex flex-col gap-[1.5rem] md:hidden"
          role="list"
          aria-label={t('meteorShowers.scrollRegionLabel')}
        >
          {showers.map((shower) => (
            <div key={shower.name} role="listitem">
              {/* On mobile each ShowerColumn is full-width; override the fixed 190px width */}
              <div style={{ width: '100%' }}>
                <ShowerColumn shower={shower} />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop layout: horizontal scroll row with arrow buttons (md+) */}
        <div className="hidden md:block relative mx-[-1.5rem] px-[1.5rem]">
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
