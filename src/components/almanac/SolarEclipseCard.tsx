// SolarEclipseCard.tsx — Solar Eclipse card for the Almanac page (C7).
//
// Renders upcoming solar eclipses from the /almanac/eclipses API response,
// matching the approved Surface E layout in docs/design/mockups/C7-almanac-page.html.
//
// Layout (per mockup):
//   - Card header: "Solar Eclipses" title + "All times local" note
//   - Subtitle paragraph
//   - Columns row: one column per eclipse (date+badge / image / visibility / contact-times / description)
//   - Footer note with info icon
//   - Type badge modal: opened by clicking Total/Annular/Partial badge
//
// A11y (WCAG 2.1 AA):
//   - All interactive elements are <button> — no <div onClick>.
//   - Modal: focus-trapped, Escape-to-close, backdrop-click-to-close, role="dialog" aria-modal.
//   - Type badge has aria-haspopup="dialog" and a visible focus indicator.
//   - Eye / eye-slash icons supplemented with visible text ("Visible" / "Not Visible").
//   - Color is NEVER the sole state signal — text label always accompanies color.
//   - Loading state: aria-busy + role="status".
//   - Error state: role="alert".
//   - Images have meaningful alt text.
//
// Graceful degradation:
//   - If contactTimes is null/absent, date + type + image are shown; contact-times
//     and visibility sections are omitted.
//
// i18n: useTranslation('almanac') — English strings hardcoded as t() fallback
//       values until T2.10 populates the locale JSON files.
//
// Time: formatLocalTime from src/utils/time.ts (ADR-020).
// Icons: @phosphor-icons/react (Eye, EyeSlash, Sun, Info, X).

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeSlash, Sun, Info, X } from '@phosphor-icons/react';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from '../ui/card';
import type { SolarEclipseData, SolarEclipseEntry } from '../../api/types';
import { formatLocalTime } from '../../utils/time';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SolarEclipseCardProps {
  eclipses: SolarEclipseData | null;
  stationTz: string;
  loading: boolean;
  error: string | null;
}

type EclipseType = 'total' | 'annular' | 'partial';

// ---------------------------------------------------------------------------
// Constants — visibility color classes (theme-aware, ADR-053 5-tier scale)
//
// Light theme uses darker shades to pass WCAG AA (≥4.5:1) on white glass card.
// Dark theme uses vivid shades that pass on dark backgrounds.
// ---------------------------------------------------------------------------

const VISIBILITY_CLASSES: Record<string, string> = {
  'Fully Visible':     'text-green-700 dark:text-green-400',
  'Mostly Visible':    'text-lime-700 dark:text-lime-400',
  'Partially Visible': 'text-amber-700 dark:text-amber-400',
  'Barely Visible':    'text-orange-700 dark:text-orange-400',
  'Not Visible':       'text-muted-foreground',
};

// ---------------------------------------------------------------------------
// Type badge styles (color-coded by eclipse type)
// ---------------------------------------------------------------------------

const TYPE_BADGE_STYLES: Record<EclipseType, { bg: string; fg: string }> = {
  total:   { bg: 'rgba(239,68,68,0.20)',   fg: '#ef4444' },
  annular: { bg: 'rgba(245,158,11,0.20)',  fg: '#f59e0b' },
  partial: { bg: 'rgba(148,163,184,0.20)', fg: '#94a3b8' },
};

// ---------------------------------------------------------------------------
// Type definitions for the modal
// ---------------------------------------------------------------------------

interface EclipseTypeDefinition {
  nameKey: string;
  descKey: string;
  defaultName: string;
  defaultDesc: string;
  color: string;
}

const ECLIPSE_TYPE_DEFINITIONS: Record<EclipseType, EclipseTypeDefinition> = {
  total: {
    nameKey:     'solarEclipses.modal.totalName',
    descKey:     'solarEclipses.modal.totalDesc',
    defaultName: 'Total Solar Eclipse',
    defaultDesc: 'The Moon completely covers the Sun. Observers within the narrow path of totality experience complete darkness for up to a few minutes.',
    color:       '#ef4444',
  },
  annular: {
    nameKey:     'solarEclipses.modal.annularName',
    descKey:     'solarEclipses.modal.annularDesc',
    defaultName: 'Annular Solar Eclipse',
    defaultDesc: "The Moon is too far from Earth to cover the Sun completely, leaving a bright ring of sunlight — the 'ring of fire' — visible around the Moon.",
    color:       '#f59e0b',
  },
  partial: {
    nameKey:     'solarEclipses.modal.partialName',
    descKey:     'solarEclipses.modal.partialDesc',
    defaultName: 'Partial Solar Eclipse',
    defaultDesc: "Only part of the Sun is covered by the Moon. The Sun appears as a crescent. Observers outside the path of totality or annularity see a partial eclipse.",
    color:       '#94a3b8',
  },
};

// ---------------------------------------------------------------------------
// Helper — format a UTC ISO date string to a local date label and day-of-week
// ---------------------------------------------------------------------------

function formatEclipseDate(
  utcDate: string,
  tz: string,
  locale: string,
): { dateLabel: string; dayOfWeek: string } {
  try {
    const d = new Date(utcDate);
    const dateLabel = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: tz,
    }).format(d);
    const dayOfWeek = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      timeZone: tz,
    }).format(d);
    return { dateLabel, dayOfWeek };
  } catch {
    return { dateLabel: utcDate, dayOfWeek: '' };
  }
}

// ---------------------------------------------------------------------------
// Helper — resolve visibility color (falls back to muted if unknown value)
// ---------------------------------------------------------------------------

function visibilityClass(visibility: string | null | undefined): string {
  if (!visibility) return 'text-muted-foreground';
  return VISIBILITY_CLASSES[visibility] ?? 'text-muted-foreground';
}

// ---------------------------------------------------------------------------
// Helper — determine if eclipse is "visible" (eye vs eye-slash)
// ---------------------------------------------------------------------------

function isVisible(visibility: string | null | undefined): boolean {
  return visibility !== 'Not Visible' && visibility != null;
}

// ---------------------------------------------------------------------------
// EclipseTypeBadge — clickable badge that opens the type definition modal
// ---------------------------------------------------------------------------

interface EclipseTypeBadgeProps {
  type: EclipseType;
  label: string;
  onOpen: (type: EclipseType) => void;
}

function EclipseTypeBadge({ type, label, onOpen }: EclipseTypeBadgeProps) {
  const style = TYPE_BADGE_STYLES[type];
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => onOpen(type)}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.75rem] font-semibold cursor-pointer flex-shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: style.bg,
        color: style.fg,
        // Focus ring uses the badge's own color so it is visible against both
        // glass-bg light and dark surfaces.
        outlineColor: style.fg,
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// EclipseTypeModal — dialog explaining an eclipse type
// ---------------------------------------------------------------------------

interface EclipseTypeModalProps {
  type: EclipseType | null;
  onClose: () => void;
}

function EclipseTypeModal({ type, onClose }: EclipseTypeModalProps) {
  const { t } = useTranslation('almanac');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Trap focus and handle Escape key when modal is open.
  useEffect(() => {
    if (!type) return;
    // Focus the close button when modal opens.
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [type, onClose]);

  if (!type) return null;

  const def = ECLIPSE_TYPE_DEFINITIONS[type];

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    // Portal-in-place: fixed overlay covers the viewport.
    // role="dialog" + aria-modal so screen readers treat it as a modal.
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={t(def.nameKey, def.defaultName)}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
      onClick={handleOverlayClick}
    >
      <div
        className="relative card-glass rounded-xl p-6 max-w-sm w-[90%] text-center ring-1 ring-foreground/10"
        style={{ backdropFilter: 'blur(16px)' }}
      >
        {/* Close button — positioned top-right */}
        <button
          ref={closeButtonRef}
          type="button"
          aria-label={t('solarEclipses.modal.close', 'Close')}
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current rounded p-1"
        >
          <X size={18} aria-hidden="true" />
        </button>

        {/* Eclipse type name */}
        <h3
          className="text-[0.95rem] font-bold mb-2"
          style={{ color: def.color }}
        >
          {t(def.nameKey, def.defaultName)}
        </h3>

        {/* Eclipse type description */}
        <p className="text-[0.9rem] text-muted-foreground leading-relaxed">
          {t(def.descKey, def.defaultDesc)}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContactTimesBlock — the three sun-icon + label + time blocks
// ---------------------------------------------------------------------------

interface ContactTimesBlockProps {
  entry: SolarEclipseEntry;
  stationTz: string;
  locale: string;
}

function ContactTimesBlock({ entry, stationTz, locale }: ContactTimesBlockProps) {
  const { t } = useTranslation('almanac');

  if (!entry.contactTimes) return null;

  const { partialStart, totalStart, peak, totalEnd, partialEnd } = entry.contactTimes;

  // Middle block: "Totality" for total eclipse (use totalStart), "Maximum" otherwise (use peak).
  const middleLabel =
    entry.type === 'total'
      ? t('solarEclipses.totality', 'Totality')
      : t('solarEclipses.maximum', 'Maximum');
  const middleTime =
    entry.type === 'total' ? totalStart?.date : peak?.date;

  const blocks: Array<{ label: string; iso: string | null | undefined }> = [
    { label: t('solarEclipses.begins', 'Begins'),   iso: partialStart?.date },
    { label: middleLabel,                             iso: middleTime },
    { label: t('solarEclipses.ends', 'Ends'),       iso: partialEnd?.date ?? totalEnd?.date },
  ];

  // Suppress the middle block if the time is null (e.g. partial eclipse has no totalStart).
  const visibleBlocks = blocks.filter(b => b.iso != null || b.label === middleLabel);

  return (
    <div
      className="flex gap-6 justify-center w-full"
      aria-label={t('solarEclipses.contactTimes', 'Contact times')}
    >
      {visibleBlocks.map((block) => (
        <div
          key={block.label}
          className="flex items-center gap-1.5"
        >
          {/* Sun icon — decorative, aria-hidden */}
          <Sun
            size={14}
            color="#f59e0b"
            weight="regular"
            aria-hidden="true"
            className="flex-shrink-0"
          />
          <div className="flex flex-col">
            <span className="text-[0.75rem] text-muted-foreground font-semibold leading-tight">
              {block.label}
            </span>
            <span
              className="text-[0.85rem] font-semibold leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {block.iso ? formatLocalTime(block.iso, stationTz, locale) : '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EclipseColumn — one eclipse's column
// ---------------------------------------------------------------------------

interface EclipseColumnProps {
  entry: SolarEclipseEntry;
  stationTz: string;
  locale: string;
  onBadgeClick: (type: EclipseType) => void;
}

function EclipseColumn({ entry, stationTz, locale, onBadgeClick }: EclipseColumnProps) {
  const { t } = useTranslation('almanac');

  const { dateLabel, dayOfWeek } = formatEclipseDate(entry.date, stationTz, locale);
  const hasContactTimes = entry.contactTimes != null;
  const hasVisibility = entry.visibility != null && hasContactTimes;

  const visClass = visibilityClass(entry.visibility);
  const visible = isVisible(entry.visibility);

  // Eclipse type label (capitalized)
  const typeLabel =
    entry.type === 'total'
      ? t('solarEclipses.typeTotal', 'Total')
      : entry.type === 'annular'
        ? t('solarEclipses.typeAnnular', 'Annular')
        : t('solarEclipses.typePartial', 'Partial');

  // Image alt text
  const imgAlt = t(
    'solarEclipses.imageAlt',
    '{{type}} solar eclipse',
    { type: typeLabel },
  );

  // Description: derived from type
  const description =
    entry.type === 'total'
      ? t('solarEclipses.descTotal', 'Total solar eclipse. The Sun will be completely covered by the Moon.')
      : entry.type === 'annular'
        ? t('solarEclipses.descAnnular', 'The Moon will pass in front of the Sun, leaving a brilliant ring of sunlight visible.')
        : t('solarEclipses.descPartial', 'The Moon will pass in front of the Sun, covering a portion of its disk.');

  return (
    <div className="flex flex-col gap-1.5 items-center flex-1 min-w-[200px]">
      {/* Date row: date+day on left, type badge on right */}
      <div className="flex items-start justify-between w-full gap-2">
        <div className="flex flex-col">
          <span className="text-[0.9rem] font-bold leading-snug">
            {dateLabel}
          </span>
          <span className="text-[0.75rem] text-muted-foreground leading-snug">
            {dayOfWeek}
          </span>
        </div>
        <EclipseTypeBadge
          type={entry.type}
          label={typeLabel}
          onOpen={onBadgeClick}
        />
      </div>

      {/* Eclipse image — zoomed within overflow-hidden to crop dark sky border */}
      <div className="w-full rounded overflow-hidden" style={{ aspectRatio: '3/2' }}>
        <img
          src={`/images/eclipses/solar-${entry.type}.webp`}
          alt={imgAlt}
          className="w-full h-full object-cover"
          style={{ transform: 'scale(1.5)' }}
          loading="lazy"
        />
      </div>

      {/* Visibility row — only if enriched data is present */}
      {hasVisibility && (
        <>
          <div
            className={`flex items-center justify-center gap-1.5 text-[0.85rem] font-semibold w-full ${visClass}`}
            aria-label={`${t('solarEclipses.visibility', 'Visibility')}: ${entry.visibility}`}
          >
            {visible ? (
              <Eye size={16} weight="regular" aria-hidden="true" />
            ) : (
              <EyeSlash size={16} weight="regular" aria-hidden="true" />
            )}
            <span>{entry.visibility}</span>
          </div>

          {/* Visibility sub-text */}
          {entry.visibility && (
            <div
              className={`text-[0.75rem] text-center leading-tight -mt-1 ${visClass}`}
              aria-hidden="true"
            >
              {visibilitySubText(entry.visibility, t)}
            </div>
          )}
        </>
      )}

      {/* Contact times — only if enriched data is present */}
      {hasContactTimes && (
        <ContactTimesBlock
          entry={entry}
          stationTz={stationTz}
          locale={locale}
        />
      )}

      {/* Description */}
      <p className="text-[0.85rem] text-muted-foreground text-center leading-snug">
        {description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper — visibility sub-text (non-i18n-critical; describes the tier)
// ---------------------------------------------------------------------------

function visibilitySubText(
  visibility: string,
  t: (key: string, fallback: string, opts?: Record<string, string>) => string,
): string {
  switch (visibility) {
    case 'Fully Visible':
      return t('solarEclipses.visSubFully', 'Within the path of totality');
    case 'Mostly Visible':
      return t('solarEclipses.visSubMostly', 'Well placed from your location');
    case 'Partially Visible':
      return t('solarEclipses.visSubPartially', 'Partially visible from your location');
    case 'Barely Visible':
      return t('solarEclipses.visSubBarely', 'Low on the horizon');
    case 'Not Visible':
      return t('solarEclipses.visSubNot', 'Below the horizon from your location');
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// SolarEclipseCard — main exported component
// ---------------------------------------------------------------------------

export function SolarEclipseCard({
  eclipses,
  stationTz,
  loading,
  error,
}: SolarEclipseCardProps) {
  const { t, i18n } = useTranslation('almanac');
  const locale = i18n.language ?? 'en';

  // Modal state: which eclipse type definition is open (null = closed)
  const [modalType, setModalType] = useState<EclipseType | null>(null);
  const openModal = useCallback((type: EclipseType) => setModalType(type), []);
  const closeModal = useCallback(() => setModalType(null), []);

  // Ref for restoring focus after modal closes
  const lastBadgeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (modalType === null && lastBadgeRef.current) {
      lastBadgeRef.current.focus();
      lastBadgeRef.current = null;
    }
  }, [modalType]);

  const handleBadgeClick = useCallback(
    (type: EclipseType) => {
      openModal(type);
    },
    [openModal],
  );

  return (
    <>
      <Card footprint="full" aria-busy={loading}>
        {/* Header */}
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle as="h2">{t('solarEclipses.title', 'Solar Eclipses')}</CardTitle>
            <span
              className="text-[0.75rem] text-muted-foreground flex items-center gap-1"
            >
              {t('solarEclipses.allTimesLocal', 'All times local')}
            </span>
          </div>
        </CardHeader>

        <CardContent>
          {/* Loading state */}
          {loading && (
            <div role="status" className="text-[0.85rem] text-muted-foreground py-4 text-center">
              {t('solarEclipses.loading', 'Loading solar eclipse data...')}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div role="alert" className="text-[0.85rem] text-muted-foreground py-4 text-center">
              {error}
            </div>
          )}

          {/* Data state */}
          {!loading && !error && (
            <>
              {/* Subtitle */}
              <p className="text-[0.75rem] text-muted-foreground mb-4">
                {t(
                  'solarEclipses.subtitle',
                  'The next solar eclipses visible from your location.',
                )}
              </p>

              {/* Empty state */}
              {(!eclipses || eclipses.eclipses.length === 0) && (
                <div className="text-[0.85rem] text-muted-foreground text-center py-6">
                  {t('solarEclipses.noEclipses', 'No solar eclipses visible from your location in the next several years.')}
                </div>
              )}

              {/* Eclipse columns — progressive fill: 2yr first, backfill to 4 max */}
              {eclipses && eclipses.eclipses.length > 0 && (() => {
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
                  aria-label={t('solarEclipses.listLabel', 'Upcoming solar eclipses')}
                >
                  {display.map((entry) => (
                    <div key={entry.date} role="listitem" className="flex-1 min-w-0">
                      <EclipseColumn
                        entry={entry}
                        stationTz={stationTz}
                        locale={locale}
                        onBadgeClick={handleBadgeClick}
                      />
                    </div>
                  ))}
                </div>
                );
              })()}
            </>
          )}
          {/* Footer note */}
          <p
            className="text-muted-foreground mt-4 flex items-center gap-1"
            style={{ fontSize: 'var(--text-micro, 0.7rem)' }}
          >
            <Info
              size={14}
              className="flex-shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            {t(
              'solarEclipses.footerNote',
              'Visibility can vary based on cloud cover and your exact location.',
            )}
          </p>
        </CardContent>
      </Card>

      {/* Modal — rendered outside the Card so it overlays the full viewport */}
      <EclipseTypeModal type={modalType} onClose={closeModal} />
    </>
  );
}

export default SolarEclipseCard;
