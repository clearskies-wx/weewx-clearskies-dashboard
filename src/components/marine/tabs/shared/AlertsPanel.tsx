// AlertsPanel.tsx — shared marine alerts panel (T7.2 DASHBOARD-MANUAL §12).
// Renders active marine-zone alert headlines for a location, at the top of
// an activity tab. Shared across boating/surfing/fishing/beachSafety tabs.
//
// The API only exposes a flat headline list (MarineLocationSummary.activeAlerts:
// string[] | null) — no per-alert severity enum. LocationCard.tsx established
// the precedent for this: a single amber "advisory" tier rather than
// fabricating a red/yellow severity split the data doesn't support. Full
// severity-aware badges would require per-alert metadata this endpoint
// doesn't return.
//
// A11y (rules/coding.md §5):
//   - aria-live="polite" so the panel is announced when alerts change.
//   - Color is not the only signal: amber background is paired with a
//     Warning icon and the word "Active Advisories" in the heading, plus
//     the alert headline text itself.
//   - Heading is a real <h3> so screen reader users can navigate to it.
//   - Contrast (computed via WCAG relative-luminance formula, both audited
//     independently per rules/coding.md §5.1):
//       light: bg-amber-50 (#fffbeb) / text-amber-900 (#78350f)  -> 8.76:1
//       dark:  bg-amber-950 (#451a03, solid — no opacity blending
//              uncertainty) / text-amber-200 (#fde68a)           -> 12.0:1
//     Both exceed the 4.5:1 AA floor for normal text with margin to spare.

import { Warning } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

export interface AlertsPanelProps {
  /** Active marine-zone alert headlines for this location. */
  alerts: string[];
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const { t } = useTranslation('marine');

  if (alerts.length === 0) return null;

  return (
    <section
      aria-live="polite"
      className={[
        'rounded-xl border-2 border-amber-300 dark:border-amber-700',
        'bg-amber-50 dark:bg-amber-950',
        'p-[var(--card-pad)] flex flex-col gap-2',
      ].join(' ')}
    >
      <h3
        className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200"
        style={{ fontSize: 'var(--text-card-title)' }}
      >
        <Warning aria-hidden="true" focusable="false" className="size-5 shrink-0" />
        {t('activeAdvisories')}
      </h3>
      <ul className="flex flex-col gap-1.5 list-none m-0 p-0">
        {alerts.map((headline, i) => (
          <li
            key={`${headline}-${i}`}
            className="text-amber-900 dark:text-amber-200 font-medium"
            style={{ fontSize: 'var(--text-body)' }}
          >
            {headline}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AlertsPanel;
