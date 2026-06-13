/**
 * alert-banner.tsx — Alert banner component (ADR-052), redesigned.
 *
 * Features:
 *   - Severity-colored left icon panel (per-system national colors via getAlertColors)
 *   - Card-glass neutral body for readable text
 *   - Multi-alert flip-through: prev/next buttons + severity-colored pips
 *   - Expandable detail section: full description + metadata grid
 *   - ARIA roles keyed on severity level (assertive for level ≥ 4)
 *
 * Rendering modes (ADR-052):
 *   Rich mode       — Aeris / NWS: severityLevel 1–4, severityLabel set.
 *   Passthrough     — OWM: severityLevel null, severityLabel null.
 *
 * A11y (rules/coding.md §5.4):
 *   severityLevel >= 4  → role="alert"  (assertive; interrupts screen reader)
 *   severityLevel < 4   → role="status" (polite; waits for current speech)
 *   severityLevel null  → role="status" (passthrough)
 *
 * Color is NOT the only signal (rules/coding.md §5.1): icon + event text
 * always accompany color treatment; no color-only state.
 *
 * Flip buttons and expand button are <button> elements (not <div onClick>).
 * Focus indicators preserved via Tailwind focus-visible utilities.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDown, CaretLeft, CaretRight } from '@phosphor-icons/react';
import type { AlertRecord } from '../../api/types';
import { AlertIcon } from '../icons/alert-icon-map';
import { getAlertCategory } from '../icons/alert-category';
import { getAlertColors } from '../../utils/alert-colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertBannerProps {
  alerts: AlertRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * sortAlerts — sorts by severityLevel descending; nulls last.
 * Returns a new array; does not mutate the input.
 */
function sortAlerts(alerts: AlertRecord[]): AlertRecord[] {
  return [...alerts].sort((a, b) => {
    if (a.severityLevel === null && b.severityLevel === null) return 0;
    if (a.severityLevel === null) return 1;
    if (b.severityLevel === null) return -1;
    return b.severityLevel - a.severityLevel;
  });
}

/** ariaRole — assertive for severe (≥4), polite otherwise. */
function ariaRole(severityLevel: number | null): 'alert' | 'status' {
  return severityLevel !== null && severityLevel >= 4 ? 'alert' : 'status';
}

/**
 * ariaLive — explicit live-region politeness to match the role.
 * 'alert'  implies 'assertive'; 'status' implies 'polite'.
 * Stated explicitly for reliable cross-screen-reader behavior.
 */
function ariaLive(role: 'alert' | 'status'): 'assertive' | 'polite' {
  return role === 'alert' ? 'assertive' : 'polite';
}

/**
 * formatExpiry — produces a human-readable "until X" string from an ISO
 * expires timestamp. Falls back to "ongoing" when expires is null or invalid.
 */
function formatExpiry(
  expires: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!expires) return t('alertBanner.ongoing');

  const expiresDate = new Date(expires);
  if (isNaN(expiresDate.getTime())) return t('alertBanner.ongoing');

  const now    = new Date();
  const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expDay = new Date(
    expiresDate.getFullYear(),
    expiresDate.getMonth(),
    expiresDate.getDate(),
  );

  const diffDays = Math.round((expDay.getTime() - today.getTime()) / 86_400_000);

  const timeStr = expiresDate.toLocaleTimeString(undefined, {
    hour:   'numeric',
    minute: '2-digit',
  });

  let dateLabel: string;
  if (diffDays === 0) {
    dateLabel = timeStr;
  } else if (diffDays === 1) {
    dateLabel = `tomorrow ${timeStr}`;
  } else if (diffDays > 1 && diffDays < 7) {
    const dayName = expiresDate.toLocaleDateString(undefined, { weekday: 'long' });
    dateLabel = `${dayName} ${timeStr}`;
  } else {
    dateLabel = expiresDate.toLocaleDateString(undefined, {
      month:  'short',
      day:    'numeric',
      hour:   'numeric',
      minute: '2-digit',
    });
  }

  return t('alertBanner.until', { time: dateLabel });
}

/**
 * reflowDescription — collapses hard line wraps within paragraphs while
 * preserving paragraph breaks (blank lines). NWS descriptions hard-wrap
 * at ~65 chars for legacy terminals; this lets the text flow to fill
 * the available width.
 */
function reflowDescription(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((para) => para.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
}

/** formatDateTime — formats a full ISO datetime for the metadata grid. */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month:  'short',
    day:    'numeric',
    year:   'numeric',
    hour:   'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Pip — a small colored dot representing one alert's severity level. */
function Pip({ color, active }: { color: string; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={`inline-block rounded-full transition-all ${
        active ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5 opacity-60'
      }`}
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertBanner({ alerts }: AlertBannerProps) {
  const { t } = useTranslation('now');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Guard: empty or undefined — render nothing.
  if (!alerts || alerts.length === 0) return null;

  const sorted = sortAlerts(alerts);

  // Clamp index in case alerts array shrinks between renders.
  const safeIndex = Math.min(currentIndex, sorted.length - 1);
  const alert     = sorted[safeIndex];

  const colors = getAlertColors(
    alert.alertSystem,
    alert.severityLevel,
    alert.color,
  );

  const iconCategory = getAlertCategory({
    event:      alert.event,
    hazardType: alert.hazardType,
  });

  const role       = ariaRole(alert.severityLevel);
  const multiAlert = sorted.length > 1;

  const expiryText = formatExpiry(alert.expires, t);

  // Detail line: "Area · until X"
  const detailParts: string[] = [];
  if (alert.areaDesc) detailParts.push(alert.areaDesc);
  detailParts.push(expiryText);
  const detailLine = detailParts.join(' · ');

  // Summary: first non-empty line of description (collapsed view only).
  const summaryText =
    alert.description?.split('\n').find((l) => l.trim()) ?? null;

  // Metadata grid items for expanded state.
  const metadata: Array<{ label: string; value: string }> = [
    { label: t('alertBanner.effective'),    value: formatDateTime(alert.effective) },
    { label: t('alertBanner.expires'),      value: formatDateTime(alert.expires) },
    ...(alert.urgency
      ? [{ label: t('alertBanner.urgency'),   value: alert.urgency }]
      : []),
    ...(alert.certainty
      ? [{ label: t('alertBanner.certainty'), value: alert.certainty }]
      : []),
    ...(alert.senderName
      ? [{ label: t('alertBanner.issuedBy'),  value: alert.senderName }]
      : []),
    ...(alert.alertSystem
      ? [{ label: t('alertBanner.alertSystem'), value: alert.alertSystem }]
      : []),
  ];

  function goPrev() {
    setCurrentIndex((i) => (i - 1 + sorted.length) % sorted.length);
    setExpanded(false);
  }

  function goNext() {
    setCurrentIndex((i) => (i + 1) % sorted.length);
    setExpanded(false);
  }

  return (
    /*
     * Outer wrapper carries the ARIA live-region role.
     * The severity-colored left + bottom border is applied via inline style
     * because the hex values are dynamic runtime strings that Tailwind cannot
     * pre-generate arbitrary-value classes for.
     *
     * footprint="full" equivalent: col-span-1 md:col-span-2 lg:col-span-4
     * — applied directly here since we're not using the Card primitive in
     * the redesign (the icon panel requires non-Card layout).
     */
    <div
      role={role}
      aria-live={ariaLive(role)}
      aria-label={
        multiAlert
          ? t('alertBanner.alertN', { n: safeIndex + 1, total: sorted.length })
          : undefined
      }
      className="mx-auto w-full max-w-[var(--container-max)] overflow-hidden rounded-xl ring-1 ring-foreground/10 min-h-[var(--card-half-row)] mb-[var(--gap-grid)] flex flex-col"
    >

      {/* ── Collapsed header row ─────────────────────────────────────────── */}
      <div className="flex flex-row items-stretch flex-1">

        {/* Left icon panel — severity-colored background, fixed 64px wide */}
        {/*
          aria-hidden on the wrapper: icon is purely decorative here;
          accessible name comes from the event text and the ARIA live region.
          The <span> carries the icon foreground color so AlertIcon (which only
          accepts className) inherits it via currentColor on the SVG fill/stroke.
        */}
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center"
          style={{
            width:           '64px',
            backgroundColor: colors.iconBg,
            color:           colors.iconFgColor,
          }}
        >
          <AlertIcon
            category={iconCategory}
            className="h-8 w-8 text-current"
          />
        </div>

        {/* Text body — card-glass neutral surface, grows to fill */}
        <div className="card-glass min-w-0 flex-1 px-3 py-2.5">

          {/* Title row: event name + optional severity badge */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="truncate font-heading text-[length:var(--text-card-title)] font-semibold leading-snug text-card-foreground">
              {alert.event}
            </p>
            {alert.severityLabel && (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[length:var(--text-micro)] font-medium uppercase tracking-wide"
                style={{
                  backgroundColor: `${colors.iconBg}22`,
                  color:           colors.border,
                  border:          `1px solid ${colors.border}44`,
                }}
              >
                {alert.severityLabel}
              </span>
            )}
          </div>

          {/* Detail line: area + expiry */}
          <p className="mt-0.5 truncate font-heading text-[length:var(--text-label)] leading-snug text-muted-foreground">
            {detailLine}
          </p>

          {/* Summary: first line of description (collapsed only) */}
          {summaryText && !expanded && (
            <p className="mt-1 line-clamp-1 font-heading text-[length:var(--text-label)] leading-snug text-card-foreground/75">
              {summaryText}
            </p>
          )}

        </div>

        {/* Right panel: expand chevron + optional flip navigator */}
        <div
          className="card-glass flex shrink-0 flex-col items-center justify-between border-l border-foreground/10 px-2 py-2"
          style={{ minWidth: '56px' }}
        >

          {/* Expand / collapse chevron — always present */}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? t('alertBanner.collapse') : t('alertBanner.expand')}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <CaretDown
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {/* Multi-alert flip controls — only when > 1 alert */}
          {multiAlert && (
            <div className="flex flex-col items-center gap-1">

              {/* Position label: "1 of 3" */}
              <span className="text-center font-heading text-[length:var(--text-micro)] leading-none text-muted-foreground">
                {safeIndex + 1}&thinsp;{t('alertBanner.of')}&thinsp;{sorted.length}
              </span>

              {/* Severity-colored pips */}
              <div className="flex items-center gap-0.5">
                {sorted.map((a, i) => {
                  const c = getAlertColors(a.alertSystem, a.severityLevel, a.color);
                  return (
                    <Pip
                      key={a.id}
                      color={c.iconBg}
                      active={i === safeIndex}
                    />
                  );
                })}
              </div>

              {/* Prev / next buttons */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label={t('alertBanner.previousAlert')}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <CaretLeft aria-hidden="true" className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label={t('alertBanner.nextAlert')}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <CaretRight aria-hidden="true" className="h-3 w-3" />
                </button>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* ── Expanded detail section ───────────────────────────────────────── */}
      {/*
        Uses CSS grid-template-rows: 0fr → 1fr for a smooth expand/collapse
        transition without knowing content height up-front.
        The inner div needs min-height: 0 for the 0fr collapse to clip correctly.
        aria-hidden hides the content from screen readers when collapsed.
      */}
      <div
        aria-hidden={!expanded}
        style={{
          display:          'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition:       'grid-template-rows 250ms ease',
        }}
      >
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <div className="card-glass border-t border-foreground/10 px-4 py-3">

            {/* Full description — collapse hard line wraps, keep paragraph breaks */}
            {alert.description && (
              <div className="mb-3 space-y-3">
                {reflowDescription(alert.description).map((para, i) => (
                  <p key={i} className="font-heading text-[length:var(--text-body)] leading-relaxed text-card-foreground/90">
                    {para}
                  </p>
                ))}
              </div>
            )}

            {/* Metadata grid */}
            {metadata.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {metadata.map(({ label, value }) => (
                  <div key={label} className="flex flex-col">
                    <dt className="font-heading text-[length:var(--text-micro)] font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="font-heading text-[length:var(--text-label)] text-card-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

          </div>
        </div>
      </div>

      {/* Bottom severity accent line — a simple div, not a CSS border (avoids miter join artifacts) */}
      <div aria-hidden="true" style={{ height: 4, flexShrink: 0, backgroundColor: colors.border }} />

    </div>
  );
}
