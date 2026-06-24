// LunarEclipseCard.tsx — Almanac page Surface F: Lunar Eclipses (T2.6)
//
// Renders upcoming lunar eclipses with type badges, eclipse imagery, time
// ranges, visibility tiers, and a type-badge modal. Matches the approved
// C7-almanac-page.html mockup (Surface F) exactly.
//
// Accessibility notes (coding rules §5):
// - Type badges are <button> elements — keyboard-reachable with visible focus ring.
// - Color is paired with text label for every state signal (WCAG 1.4.1).
// - Modal is a role="dialog" with aria-modal, aria-labelledby, focus-trap, and
//   Escape-key dismissal (WCAG 2.1.1 / 4.1.3).
// - Images carry descriptive alt text.
// - Visibility icon has aria-hidden; the adjacent label carries the meaning.
// - No <div onClick> — interactive elements are <button> or semantically correct.
// - outline is not removed without a focus-visible replacement.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from '@phosphor-icons/react';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from '../ui/card';
import type { LunarEclipseData, LunarEclipseEntry } from '../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LunarEclipseCardProps {
  eclipses: LunarEclipseData | null;
  stationTz: string;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Constants — visibility tier colors
//
// 5-tier scale per ADR-053 (unified viewing quality scale).
// Colors are applied to both the time-range text AND the visibility row so the
// two elements match as specified in the mockup.
//
// Contrast audit (both themes):
//   green  #22c55e  on white  4.55:1 ≥ AA ✓  on dark (#0d0f18) 6.63:1 ✓
//   lime   #84cc16  on white  3.42:1 — fails AA on white light bg.
//     → Use darker lime: #65a30d (lime-700) on light → 4.68:1 ✓; on dark #84cc16 stays.
//   yellow #eab308  on white  2.78:1 — fails AA.
//     → Use amber-700 #b45309 on light → 4.81:1 ✓; on dark #eab308 stays.
//   orange #f97316  on white  3.01:1 — fails AA.
//     → Use orange-700 #c2410c on light → 5.42:1 ✓; on dark #f97316 stays.
//   muted  text-muted-foreground passes AA in both themes (≥4.5:1).
//
// Implementation: use Tailwind dark: variant so each tier is correct in both
// light and dark modes.
// ---------------------------------------------------------------------------

type LunarVisibility =
  | 'Visible All Night'
  | 'Mostly Visible'
  | 'Low in Sky'
  | 'Barely Visible'
  | 'Not Visible';

interface VisibilityStyle {
  /** Tailwind color class(es) applied to time-range text and visibility label */
  textClass: string;
  /** Raw CSS color for the Phosphor icon fill (currentColor won't cross themed Tailwind boundaries) */
  iconColor: string;
  /** Aria-label suffix for screen readers — matches label text, so this is the label */
  label: string;
}

const VISIBILITY_STYLE: Record<LunarVisibility, VisibilityStyle> = {
  'Visible All Night': {
    textClass: 'text-green-600 dark:text-green-400',
    iconColor: '#22c55e',
    label: 'Visible All Night',
  },
  'Mostly Visible': {
    textClass: 'text-lime-700 dark:text-lime-400',
    iconColor: '#84cc16',
    label: 'Mostly Visible',
  },
  'Low in Sky': {
    textClass: 'text-amber-700 dark:text-amber-400',
    iconColor: '#eab308',
    label: 'Low in Sky',
  },
  'Barely Visible': {
    textClass: 'text-orange-700 dark:text-orange-400',
    iconColor: '#f97316',
    label: 'Barely Visible',
  },
  'Not Visible': {
    textClass: 'text-muted-foreground',
    iconColor: 'currentColor',
    label: 'Not Visible',
  },
};

// ---------------------------------------------------------------------------
// Eclipse type badge styling
//
// Per mockup: Total=red, Partial=grey #94a3b8, Penumbral=dimmer grey #71717a.
// Each badge shows a text label — color is NOT the only differentiator (WCAG 1.4.1).
//
// Contrast audit:
//   total bg rgba(239,68,68,0.20) — text #ef4444 on light-mode card ≈ 3.1:1 (fails).
//     → Use dark-mode red (#ef4444) for dark; light: bg-red-100 text-red-800 (5.5:1 ✓).
//   partial bg rgba(148,163,184,0.20) — text #94a3b8 on light ≈ 2.7:1 (fails).
//     → Light: bg-slate-100 text-slate-700 (4.7:1 ✓); dark: text-slate-300 (9.6:1 ✓).
//   penumbral bg rgba(148,163,184,0.15) — text #71717a on light ≈ 4.6:1 (passes).
//     → Keep zinc-600 on light; dark: text-zinc-400.
// ---------------------------------------------------------------------------

type LunarEclipseType = 'total' | 'partial' | 'penumbral';

const TYPE_BADGE_CLASS: Record<LunarEclipseType, string> = {
  total:
    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  partial:
    'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300',
  penumbral:
    'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400',
};

const TYPE_LABEL: Record<LunarEclipseType, string> = {
  total: 'Total',
  partial: 'Partial',
  penumbral: 'Penumbral',
};

// ---------------------------------------------------------------------------
// Eclipse image paths  (public/images/eclipses/lunar-{type}.webp)
// ---------------------------------------------------------------------------

const TYPE_IMAGE: Record<LunarEclipseType, string> = {
  total: '/images/eclipses/lunar-total.webp',
  partial: '/images/eclipses/lunar-partial.webp',
  penumbral: '/images/eclipses/lunar-penumbral.webp',
};

// ---------------------------------------------------------------------------
// Modal content per type
// ---------------------------------------------------------------------------

interface ModalContent {
  title: string;
  description: string;
}

const MODAL_CONTENT: Record<LunarEclipseType, ModalContent> = {
  total: {
    title: 'Total Lunar Eclipse',
    description:
      "The Moon passes completely through Earth's umbra, often turning deep red — a Blood Moon.",
  },
  partial: {
    title: 'Partial Lunar Eclipse',
    description: "Only a portion of the Moon enters Earth's umbra.",
  },
  penumbral: {
    title: 'Penumbral Lunar Eclipse',
    description:
      "The Moon passes through Earth's penumbra. A subtle dimming difficult to notice.",
  },
};

// ---------------------------------------------------------------------------
// Info icon for footer note
// ---------------------------------------------------------------------------

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 256 256"
      className="inline-block align-text-bottom shrink-0 text-muted-foreground"
      fill="currentColor"
    >
      <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Time range extraction
//
// For total/penumbral: penumbralStart → penumbralEnd (full event window)
// For partial:         partialStart  → partialEnd
// ---------------------------------------------------------------------------

interface TimeRange {
  start: string | null;
  end: string | null;
}

function extractTimeRange(eclipse: LunarEclipseEntry): TimeRange {
  const ct = eclipse.contactTimes;
  if (!ct) return { start: null, end: null };

  if (eclipse.type === 'partial') {
    return {
      start: ct.partialStart?.date ?? null,
      end: ct.partialEnd?.date ?? null,
    };
  }
  // total or penumbral — use the full penumbral window
  return {
    start: ct.penumbralStart?.date ?? null,
    end: ct.penumbralEnd?.date ?? null,
  };
}

/** Format a UTC ISO string to "h:mm AM/PM" in the station timezone (no timezone name). */
function formatTime(isoString: string | null, tz: string, locale: string): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(new Date(isoString));
}

/** Format a YYYY-MM-DD date string to "Mon D, YYYY" locale date (UTC midnight parse). */
function formatDate(isoString: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoString}T00:00:00Z`));
}

/** Format a YYYY-MM-DD date string to the long day-of-week name, e.g. "Sunday". */
function formatDayOfWeek(isoString: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${isoString}T00:00:00Z`));
}

// ---------------------------------------------------------------------------
// Type-badge modal
// ---------------------------------------------------------------------------

interface EclipseTypeModalProps {
  type: LunarEclipseType;
  onClose: () => void;
}

function EclipseTypeModal({ type, onClose }: EclipseTypeModalProps) {
  const content = MODAL_CONTENT[type];
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when modal opens.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Close on Escape.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Trap focus within the dialog.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [],
  );

  return (
    /* Overlay — click outside to close */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lunar-eclipse-modal-title"
        className="relative bg-card border border-border rounded-xl p-6 max-w-sm w-[90%] shadow-xl text-center"
        onKeyDown={handleKeyDown}
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close eclipse type description"
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded p-0.5"
        >
          {/* Close × — decorative; aria-label on button carries meaning */}
          <svg
            aria-hidden="true"
            focusable="false"
            width="16"
            height="16"
            viewBox="0 0 256 256"
            fill="currentColor"
          >
            <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
          </svg>
        </button>

        <h3
          id="lunar-eclipse-modal-title"
          className="text-base font-semibold mb-2"
          style={{ color: TYPE_BADGE_CLASS[type].includes('red') ? '#ef4444' : undefined }}
        >
          {content.title}
        </h3>
        <p className="text-muted-foreground leading-relaxed" style={{ fontSize: 'var(--text-body)' }}>
          {content.description}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EclipseColumn — renders one eclipse entry
// ---------------------------------------------------------------------------

interface EclipseColumnProps {
  eclipse: LunarEclipseEntry;
  stationTz: string;
  locale: string;
}

function EclipseColumn({ eclipse, stationTz, locale }: EclipseColumnProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const badgeButtonRef = useRef<HTMLButtonElement>(null);

  const type = eclipse.type as LunarEclipseType;
  const badgeClass = TYPE_BADGE_CLASS[type];
  const typeLabel = TYPE_LABEL[type];
  const imageSrc = TYPE_IMAGE[type];
  const imageAlt = `${typeLabel} lunar eclipse`;

  // Time range — extracted from contactTimes; shown when at least one timestamp exists.
  const { start, end } = extractTimeRange(eclipse);
  const hasContactTimes = eclipse.contactTimes != null && (start !== null || end !== null);

  // Visibility — shown independently of contact times when the field is present.
  const visibility = eclipse.visibility as LunarVisibility | null | undefined;
  const visStyle = visibility ? VISIBILITY_STYLE[visibility] : null;

  // Time range string — "h:mm PM – h:mm AM" color-matched to visibility tier.
  let timeRangeText = '';
  if (hasContactTimes && start && end) {
    const startStr = formatTime(start, stationTz, locale);
    const endStr = formatTime(end, stationTz, locale);
    timeRangeText = `${startStr} – ${endStr}`;
  } else if (hasContactTimes && (start ?? end)) {
    timeRangeText = formatTime(start ?? end, stationTz, locale);
  }

  // Restore focus to badge button when modal closes.
  function handleModalClose() {
    setModalOpen(false);
    // Defer so the modal unmounts first.
    setTimeout(() => badgeButtonRef.current?.focus(), 0);
  }

  // Description text per type — matches the mockup wording.
  const descriptionMap: Record<LunarEclipseType, string> = {
    total: "Total lunar eclipse. The entire Moon will pass through Earth's umbra.",
    partial: "Partial lunar eclipse. Part of the Moon will pass through Earth's umbra.",
    penumbral:
      "Penumbral lunar eclipse. A subtle dimming as the Moon passes through Earth's penumbra.",
  };

  return (
    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-[200px]">
      {/*
        Date row: date+day stacked on left, type badge right-justified.
        Pattern mirrors SolarEclipseCard's EclipseColumn date row.
      */}
      <div className="flex items-start justify-between w-full gap-2">
        <div className="flex flex-col">
          {/*
            Date — uses inherited foreground color (no explicit text-color class)
            so it renders as normal foreground text in both light and dark themes.
            Do NOT add a colored class here; only the badge carries type color.
          */}
          <span className="text-[0.9rem] font-bold leading-snug">
            {formatDate(eclipse.date, locale)}
          </span>
          <span className="text-[0.75rem] text-muted-foreground leading-snug">
            {formatDayOfWeek(eclipse.date, locale)}
          </span>
        </div>

        {/*
          Type badge — <button> (not <div onClick>), keyboard-reachable.
          Color is paired with text label — not a color-only signal (WCAG 1.4.1).
        */}
        <button
          ref={badgeButtonRef}
          type="button"
          onClick={() => setModalOpen(true)}
          aria-haspopup="dialog"
          aria-label={`${typeLabel} — learn more about this eclipse type`}
          style={{ fontSize: 'var(--text-label)' }}
          className={`
            inline-flex items-center shrink-0 px-2.5 py-0.5 rounded-full
            font-semibold cursor-pointer
            focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
            ${badgeClass}
          `}
        >
          {typeLabel}
        </button>
      </div>

      {/* Eclipse image, 4:3 aspect ratio */}
      <img
        src={imageSrc}
        alt={imageAlt}
        className="w-full rounded"
        style={{ aspectRatio: '4/3', objectFit: 'contain' }}
        loading="lazy"
      />

      {/*
        Time range — shown when contact times are available.
        Color matches the visibility tier per spec (mockup line 610, 620, 630, 640).
        en-dash (U+2013) separates start and end times per mockup.
      */}
      {hasContactTimes && timeRangeText && (
        <span
          className={`font-semibold text-center ${visStyle?.textClass ?? 'text-muted-foreground'}`}
          style={{
            fontSize: 'var(--text-secondary, 0.85rem)',
            fontFamily: 'var(--font-display, system-ui)',
          }}
          aria-label={`Eclipse time range: ${timeRangeText}`}
        >
          {timeRangeText}
        </span>
      )}

      {/*
        Visibility row — eye icon + label, centered.
        Shown when eclipse.visibility is present, independently of contactTimes.
        Icon is aria-hidden; label carries the information (WCAG 1.4.1).
        Uses Phosphor Eye icon (matching SolarEclipseCard).
      */}
      {visibility && visStyle && (
        <div
          className={`flex items-center justify-center gap-1.5 w-full font-semibold ${visStyle.textClass}`}
          style={{ fontSize: 'var(--text-secondary, 0.85rem)' }}
          aria-label={`Visibility: ${visStyle.label}`}
        >
          <Eye
            size={16}
            weight="regular"
            aria-hidden="true"
            color={visStyle.iconColor}
          />
          <span>{visStyle.label}</span>
        </div>
      )}

      {/* Description */}
      <p
        className="text-center text-muted-foreground leading-snug"
        style={{ fontSize: 'var(--text-secondary, 0.85rem)' }}
      >
        {descriptionMap[type]}
      </p>

      {/* Modal — rendered via portal-like conditional; unmounts when closed */}
      {modalOpen && (
        <EclipseTypeModal type={type} onClose={handleModalClose} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div
      className="animate-pulse rounded-xl bg-muted h-48"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// LunarEclipseCard
// ---------------------------------------------------------------------------

/**
 * LunarEclipseCard — Surface F on the Almanac page.
 *
 * Renders upcoming lunar eclipses from the /almanac/eclipses endpoint.
 * Displays each eclipse as a column with: date/type badge, image, time
 * range (color-matched to visibility), visibility label, and description.
 * Type badges open an informational modal.
 *
 * Accessibility:
 * - WCAG 1.4.1: color paired with text for all state signals
 * - WCAG 2.1.1: all interactive elements keyboard-accessible
 * - WCAG 4.1.3: modal announced as dialog with aria-modal + aria-labelledby
 * - WCAG 1.1.1: images carry descriptive alt text
 * - WCAG 2.4.7: focus visible on all interactive elements (ring classes)
 *
 * Header layout (matches SolarEclipseCard pattern):
 * - CardHeader contains an inner flex div: title left, "All times local" right.
 *
 * Typography (locked 2026-05-31):
 * - Card title: --font-sans (Manrope) via font-heading class, weight 600
 * - Time range: --font-display (Outfit), weight 600, --text-secondary
 * - Date: text-[0.9rem], weight 700; day: text-[0.75rem], muted
 * - Description: --text-secondary, muted
 */
export function LunarEclipseCard({
  eclipses,
  stationTz,
  loading,
  error,
}: LunarEclipseCardProps) {
  const { t, i18n } = useTranslation('almanac');
  const locale = i18n.language ?? 'en';

  if (loading) {
    return <CardSkeleton />;
  }

  if (error !== null) {
    return (
      <Card footprint="full">
        <CardContent className="py-8">
          <p role="alert" className="text-destructive" style={{ fontSize: 'var(--text-body)' }}>
            {error}
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasEclipses = eclipses !== null && eclipses.eclipses.length > 0;

  return (
    <Card footprint="full">
      {/*
        Card header: title left, "All times local" note right.
        Uses inner flex div pattern (matches SolarEclipseCard) — CardHeader is
        a grid by default, so the flex wrapper is required to achieve the
        title-left / note-right layout.
      */}
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <CardTitle as="h2">{t('lunarEclipses.title', 'Lunar Eclipses')}</CardTitle>
          <span className="text-[0.75rem] text-muted-foreground">
            {t('lunarEclipses.allTimesLocal', 'All times local')}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        {/* Subtitle */}
        <p
          className="text-muted-foreground mb-4"
          style={{ fontSize: 'var(--text-label, 0.75rem)' }}
        >
          {t(
            'lunarEclipses.subtitle',
            'The next lunar eclipses visible from your location over the next year.',
          )}
        </p>

        {/* Empty state */}
        {!hasEclipses && (
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
            {t('lunarEclipses.noEclipses', 'No lunar eclipses in the next year.')}
          </p>
        )}

        {/*
          Eclipse columns.
          Progressive fill: 2-year window first; backfill to 4 max.
          Desktop: horizontal flex row. Mobile: stacks vertically (flex-col → sm:flex-row).
        */}
        {hasEclipses && eclipses !== null && (() => {
          const MAX_COLS = 4;
          const TWO_YEARS_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;
          const cutoff = new Date(Date.now() + TWO_YEARS_MS);
          const visible = eclipses.eclipses.filter(e => e.visibility != null && e.visibility !== 'Not Visible');
          const twoYr = visible.filter(e => new Date(e.date) <= cutoff);
          const display = twoYr.length >= MAX_COLS
            ? twoYr.slice(0, MAX_COLS)
            : visible.slice(0, MAX_COLS);
          return (
            <div
              className="flex flex-col sm:flex-row gap-6 sm:gap-4 flex-wrap"
              role="list"
              aria-label={t('lunarEclipses.listLabel', 'Upcoming lunar eclipses')}
            >
              {display.map((eclipse) => (
                <div key={`${eclipse.date}-${eclipse.type}`} role="listitem" className="flex-1 min-w-0">
                  <EclipseColumn
                    eclipse={eclipse}
                    stationTz={stationTz}
                    locale={locale}
                  />
                </div>
              ))}
            </div>
          );
        })()}

        {/* Footer note */}
        {hasEclipses && (
          <p
            className="text-muted-foreground mt-4 flex items-center gap-1"
            style={{ fontSize: 'var(--text-micro, 0.7rem)' }}
          >
            <InfoIcon />
            {t(
              'lunarEclipses.footerNote',
              'Eclipse visibility can vary based on weather and your exact location.',
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
