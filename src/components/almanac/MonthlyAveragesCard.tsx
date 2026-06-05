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
  ResponsiveContainer,
} from 'recharts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../ui/card';
import type { ClimatologyMonthly } from '../../api/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonthlyAveragesCardProps {
  climatology: ClimatologyMonthly | null;
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
        <div role="alert" className="flex flex-col gap-2 items-start text-sm">
          <p className="text-destructive">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
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

function buildChartData(climatology: ClimatologyMonthly): ChartRow[] {
  return climatology.months.map((month, i) => ({
    month,
    avgHigh: climatology.avgHighTemp[i] ?? null,
    avgLow: climatology.avgLowTemp[i] ?? null,
    avgDewpoint: climatology.avgDewpoint[i] ?? null,
    avgRainfall: climatology.avgRainfall[i] ?? null,
  }));
}

function hasUsableData(climatology: ClimatologyMonthly): boolean {
  return (
    climatology.avgHighTemp.some((v) => v !== null) ||
    climatology.avgLowTemp.some((v) => v !== null) ||
    climatology.avgRainfall.some((v) => v !== null)
  );
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
  climatology,
  loading,
  error,
}: MonthlyAveragesCardProps) {
  const { t } = useTranslation('almanac');

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
  if (climatology === null || !hasUsableData(climatology)) {
    return (
      <Card footprint="full">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          {t('noData')}
        </CardContent>
      </Card>
    );
  }

  const chartData = buildChartData(climatology);

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
          Visual chart — role="img" with aria-label so the chart container is
          announced as a graphic rather than an anonymous div.
          Tick labels use fontFamily: 'var(--font-chart)' (Lexend) per typography tokens.
        */}
        <div
          role="img"
          aria-label={t('climatology.chartAriaLabel')}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fontFamily: 'var(--font-chart)' }}
                className="fill-muted-foreground"
              />
              {/* Left Y-axis: temperature */}
              <YAxis
                yAxisId="temp"
                tick={{ fontSize: 12, fontFamily: 'var(--font-chart)' }}
                className="fill-muted-foreground"
                label={{
                  value: '°',
                  position: 'insideLeft',
                  offset: 4,
                  style: { fontSize: 12, fontFamily: 'var(--font-chart)' },
                }}
              />
              {/* Right Y-axis: rainfall */}
              <YAxis
                yAxisId="rain"
                orientation="right"
                tick={{ fontSize: 12, fontFamily: 'var(--font-chart)' }}
                className="fill-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  fontSize: '0.75rem',
                  borderRadius: '0.5rem',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '0.75rem', fontFamily: 'var(--font-chart)' }} />
              {/* Rainfall bars rendered behind temperature lines */}
              <Bar
                yAxisId="rain"
                dataKey="avgRainfall"
                name={t('climatology.series.avgRainfall')}
                fill="hsl(210 80% 65%)"
                fillOpacity={0.4}
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="avgHigh"
                name={t('climatology.series.avgHigh')}
                stroke="hsl(12 90% 52%)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="avgLow"
                name={t('climatology.series.avgLow')}
                stroke="hsl(210 80% 55%)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="avgDewpoint"
                name={t('climatology.series.avgDewpoint')}
                stroke="hsl(270 60% 55%)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                strokeDasharray="4 2"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
