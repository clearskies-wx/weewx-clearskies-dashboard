// todays-highlights-card.tsx — Today's Highlights strip card.
//
// Extracted from now.tsx (T5.3). Renders 6 stat items in a horizontal strip:
//   1. Today's High (outTemp unit)
//   2. Today's Low  (outTemp unit)
//   3. Peak Gust    (windGust unit)
//   4. Wind         (windSpeed — current, not avg; no avg field in TodayStats)
//   5. Rain Today   (rain unit)
//   6. Peak AQI     (conditional — only shown when peakAQI > 0)
//
// A11y (WCAG 2.1 AA — rules/coding.md §5):
//   - <dl>/<dt>/<dd> semantics for the stat list (§5.2).
//   - Icons are aria-hidden (decorative; text labels carry meaning).
//   - Loading state: sr-only role="status" text + skeleton.
//   - No color-only signals: each stat has a text label and value (§5.1).
//   - aria-busy on Card during loading.

import { useTranslation } from 'react-i18next';
import {
  ThermometerHot,
  ThermometerCold,
  Wind,
  Drop,
  Leaf,
} from '@phosphor-icons/react';
import type { TodayStats, Observation } from '../api/types';
import { asConverted } from '../api/types';
import { formatValue } from '../utils/format';
import { aqiCategoryLabel } from './aqi-card';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TodaysHighlightsCardProps {
  todayStats: TodayStats | null;
  observation: Observation | null;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function HighlightSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-16 w-full"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Single stat item (icon + value + micro-label)
// ---------------------------------------------------------------------------

interface StatItemProps {
  icon: React.ReactNode;
  value: string;
  microLabel: string;
}

function StatItem({ icon, value, microLabel }: StatItemProps) {
  // DOM order: dt (label) before dd (value) per dl semantics (WCAG 1.3.1).
  // Visual order: icon on top, value large, micro-label below — achieved with
  // flexbox `order`. Icon: order-1, dd (value): order-2, dt (label): order-3.
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[4rem]">
      {/* dt precedes dd in DOM for correct description-list semantics */}
      <dt
        className="text-[0.7rem] uppercase tracking-wide text-muted-foreground leading-tight order-3"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {microLabel}
      </dt>
      {/* Icon — decorative; aria-hidden since dt carries the label */}
      <span aria-hidden="true" className="text-muted-foreground order-1">
        {icon}
      </span>
      {/* Value — rendered below icon, above label via order */}
      <dd
        className="text-sm font-semibold text-foreground leading-tight order-2"
        style={{ fontFamily: 'var(--font-display)', fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TodaysHighlightsCard
// ---------------------------------------------------------------------------

export function TodaysHighlightsCard({
  todayStats,
  observation,
  loading = false,
}: TodaysHighlightsCardProps) {
  const { t } = useTranslation('now');

  // Unit labels come from the observation's ConvertedValue fields (ADR-042).
  const tempCV    = asConverted(observation?.outTemp ?? null);
  const windGustCV = asConverted(observation?.windGust ?? null);
  const windSpeedCV = asConverted(observation?.windSpeed ?? null);
  const rainCV    = asConverted(observation?.rain ?? null);

  // Helper: format a numeric value + ConvertedValue label, or fall back to
  // formatValue() when the CV is not available.
  function tempDisplay(raw: number | null): string {
    if (raw === null) return '—';
    return tempCV
      ? `${tempCV.formatted}${tempCV.label}`
      : formatValue(raw, 'temperature');
  }

  function windGustDisplay(): string {
    if (windGustCV) return `${windGustCV.formatted}${windGustCV.label}`;
    return formatValue(todayStats?.peakGust ?? 0, 'wind');
  }

  function windDisplay(): string {
    if (windSpeedCV) return `${windSpeedCV.formatted}${windSpeedCV.label}`;
    return '—';
  }

  function rainDisplay(): string {
    if (rainCV) return `${rainCV.formatted}${rainCV.label}`;
    return formatValue(todayStats?.rainSoFar ?? 0, 'rain');
  }

  return (
    <Card footprint="wide" aria-busy={loading}>
      <CardHeader>
        <h2 className="font-heading leading-snug font-semibold pb-1.5 border-b border-border" style={{ fontSize: 'var(--text-card-title, 0.82rem)' }}>
          {t('todaysHighlights')}
        </h2>
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">
              {t('loading.highlights')}
            </span>
            <HighlightSkeleton />
          </>
        ) : todayStats ? (
          <dl className="flex items-center justify-around gap-2 flex-wrap">

            {/* 1 — Today's High */}
            <StatItem
              icon={<ThermometerHot size={16} weight="regular" />}
              value={tempDisplay(todayStats.high)}
              microLabel={t('highlights.todaysHigh')}
            />

            {/* 2 — Today's Low */}
            <StatItem
              icon={<ThermometerCold size={16} weight="regular" />}
              value={tempDisplay(todayStats.low)}
              microLabel={t('highlights.todaysLow')}
            />

            {/* 3 — Peak Gust */}
            <StatItem
              icon={<Wind size={16} weight="regular" />}
              value={windGustDisplay()}
              microLabel={t('highlights.peakGust')}
            />

            {/* 4 — Current Wind (no avg wind field in TodayStats; uses observation.windSpeed) */}
            <StatItem
              icon={<Wind size={16} weight="regular" />}
              value={windDisplay()}
              microLabel={t('highlights.wind')}
            />

            {/* 5 — Rain Today */}
            <StatItem
              icon={<Drop size={16} weight="regular" />}
              value={rainDisplay()}
              microLabel={t('highlights.rainToday')}
            />

            {/* 6 — Peak AQI — conditional; only shown when peakAQI > 0 */}
            {todayStats.peakAQI > 0 && (
              <StatItem
                icon={<Leaf size={16} weight="regular" />}
                value={`${formatValue(todayStats.peakAQI, 'uv')} ${aqiCategoryLabel(todayStats.peakAQI)}`}
                microLabel={t('highlights.peakAqi')}
              />
            )}

          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">{t('noData.highlights')}</p>
        )}
      </CardContent>
    </Card>
  );
}
