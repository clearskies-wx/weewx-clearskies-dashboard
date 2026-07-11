// SafetyIndicator.tsx — Large overall safety badge for the Beach Safety tab
// (Phase 7 T7.5, DASHBOARD-MANUAL §12). Safe/caution/dangerous, color-coded
// but never color-only: an icon + the translated label always accompany the
// color (rules/coding.md §5.1).

import { CheckCircle, Warning, XCircle } from '@phosphor-icons/react';
import type { TFunction } from 'i18next';

export type SafetyLevel = 'safe' | 'caution' | 'dangerous';

interface SafetyIndicatorProps {
  /** Raw safetyLevel string from the API. Falls back to a neutral style + the
   *  raw value when it doesn't match a known tier — defensive, since the
   *  exact enum isn't locked in the API contract (mirrors marine.tsx's
   *  beachSafetyLabel helper). */
  level: string;
  t: TFunction;
}

const CONFIG: Record<SafetyLevel, { bg: string; text: string; icon: typeof CheckCircle }> = {
  safe: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-200',
    icon: CheckCircle,
  },
  caution: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-800 dark:text-yellow-200',
    icon: Warning,
  },
  dangerous: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-800 dark:text-red-200',
    icon: XCircle,
  },
};

const NEUTRAL = {
  bg: 'bg-muted',
  text: 'text-foreground',
  icon: Warning,
};

function isSafetyLevel(value: string): value is SafetyLevel {
  return value === 'safe' || value === 'caution' || value === 'dangerous';
}

export function SafetyIndicator({ level, t }: SafetyIndicatorProps) {
  const key = level.toLowerCase();
  const known = isSafetyLevel(key);
  const config = known ? CONFIG[key] : NEUTRAL;
  const Icon = config.icon;
  const label = known ? t(`beachSafety.${key}`) : level;

  return (
    <div
      className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 font-semibold ${config.bg} ${config.text}`}
      style={{ fontSize: 'var(--text-stat-tile)' }}
    >
      <Icon aria-hidden="true" focusable="false" className="size-6 shrink-0" />
      <span>{label}</span>
    </div>
  );
}
