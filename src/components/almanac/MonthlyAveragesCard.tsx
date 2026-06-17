// MonthlyAveragesCard.tsx — Extracted from almanac.tsx (T2.8)
// Renders the climatological monthly averages chart card.
// Pure extraction — no redesign. Wired into almanac.tsx in T2.9.

import { useTranslation } from 'react-i18next';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ChartContainer } from '../charts/chart-container';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../ui/card';
import type { GroupedArchiveData } from '../../api/types';
import { useTheme } from '../../lib/theme-provider';
import { ensureChartContrast } from '../../utils/chart-contrast';
import { useIsMobile } from '../../hooks/useIsMobile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonthlyAveragesCardProps {
  groupedData: GroupedArchiveData | null;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Skeleton placeholder shown while data is loading. */
function CardSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-72"
      aria-hidden="true"
    />
  );
}

/** Error state — displays the error message and a retry button. */
function CardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('common');
  return (
    <Card footprint="full">
      <CardContent className="py-8">
        <div role="alert" className="flex flex-col gap-2 items-start" style={{ fontSize: 'var(--text-body)' }}>
          <p className="text-destructive">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
            style={{ fontSize: 'var(--text-label)' }}
          >
            {t('retry')}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Derived data shape
// ---------------------------------------------------------------------------

interface ChartRow {
  month: string;
  avgHigh: number | null;
  avgLow: number | null;
  avgDewpoint: number | null;
  avgRainfall: number | null;
}

/** Month number strings "01"–"12" mapped to short month names. */
const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

function buildChartData(groupedData: GroupedArchiveData): ChartRow[] {
  const avgHigh = groupedData.series['outTemp:avg:max'] ?? [];
  const avgLow  = groupedData.series['outTemp:avg:min'] ?? [];
  const avgDewp = groupedData.series['dewpoint:avg']    ?? [];
  const avgRain = groupedData.series['rain:avg:sum']    ?? [];

  return groupedData.labels.map((label, i) => ({
    month: MONTH_LABELS[label] ?? label,
    avgHigh:    avgHigh[i] ?? null,
    avgLow:     avgLow[i]  ?? null,
    avgDewpoint: avgDewp[i] ?? null,
    avgRainfall: avgRain[i] ?? null,
  }));
}

function hasUsableData(groupedData: GroupedArchiveData): boolean {
  const avgHigh = groupedData.series['outTemp:avg:max'] ?? [];
  const avgLow  = groupedData.series['outTemp:avg:min'] ?? [];
  const avgRain = groupedData.series['rain:avg:sum']    ?? [];
  return (
    avgHigh.some((v) => v !== null) ||
    avgLow.some((v) => v !== null) ||
    avgRain.some((v) => v !== null)
  );
}

// ---------------------------------------------------------------------------
// Custom dot shapes — match approved mockup marker styles
// ---------------------------------------------------------------------------

function CircleRingDot(props: any) {
  const { cx, cy, fill } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={fill} />
      <circle cx={cx} cy={cy} r={1.5} fill="var(--background, #0d0f18)" />
    </g>
  );
}

function DiamondDot(props: any) {
  const { cx, cy, fill } = props;
  if (cx == null || cy == null) return null;
  return (
    <g transform={`translate(${cx},${cy}) rotate(45)`}>
      <rect x={-3.5} y={-3.5} width={7} height={7} fill={fill} />
    </g>
  );
}

function SquareDot(props: any) {
  const { cx, cy, fill } = props;
  if (cx == null || cy == null) return null;
  return <rect x={cx - 3} y={cy - 3} width={6} height={6} rx={1} fill={fill} />;
}

// ---------------------------------------------------------------------------
// MonthlyAveragesCard
// ---------------------------------------------------------------------------

/**
 * Displays the climatological monthly averages chart.
 *
 * Accessibility notes:
 * - Chart container has role="img" + aria-label (WCAG 1.1.1 via coding-rules §5.5)
 * - A visually-hidden data table provides the underlying values to screen readers
 * - Chart tick labels use --font-chart (Lexend) per typography tokens (locked 2026-05-31)
 * - Card title uses --font-sans (Manrope) via the CardTitle's font-heading class
 * - No color-only signals; each series is distinguished by name in the Legend
 * - The retry button is a <button>, keyboard-reachable with visible focus ring
 */
export function MonthlyAveragesCard({
  groupedData,
  loading,
  error,
}: MonthlyAveragesCardProps) {
  const { t } = useTranslation('almanac');
  const { resolved: resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const isMobile = useIsMobile();

  // Loading state — skeleton outside the card shell to match existing almanac pattern
  if (loading) {
    return <CardSkeleton />;
  }

  // Error state — surface error with retry affordance
  // NOTE: onRetry is not wired here because the component does not own the fetch.
  // T2.9 will pass a refetch callback; for now we provide a no-op stub so the
  // component compiles and the button is still keyboard-reachable.
  if (error !== null) {
    return <CardError message={error} onRetry={() => { /* wired in T2.9 */ }} />;
  }

  // Null / no-data state
  if (groupedData === null || !hasUsableData(groupedData)) {
    return (
      <Card footprint="full">
        <CardContent className="py-8 text-center text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
          {t('noData')}
        </CardContent>
      </Card>
    );
  }

  const chartData = buildChartData(groupedData);

  return (
    <Card footprint="full">
      <CardHeader>
        {/*
          CardTitle uses font-heading class which resolves to --font-sans (Manrope)
          per the typography token spec (locked 2026-05-31).
        */}
        <CardTitle as="h2">{t('climatology.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {/*
          Screen-reader data table — provides chart values to non-sighted users.
          WCAG 1.1.1 / coding rules §5.5. "sr-only" hides it visually.
        */}
        <table className="sr-only" aria-label={t('climatology.tableAriaLabel')}>
          <thead>
            <tr>
              <th scope="col">{t('climatology.table.month')}</th>
              <th scope="col">{t('climatology.table.avgHigh')}</th>
              <th scope="col">{t('climatology.table.avgLow')}</th>
              <th scope="col">{t('climatology.table.avgDewpoint')}</th>
              <th scope="col">{t('climatology.table.avgRainfall')}</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((row) => (
              <tr key={row.month}>
                <td>{row.month}</td>
                <td>{row.avgHigh ?? '—'}</td>
                <td>{row.avgLow ?? '—'}</td>
                <td>{row.avgDewpoint ?? '—'}</td>
                <td>{row.avgRainfall ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/*
          Visual chart — ChartContainer provides role="img" + aria-label so the
          chart is announced as a graphic rather than an anonymous div (WCAG 1.1.1).
          Tick labels use fontFamily: 'var(--font-chart)' (Lexend) per typography tokens.
        */}
        <ChartContainer height={300} ariaLabel={t('climatology.chartAriaLabel')}>
            <ComposedChart
              data={chartData}
              margin={isMobile ? { top: 4, right: 4, bottom: 4, left: 0 } : { top: 8, right: 55, left: 15, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 14, fontFamily: 'var(--font-chart)', fontWeight: 600 }}
                minTickGap={isMobile ? 20 : 50}
                className="fill-muted-foreground"
              />
              <YAxis
                yAxisId="temp"
                width={isMobile ? 35 : undefined}
                tick={{ fontSize: 14, fontFamily: 'var(--font-chart)' }}
                className="fill-muted-foreground"
                tickFormatter={(v: number) => `${v}°`}
                label={
                  !isMobile
                    ? {
                        value: t('climatology.yAxisTemp', 'Average Temperature (°F)'),
                        angle: -90,
                        position: 'insideLeft',
                        offset: -5,
                        style: { fontSize: 14, fontFamily: 'var(--font-chart)', fill: 'var(--muted-foreground, #a1a1aa)', textAnchor: 'middle' },
                      }
                    : undefined
                }
              />
              <YAxis
                yAxisId="rain"
                orientation="right"
                width={isMobile ? 30 : undefined}
                tick={{ fontSize: 14, fontFamily: 'var(--font-chart)' }}
                className="fill-muted-foreground"
                label={
                  !isMobile
                    ? {
                        value: t('climatology.yAxisRain', 'Avg Monthly Rain (in)'),
                        angle: 90,
                        position: 'insideRight',
                        offset: -5,
                        style: { fontSize: 14, fontFamily: 'var(--font-chart)', fill: 'var(--muted-foreground, #a1a1aa)', textAnchor: 'middle' },
                      }
                    : undefined
                }
              />
              <Tooltip
                contentStyle={{
                  fontSize: '0.75rem',
                  borderRadius: '0.5rem',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '0.75rem', fontFamily: 'var(--font-chart)' }} />
              <Bar
                yAxisId="rain"
                dataKey="avgRainfall"
                name={t('climatology.series.avgRainfall')}
                fill="#93c5fd"
                fillOpacity={isDark ? 0.7 : 0.55}
                radius={[2, 2, 0, 0]}
                legendType="rect"
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="avgHigh"
                name={t('climatology.series.avgHigh')}
                stroke="var(--temp-hi)"
                strokeWidth={2.5}
                dot={<CircleRingDot />}
                activeDot={{ r: 5 }}
                legendType="circle"
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="avgLow"
                name={t('climatology.series.avgLow')}
                stroke="var(--temp-lo)"
                strokeWidth={2}
                dot={<DiamondDot />}
                activeDot={{ r: 5 }}
                legendType="diamond"
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="avgDewpoint"
                name={t('climatology.series.avgDewpoint')}
                stroke={ensureChartContrast('#a855f7', isDark)}
                strokeWidth={2}
                dot={<SquareDot />}
                activeDot={{ r: 5 }}
                legendType="square"
              />
            </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
