import { useTranslation } from 'react-i18next';
import type { MarineAlertSummary } from '@/api/types';
import { AlertIcon } from '@/components/icons/alert-icon-map';

export interface AlertsPanelProps {
  alerts: MarineAlertSummary[];
  /** When set, only show alerts whose alertType is in this set. */
  filterTypes?: Set<string>;
}

/**
 * AlertsPanel — thin, color-coded strip of active marine/coastal alerts
 * (T4.5, FIX-19; DESIGN-MANUAL §20 "Marine alert strip"). Replaces the
 * prior spacious rounded box + bullet list with a compact strip: each
 * alert is a single row with a 4px severity-colored left border, an
 * alert-type icon (reuses the same `AlertIcon` category resolver as the
 * main dashboard `AlertBanner`, `src/components/icons/alert-icon-map.tsx`
 * — no second icon-mapping table), and the headline text. Headline text is
 * never truncated/ellipsized — marine alerts are safety-critical
 * (rules/coding.md §1) and clipping a headline could hide the hazard.
 *
 * Severity color coding (yellow=advisory / orange=watch / red=warning per
 * DESIGN-MANUAL §20) requires a `severity` field on `MarineAlertSummary`
 * that does not exist yet — the type has only `headline` and `alertType`,
 * and isn't even present in docs/contracts/openapi-v1.yaml (dashboard-
 * local shape). Confirmed with the lead (2026-07-15): every alert renders
 * with the single amber "advisory" tier below until the API adds real
 * severity data. This is a documented fallback, not a fabricated
 * classification derived from alertType/headline keyword-matching — see
 * rules/coding.md open-questions guidance against inventing data the API
 * doesn't provide. Once `MarineAlertSummary.severity` exists, branch the
 * border/icon/text color classes below by severity instead of the flat
 * amber-* classes.
 */
export function AlertsPanel({ alerts, filterTypes }: AlertsPanelProps) {
  const { t } = useTranslation('marine');

  const visible = filterTypes
    ? alerts.filter((a) => filterTypes.has(a.alertType))
    : alerts;

  if (visible.length === 0) return null;

  return (
    <section
      aria-live="polite"
      aria-label={t('activeAdvisories')}
      className="flex flex-col gap-px overflow-hidden rounded-lg border border-amber-300 bg-amber-50 py-2 dark:border-amber-700 dark:bg-amber-950"
    >
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {visible.map((alert, i) => (
          <li
            key={`${alert.headline}-${i}`}
            className="flex items-center gap-2 border-l-4 border-amber-500 px-3 py-0.5 dark:border-amber-400"
          >
            <AlertIcon
              event={alert.headline}
              className="size-4 shrink-0 text-amber-700 dark:text-amber-300"
            />
            <span
              className="font-semibold text-amber-900 dark:text-amber-200"
              style={{ fontSize: 'var(--text-body)' }}
            >
              {alert.headline}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AlertsPanel;
