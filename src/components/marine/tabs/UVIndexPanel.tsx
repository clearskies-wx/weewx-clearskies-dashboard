// UVIndexPanel.tsx — UV Index panel for the Beach Safety tab (Phase 7 T7.5,
// DASHBOARD-MANUAL §12). EPA-standard UV Index color scale + guidance text —
// never color-only (rules/coding.md §5.1). Renders "not available" gracefully
// when uvIndex is null (NWS SRF doesn't always supply it).

import type { TFunction } from 'i18next';
import { formatValue } from '../../../utils/format';

interface UVIndexPanelProps {
  uvIndex: number | null;
  locale: string;
  t: TFunction;
}

interface UvTier {
  text: string;
  labelKey: string;
}

/** EPA UV Index scale: 1-2 low, 3-5 moderate, 6-7 high, 8-10 very high, 11+ extreme. */
function tierFor(uvIndex: number): UvTier {
  if (uvIndex <= 2) return { text: 'text-green-700 dark:text-green-300', labelKey: 'beachSafety.uvLow' };
  if (uvIndex <= 5) return { text: 'text-yellow-700 dark:text-yellow-300', labelKey: 'beachSafety.uvModerate' };
  if (uvIndex <= 7) return { text: 'text-orange-700 dark:text-orange-300', labelKey: 'beachSafety.uvHigh' };
  if (uvIndex <= 10) return { text: 'text-red-700 dark:text-red-300', labelKey: 'beachSafety.uvVeryHigh' };
  return { text: 'text-purple-700 dark:text-purple-300', labelKey: 'beachSafety.uvExtreme' };
}

export function UVIndexPanel({ uvIndex, locale, t }: UVIndexPanelProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {uvIndex !== null ? (
        <>
          <span
            className="font-semibold text-foreground"
            style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
          >
            {formatValue(uvIndex, 'uv', locale)}
          </span>
          <p className={`font-semibold ${tierFor(uvIndex).text}`} style={{ fontSize: 'var(--text-body)' }}>
            {t(tierFor(uvIndex).labelKey)}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
          {t('beachSafety.notAvailable')}
        </p>
      )}
    </div>
  );
}
