import { Warning } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { MarineAlertSummary } from '@/api/types';

export interface AlertsPanelProps {
  alerts: MarineAlertSummary[];
  /** When set, only show alerts whose alertType is in this set. */
  filterTypes?: Set<string>;
}

export function AlertsPanel({ alerts, filterTypes }: AlertsPanelProps) {
  const { t } = useTranslation('marine');

  const visible = filterTypes
    ? alerts.filter((a) => filterTypes.has(a.alertType))
    : alerts;

  if (visible.length === 0) return null;

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
        {visible.map((alert, i) => (
          <li
            key={`${alert.headline}-${i}`}
            className="text-amber-900 dark:text-amber-200 font-medium"
            style={{ fontSize: 'var(--text-body)' }}
          >
            {alert.headline}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AlertsPanel;
