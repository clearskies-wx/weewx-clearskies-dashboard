// WaterTempPanel.tsx — Water temperature + comfort level panel for the Beach
// Safety tab (Phase 7 T7.5, DASHBOARD-MANUAL §12). Color and text both convey
// the comfort tier — never color-only (rules/coding.md §5.1).

import type { TFunction } from 'i18next';
import { formatValue } from '../../../utils/format';

interface WaterTempPanelProps {
  waterTemp: number | null;
  comfortLevel: string | null;
  locale: string;
  t: TFunction;
}

const COMFORT_CONFIG: Record<string, { text: string; labelKey: string }> = {
  comfortable: { text: 'text-green-700 dark:text-green-300', labelKey: 'beachSafety.comfortable' },
  cool: { text: 'text-blue-600 dark:text-blue-300', labelKey: 'beachSafety.cool' },
  cold: { text: 'text-blue-900 dark:text-blue-200', labelKey: 'beachSafety.cold' },
  dangerous: { text: 'text-red-700 dark:text-red-300', labelKey: 'beachSafety.hypothermia' },
};

export function WaterTempPanel({ waterTemp, comfortLevel, locale, t }: WaterTempPanelProps) {
  const key = comfortLevel?.toLowerCase() ?? null;
  const config = key !== null ? COMFORT_CONFIG[key] : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span
          className="font-semibold text-foreground"
          style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
        >
          {waterTemp !== null ? `${formatValue(waterTemp, 'temperature', locale)}°` : '—'}
        </span>
      </div>
      {config ? (
        <p className={`font-semibold ${config.text}`} style={{ fontSize: 'var(--text-body)' }}>
          {t(config.labelKey)}
        </p>
      ) : (
        comfortLevel && (
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
            {comfortLevel}
          </p>
        )
      )}
    </div>
  );
}
