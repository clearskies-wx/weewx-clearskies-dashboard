// todays-highlights-card.tsx — Today's Highlights strip card.
//
// Extracted from now.tsx (T5.3). Renders 6 stat items in a horizontal strip:
//   1. Today's High (outTemp unit)
//   2. Today's Low  (outTemp unit)
//   3. Peak Gust    (windGust unit)
//   4. Wind         (windSpeed — daily average from archive records)
//   5. Rain Today   (rain unit — accumulated since midnight)
//   6. Peak AQI     (conditional — only shown when peakAQI > 0)
//
// A11y (WCAG 2.1 AA — rules/coding.md §5):
//   - <dl>/<dt>/<dd> semantics for the stat list (§5.2).
//   - Icons are aria-hidden (decorative; text labels carry meaning).
//   - Loading state: sr-only role="status" text + skeleton.
//   - No color-only signals: each stat has a text label and value (§5.1).
//   - aria-busy on Card during loading.
//
// DataBag pattern (T0B.2): card self-extracts from dataBag["/api/v1/current"].

import { useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ThermometerHot,
  ThermometerCold,
  Wind,
  Drop,
  Leaf,
} from '@phosphor-icons/react';
import type { Observation } from '../api/types';
import { asConverted } from '../api/types';
import { useArchive, useTodayStats, useStation } from '../hooks/useWeatherData';
import { formatValue } from '../utils/format';
import { aqiCategoryLabel } from './aqi-card';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from './ui/card';
import type { CardComponentProps } from '../lib/card-registry';

// ---------------------------------------------------------------------------
// Legacy props interface — kept for any non-Now-page callers.
// ---------------------------------------------------------------------------

export interface TodaysHighlightsCardProps {
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
      <dt
        className="text-[0.75rem] uppercase tracking-wide text-muted-foreground leading-tight order-3"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {microLabel}
      </dt>
      <span aria-hidden="true" className="text-muted-foreground order-1">
        {icon}
      </span>
      <dd
        className="font-semibold text-foreground leading-tight order-2"
        style={{ fontFamily: 'var(--font-display)', fontFeatureSettings: '"tnum"', fontSize: 'var(--text-body)' }}
      >
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Core render logic (shared by both prop shapes)
// ---------------------------------------------------------------------------

function TodaysHighlightsCardContent({
  observation,
  loading = false,
}: TodaysHighlightsCardProps) {
  const { t } = useTranslation('now');

  // Station timezone for ADR-075-compliant date filtering in useTodayStats.
  const { data: station } = useStation();
  const stationTz = station?.timezone;
  // Derive today's station-local date (YYYY-MM-DD) from the station timezone.
  // Computed only when stationTz is known; undefined otherwise so useTodayStats
  // falls back to its browser-local-midnight path until station data arrives.
  const stationDate = useMemo(
    () =>
      stationTz
        ? new Intl.DateTimeFormat('en-CA', { timeZone: stationTz }).format(new Date())
        : undefined,
    [stationTz],
  );

  // Fetch archive data and compute today's stats internally.
  const archiveStart24h = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);
  const { data: highlightsArchive, refetch: highlightsRefetch } = useArchive({ from: archiveStart24h, fields: 'outTemp,windGust,windSpeed,rain' });
  useEffect(() => { const id = setInterval(() => highlightsRefetch(), 5 * 60 * 1000); return () => clearInterval(id); }, [highlightsRefetch]);
  const todayStats = useTodayStats(observation, highlightsArchive, stationDate, stationTz);

  // Unit labels come from the observation's ConvertedValue fields (ADR-042).
  const tempCV    = asConverted(observation?.outTemp ?? null);
  const windGustCV = asConverted(observation?.windGust ?? null);
  const windSpeedCV = asConverted(observation?.windSpeed ?? null);
  const rainCV    = asConverted(observation?.rain ?? null);

  // Display helpers: each uses the todayStats daily value (high/low/peakGust/
  // avgWind/rainSoFar) and borrows the unit label from the current observation's
  // ConvertedValue. The CV's .formatted string is intentionally NOT used here —
  // that would show the current reading instead of the day's record.
  function tempDisplay(raw: number | null): string {
    if (raw === null) return '—';
    const unit = tempCV?.label ?? '°F';
    return `${Math.round(raw * 10) / 10}${unit}`;
  }

  function windGustDisplay(): string {
    const gust = todayStats?.peakGust;
    if (gust === null || gust === undefined) return '—';
    const unit = windGustCV?.label ?? ' mph';
    return `${Math.round(gust)}${unit}`;
  }

  function windDisplay(): string {
    // Daily average wind — computed from today's archive records (avgWind).
    // Falls back to the current observation's wind speed when no archive average
    // is available (e.g. early morning with no records yet).
    const avg = todayStats?.avgWind;
    if (avg === null || avg === undefined) {
      if (windSpeedCV) return `${windSpeedCV.formatted}${windSpeedCV.label}`;
      return '—';
    }
    const unit = windSpeedCV?.label ?? ' mph';
    return `${Math.round(avg)}${unit}`;
  }

  function rainDisplay(): string {
    const rain = todayStats?.rainSoFar;
    if (rain === null || rain === undefined) return '—';
    const unit = rainCV?.label ?? ' in';
    return `${(Math.round(rain * 100) / 100).toFixed(2)}${unit}`;
  }

  return (
    <Card footprint="tile" rowSpan={2} aria-busy={loading}>
      <CardHeader>
        <CardTitle as="h2">{t('todaysHighlights')}</CardTitle>
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
          <dl className="grid grid-cols-2 gap-x-2 gap-y-6 items-start justify-items-center flex-1 content-center">

            {/* 1 — Today's High */}
            <StatItem
              icon={<ThermometerHot size={18} weight="regular" />}
              value={tempDisplay(todayStats.high)}
              microLabel={t('highlights.todaysHigh')}
            />

            {/* 2 — Today's Low */}
            <StatItem
              icon={<ThermometerCold size={18} weight="regular" />}
              value={tempDisplay(todayStats.low)}
              microLabel={t('highlights.todaysLow')}
            />

            {/* 3 — Peak Gust */}
            <StatItem
              icon={<Wind size={18} weight="regular" />}
              value={windGustDisplay()}
              microLabel={t('highlights.peakGust')}
            />

            {/* 4 — Daily Average Wind (avgWind from archive; falls back to observation.windSpeed) */}
            <StatItem
              icon={<Wind size={18} weight="regular" />}
              value={windDisplay()}
              microLabel={t('highlights.wind')}
            />

            {/* 5 — Rain Today */}
            <StatItem
              icon={<Drop size={18} weight="regular" />}
              value={rainDisplay()}
              microLabel={t('highlights.rainToday')}
            />

            {/* 6 — Peak AQI — conditional; only shown when peakAQI > 0 */}
            {todayStats.peakAQI > 0 && (
              <StatItem
                icon={<Leaf size={18} weight="regular" />}
                value={`${formatValue(todayStats.peakAQI, 'uv')} ${aqiCategoryLabel(todayStats.peakAQI)}`}
                microLabel={t('highlights.peakAqi')}
              />
            )}

          </dl>
        ) : (
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('noData.highlights')}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DataBag-aware component (CardComponentProps — T0B.2 contract)
// ---------------------------------------------------------------------------

export function TodaysHighlightsCard(props: CardComponentProps): React.ReactElement;
export function TodaysHighlightsCard(props: TodaysHighlightsCardProps): React.ReactElement;
export function TodaysHighlightsCard(props: CardComponentProps | TodaysHighlightsCardProps): React.ReactElement {
  if ('dataBag' in props) {
    // DataBag path — self-extract from /api/v1/current
    const currentData = props.dataBag['/api/v1/current'] as {
      data?: Observation | null;
      loading?: boolean;
    } | undefined;
    return (
      <TodaysHighlightsCardContent
        observation={currentData?.data ?? null}
        loading={currentData?.loading ?? true}
      />
    );
  }
  // Legacy path — explicit props
  return (
    <TodaysHighlightsCardContent
      observation={props.observation}
      loading={props.loading}
    />
  );
}

export default TodaysHighlightsCard;
