// RipCurrentPanel.tsx — Rip current risk panel for the Beach Safety tab
// (Phase 7 T7.5, DASHBOARD-MANUAL §12). Color-coded badge (low/moderate/high)
// paired with guidance text and, when available, the NWPS v1.5 rip current
// probability as supplementary info — never color-only (rules/coding.md §5.1).

import type { TFunction } from 'i18next';
import { formatValue } from '../../../utils/format';

interface RipCurrentPanelProps {
  ripCurrentRisk: string | null;
  /** NWPS v1.5 rip current probability, 0-100. Supplementary — shown only
   *  when the provider supplies it (show-when-available per DASHBOARD-MANUAL §12). */
  ripCurrentProbability: number | null;
  t: TFunction;
  locale: string;
}

const BADGE_CONFIG: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-200' },
  moderate: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-200' },
  high: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-200' },
};

const NEUTRAL_BADGE = { bg: 'bg-muted', text: 'text-foreground' };

const GUIDANCE_KEYS: Record<string, string> = {
  low: 'beachSafety.ripLow',
  moderate: 'beachSafety.ripModerate',
  high: 'beachSafety.ripHigh',
};

export function RipCurrentPanel({ ripCurrentRisk, ripCurrentProbability, t, locale }: RipCurrentPanelProps) {
  const key = ripCurrentRisk?.toLowerCase() ?? null;
  const known = key !== null && key in BADGE_CONFIG;
  const badge = known ? BADGE_CONFIG[key as string] : NEUTRAL_BADGE;
  const label = known ? t(`qualitative.${key}`) : (ripCurrentRisk ?? t('beachSafety.notAvailable'));
  const guidance = known ? t(GUIDANCE_KEYS[key as string]) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={`inline-flex w-fit items-center rounded px-2.5 py-1 font-semibold ${badge.bg} ${badge.text}`}
        style={{ fontSize: 'var(--text-label)' }}
      >
        {label}
      </span>
      {guidance && (
        <p className="text-foreground" style={{ fontSize: 'var(--text-body)' }}>
          {guidance}
        </p>
      )}
      {ripCurrentProbability !== null && (
        <p className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
          {t('beachSafety.ripCurrentProbability', {
            value: formatValue(ripCurrentProbability, 'percent', locale),
          })}
        </p>
      )}
    </div>
  );
}
