/**
 * alert-banner.tsx — Alert banner component (ADR-052).
 *
 * Displays the highest-severity active alert as a full-width Card. When
 * multiple alerts are present, a "+N more" badge is shown on the right.
 *
 * Rendering modes (ADR-052 §Two rendering modes):
 *   Rich mode       — Aeris / NWS: severityLevel 1–4, severityLabel set.
 *                     Category-specific icon; ARIA role keyed on level.
 *   Passthrough mode — OWM: severityLevel null, severityLabel null.
 *                     Generic ph:warning icon; role="status" always.
 *
 * A11y (rules/coding.md §5.4):
 *   severityLevel >= 4  → role="alert"  (assertive; interrupts screen reader)
 *   severityLevel < 4   → role="status" (polite; waits for current speech)
 *   severityLevel null  → role="status" (passthrough — unknown severity)
 *
 * Color is NOT the only signal (rules/coding.md §5.1): icon + event text
 * always accompany any color treatment; no color-only state.
 *
 * Icon aria-hidden="true": accessible name comes from visible event text and
 * the ARIA live region on the wrapper, not from the icon glyph name.
 */

import { useTranslation } from 'react-i18next';
import type { AlertRecord } from '../../api/types';
import { Card, CardContent } from '../ui/card';
import { AlertIcon } from '../icons/alert-icon-map';
import { getAlertCategory } from '../icons/alert-category';

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
 * sortAlerts — sorts alerts by severityLevel descending, nulls last.
 * Returns a new array; does not mutate the input.
 */
function sortAlerts(alerts: AlertRecord[]): AlertRecord[] {
  return [...alerts].sort((a, b) => {
    if (a.severityLevel === null && b.severityLevel === null) return 0;
    if (a.severityLevel === null) return 1;  // nulls last
    if (b.severityLevel === null) return -1; // nulls last
    return b.severityLevel - a.severityLevel; // descending
  });
}

/**
 * ariaRole — returns the correct ARIA role for the banner container.
 *
 * ADR-052 / rules/coding.md §5.4:
 *   severityLevel >= 4 → "alert"  (assertive announcement)
 *   severityLevel < 4 or null → "status" (polite announcement)
 */
function ariaRole(severityLevel: number | null): 'alert' | 'status' {
  if (severityLevel !== null && severityLevel >= 4) return 'alert';
  return 'status';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertBanner({ alerts }: AlertBannerProps) {
  const { t } = useTranslation('now');

  // Guard: empty or undefined — render nothing.
  if (!alerts || alerts.length === 0) return null;

  const sorted = sortAlerts(alerts);
  const primary = sorted[0];
  const extraCount = sorted.length - 1;

  // Resolve icon category once — passed as pre-resolved prop to AlertIcon to
  // avoid calling getAlertCategory twice (once inside AlertIcon, once here).
  const iconCategory = getAlertCategory({
    event: primary.event,
    hazardType: primary.hazardType,
  });

  const role = ariaRole(primary.severityLevel);

  return (
    <Card
      role={role}
      footprint="full"
      className="alert-glass ring-[color:var(--alert-border)]"
    >
      <CardContent className="flex flex-row items-center gap-3 py-3">

        {/* ── Icon (left) ──────────────────────────────────────────────────── */}
        {/*
          aria-hidden on the icon SVG (set inside AlertIcon).
          Accessible name is carried by the visible event text and the
          ARIA live region role on the Card wrapper (rules/coding.md §5.5).
        */}
        <AlertIcon
          category={iconCategory}
          className="h-5 w-5 shrink-0 text-[var(--alert-fg)]"
        />

        {/* ── Text block (center, grows to fill) ───────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/*
            Event name: Manrope 600 at card-title size.
            Use severityLabel when available (rich mode); fall back to event
            string (passthrough mode / any provider without a native label).
          */}
          <p
            className="truncate font-heading text-[length:var(--text-card-title)] font-semibold leading-snug text-[var(--alert-fg)]"
          >
            {primary.event}
          </p>

          {/* Headline: Manrope 400, label size, single-line truncation. */}
          {primary.headline && (
            <p className="mt-0.5 line-clamp-1 font-heading text-xs font-normal leading-snug text-[var(--alert-fg)]/80">
              {primary.headline}
            </p>
          )}
        </div>

        {/* ── "+N more" badge (right, only when there are additional alerts) ── */}
        {/*
          T4.4 will add the `alertBanner.andMore` key to now.json.
          Until then, i18next returns the key string as the fallback display
          value — visually "alertBanner.andMore" in dev, correct label once
          T4.4 lands.
        */}
        {extraCount > 0 && (
          <span
            aria-label={t('alertBanner.andMore', { count: extraCount })}
            className="shrink-0 rounded-full bg-[var(--alert-fg)]/15 px-2 py-0.5 text-xs font-medium text-[var(--alert-fg)]"
          >
            {t('alertBanner.andMore', { count: extraCount })}
          </span>
        )}

      </CardContent>
    </Card>
  );
}
