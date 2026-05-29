import { useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useArchive, useStation } from '../hooks/useWeatherData';
import { useRealtimeObservation } from '../hooks/useRealtimeObservation';
import { asConverted } from '../api/types';
import type { StationMetadata } from '../api/types';

const TABS = [
  { id: 'homepage' },
  { id: 'averageclimate' },
  { id: 'monthly' },
  { id: 'annual' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const RANGES = ['1d', '3d', '7d', '30d', '90d'] as const;
type RangeId = (typeof RANGES)[number];

function rangeToFromParam(range: RangeId): string {
  const now = new Date();
  const map: Record<RangeId, number> = {
    '1d': 1,
    '3d': 3,
    '7d': 7,
    '30d': 30,
    '90d': 90,
  };
  const days = map[range];
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return from.toISOString();
}

function formatXAxisHour(isoString: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    hour12: true,
    timeZone,
  }).format(new Date(isoString));
}

function formatDayOfMonth(isoString: string, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  }).format(new Date(isoString));
}

function formatMonthShort(isoString: string, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    timeZone: tz,
  }).format(new Date(isoString));
}

function monthName(monthIndex: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(
    new Date(2000, monthIndex, 1),
  );
}

function monthNameLong(monthIndex: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long' }).format(
    new Date(2000, monthIndex, 1),
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t: tc } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        {tc('retry')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared props for tab-panel content components
// ---------------------------------------------------------------------------

interface TabContentProps {
  station: StationMetadata | null;
  tz: string;
  locale: string;
  /** Temperature unit label from BFF (e.g. " °F", " °C"). Empty when unknown. */
  tempUnit: string;
}

// ---------------------------------------------------------------------------
// Helper: compute available years from station.firstRecord to now
// ---------------------------------------------------------------------------

function availableYears(firstRecord: string | null | undefined): number[] {
  const currentYear = new Date().getFullYear();
  if (!firstRecord) return [currentYear];
  const firstYear = new Date(firstRecord).getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= firstYear; y--) {
    years.push(y);
  }
  return years;
}

// ---------------------------------------------------------------------------
// Monthly tab
// ---------------------------------------------------------------------------

function MonthlyTabContent({ station, tz, locale, tempUnit }: TabContentProps) {
  const { t } = useTranslation('charts');
  const reducedMotion = usePrefersReducedMotion();
  const now = new Date();

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  // Month is 0-indexed to match JS Date
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [showTable, setShowTable] = useState(false);

  const years = useMemo(() => availableYears(station?.firstRecord), [station?.firstRecord]);

  const monthStartISO = useMemo(
    () => new Date(selectedYear, selectedMonth, 1).toISOString(),
    [selectedYear, selectedMonth],
  );
  const monthEndISO = useMemo(
    () => new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59).toISOString(),
    [selectedYear, selectedMonth],
  );

  const {
    data: archiveData,
    loading,
    error,
    refetch,
  } = useArchive({ from: monthStartISO, to: monthEndISO, interval: 'day' });

  const chartData = useMemo(
    () =>
      (archiveData ?? []).map((r) => ({
        timestamp: r.timestamp,
        temp: r.outTemp,
      })),
    [archiveData],
  );

  const headingMonthName = monthNameLong(selectedMonth, locale);

  // Month options: 0–11
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i,
        label: monthNameLong(i, locale),
      })),
    [locale],
  );

  if (!station?.firstRecord) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        {t('monthlyNoHistory')}
      </p>
    );
  }

  return (
    <>
      {/* Selectors row */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="monthly-year-select"
            className="text-xs font-medium text-muted-foreground"
          >
            {t('monthlyYearLabel')}
          </label>
          <select
            id="monthly-year-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="min-h-[44px] md:min-h-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="monthly-month-select"
            className="text-xs font-medium text-muted-foreground"
          >
            {t('monthlyMonthLabel')}
          </label>
          <select
            id="monthly-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="min-h-[44px] md:min-h-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart card */}
      <Card aria-busy={loading}>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="font-heading text-base leading-snug font-medium">
            {t('monthlyChartHeading', { monthName: headingMonthName, year: selectedYear })}
          </h2>
          <button
            type="button"
            onClick={() => setShowTable((prev) => !prev)}
            aria-pressed={showTable}
            className="inline-flex items-center min-h-[44px] md:min-h-0 px-3 py-2 text-sm text-muted-foreground rounded-md border border-border hover:text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {showTable ? t('showChart') : t('showDataTable')}
          </button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <>
              <span className="sr-only" role="status">{t('loadingChart')}</span>
              <TileSkeleton className="h-[350px]" />
            </>
          ) : error ? (
            <TileError message={t('unableToLoad')} onRetry={refetch} />
          ) : archiveData && archiveData.length > 0 ? (
            showTable ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    {t('monthlyTableCaption', { monthName: headingMonthName, year: selectedYear })}
                  </caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 px-3 text-left font-medium text-muted-foreground">
                        {t('monthlyTableHeaderDate')}
                      </th>
                      <th scope="col" className="py-2 px-3 text-right font-medium text-muted-foreground">
                        {t('monthlyTableHeaderTemperature')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {archiveData.map((record) => (
                      <tr key={record.timestamp} className="border-b border-border last:border-0">
                        <td className="py-1.5 px-3 text-foreground">
                          {formatDayOfMonth(record.timestamp, tz, locale)}
                        </td>
                        <td className="py-1.5 px-3 text-right text-foreground">
                          {record.outTemp != null ? `${record.outTemp}${tempUnit}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <div
                  role="figure"
                  aria-label={t('ariaMonthlyChartFigure', { monthName: headingMonthName, year: selectedYear })}
                  className="h-[350px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        opacity={0.5}
                      />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(v) => formatDayOfMonth(v, tz, locale)}
                        tick={{ fontSize: 11 }}
                        interval={4}
                        stroke="var(--color-muted-foreground)"
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        domain={['auto', 'auto']}
                        stroke="var(--color-muted-foreground)"
                        tickLine={false}
                        width={40}
                        tickFormatter={(v) => `${v}°`}
                        unit={tempUnit}
                      />
                      <Tooltip
                        formatter={(value) => [
                          typeof value === 'number' ? `${value}${tempUnit}` : String(value),
                          t('seriesTemperature'),
                        ]}
                        labelFormatter={(label) => formatDayOfMonth(String(label), tz, locale)}
                        contentStyle={{
                          background: 'var(--color-popover)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '6px',
                          color: 'var(--color-popover-foreground)',
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="temp"
                        name={t('seriesTemperature')}
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        isAnimationActive={!reducedMotion}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* sr-only data table for screen readers when chart is visible */}
                <table className="sr-only">
                  <caption>
                    {t('monthlyTableCaption', { monthName: headingMonthName, year: selectedYear })}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('monthlyTableHeaderDate')}</th>
                      <th scope="col">{t('monthlyTableHeaderTemperature')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archiveData.map((record) => (
                      <tr key={record.timestamp}>
                        <td>{formatDayOfMonth(record.timestamp, tz, locale)}</td>
                        <td>{record.outTemp != null ? `${record.outTemp}${tempUnit}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">
              {t('monthlyNoData')}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Annual tab
// ---------------------------------------------------------------------------

function AnnualTabContent({ station, tz, locale, tempUnit }: TabContentProps) {
  const { t } = useTranslation('charts');
  const reducedMotion = usePrefersReducedMotion();
  const now = new Date();

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [showTable, setShowTable] = useState(false);

  const years = useMemo(() => availableYears(station?.firstRecord), [station?.firstRecord]);

  const yearStartISO = useMemo(
    () => new Date(selectedYear, 0, 1).toISOString(),
    [selectedYear],
  );
  const yearEndISO = useMemo(
    () => new Date(selectedYear, 11, 31, 23, 59, 59).toISOString(),
    [selectedYear],
  );

  const {
    data: archiveData,
    loading,
    error,
    refetch,
  } = useArchive({ from: yearStartISO, to: yearEndISO, interval: 'day' });

  const chartData = useMemo(
    () =>
      (archiveData ?? []).map((r) => ({
        timestamp: r.timestamp,
        temp: r.outTemp,
      })),
    [archiveData],
  );

  if (!station?.firstRecord) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        {t('annualNoHistory')}
      </p>
    );
  }

  return (
    <>
      {/* Selector row */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="annual-year-select"
            className="text-xs font-medium text-muted-foreground"
          >
            {t('annualYearLabel')}
          </label>
          <select
            id="annual-year-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="min-h-[44px] md:min-h-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart card */}
      <Card aria-busy={loading}>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="font-heading text-base leading-snug font-medium">
            {t('annualChartHeading', { year: selectedYear })}
          </h2>
          <button
            type="button"
            onClick={() => setShowTable((prev) => !prev)}
            aria-pressed={showTable}
            className="inline-flex items-center min-h-[44px] md:min-h-0 px-3 py-2 text-sm text-muted-foreground rounded-md border border-border hover:text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {showTable ? t('showChart') : t('showDataTable')}
          </button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <>
              <span className="sr-only" role="status">{t('loadingChart')}</span>
              <TileSkeleton className="h-[350px]" />
            </>
          ) : error ? (
            <TileError message={t('unableToLoad')} onRetry={refetch} />
          ) : archiveData && archiveData.length > 0 ? (
            showTable ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    {t('annualTableCaption', { year: selectedYear })}
                  </caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 px-3 text-left font-medium text-muted-foreground">
                        {t('annualTableHeaderDate')}
                      </th>
                      <th scope="col" className="py-2 px-3 text-right font-medium text-muted-foreground">
                        {t('annualTableHeaderTemperature')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {archiveData.map((record) => (
                      <tr key={record.timestamp} className="border-b border-border last:border-0">
                        <td className="py-1.5 px-3 text-foreground">
                          {formatDayOfMonth(record.timestamp, tz, locale)}
                        </td>
                        <td className="py-1.5 px-3 text-right text-foreground">
                          {record.outTemp != null ? `${record.outTemp}${tempUnit}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <div
                  role="figure"
                  aria-label={t('ariaAnnualChartFigure', { year: selectedYear })}
                  className="h-[350px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        opacity={0.5}
                      />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(v) => formatMonthShort(v, tz, locale)}
                        tick={{ fontSize: 11 }}
                        interval={30}
                        stroke="var(--color-muted-foreground)"
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        domain={['auto', 'auto']}
                        stroke="var(--color-muted-foreground)"
                        tickLine={false}
                        width={40}
                        tickFormatter={(v) => `${v}°`}
                        unit={tempUnit}
                      />
                      <Tooltip
                        formatter={(value) => [
                          typeof value === 'number' ? `${value}${tempUnit}` : String(value),
                          t('seriesTemperature'),
                        ]}
                        labelFormatter={(label) => formatDayOfMonth(String(label), tz, locale)}
                        contentStyle={{
                          background: 'var(--color-popover)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '6px',
                          color: 'var(--color-popover-foreground)',
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="temp"
                        name={t('seriesTemperature')}
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        isAnimationActive={!reducedMotion}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* sr-only data table for screen readers when chart is visible */}
                <table className="sr-only">
                  <caption>{t('annualTableCaption', { year: selectedYear })}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('annualTableHeaderDate')}</th>
                      <th scope="col">{t('annualTableHeaderTemperature')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archiveData.map((record) => (
                      <tr key={record.timestamp}>
                        <td>{formatDayOfMonth(record.timestamp, tz, locale)}</td>
                        <td>{record.outTemp != null ? `${record.outTemp}${tempUnit}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">
              {t('annualNoData')}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Average Climate tab
// ---------------------------------------------------------------------------

function AverageClimateTabContent({ station, locale, tempUnit }: TabContentProps) {
  const { t } = useTranslation('charts');
  const reducedMotion = usePrefersReducedMotion();
  const [showTable, setShowTable] = useState(false);

  const nowISO = useMemo(() => new Date().toISOString(), []);

  const {
    data: archiveData,
    loading,
    error,
    refetch,
  } = useArchive({
    from: station?.firstRecord ?? undefined,
    to: nowISO,
    interval: 'day',
    limit: '100000',
  });

  const monthlyAverages = useMemo(() => {
    if (!archiveData) return [];
    const buckets: { sum: number; count: number }[] = Array.from(
      { length: 12 },
      () => ({ sum: 0, count: 0 }),
    );
    for (const record of archiveData) {
      if (record.outTemp == null) continue;
      const month = new Date(record.timestamp).getMonth();
      buckets[month].sum += record.outTemp as number;
      buckets[month].count += 1;
    }
    return buckets.map((b, i) => ({
      month: i,
      avgTemp: b.count > 0 ? Math.round((b.sum / b.count) * 10) / 10 : null,
    }));
  }, [archiveData]);

  // Check whether we have any meaningful data
  const hasData = monthlyAverages.some((m) => m.avgTemp !== null);

  if (!station?.firstRecord) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        {t('averageClimateNoData')}
      </p>
    );
  }

  return (
    <Card aria-busy={loading}>
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 className="font-heading text-base leading-snug font-medium">
          {t('averageClimateHeading')}
        </h2>
        <button
          type="button"
          onClick={() => setShowTable((prev) => !prev)}
          aria-pressed={showTable}
          className="inline-flex items-center min-h-[44px] md:min-h-0 px-3 py-2 text-sm text-muted-foreground rounded-md border border-border hover:text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {showTable ? t('showChart') : t('showDataTable')}
        </button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loadingChart')}</span>
            <TileSkeleton className="h-[350px]" />
          </>
        ) : error ? (
          <TileError message={t('unableToLoad')} onRetry={refetch} />
        ) : hasData ? (
          showTable ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {t('averageClimateTableCaption')}
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="py-2 px-3 text-left font-medium text-muted-foreground">
                      {t('averageClimateTableHeaderMonth')}
                    </th>
                    <th scope="col" className="py-2 px-3 text-right font-medium text-muted-foreground">
                      {t('averageClimateTableHeaderAvgTemp')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyAverages.map((row) => (
                    <tr key={row.month} className="border-b border-border last:border-0">
                      <td className="py-1.5 px-3 text-foreground">
                        {monthNameLong(row.month, locale)}
                      </td>
                      <td className="py-1.5 px-3 text-right text-foreground">
                        {row.avgTemp != null ? `${row.avgTemp}${tempUnit}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div
                role="figure"
                aria-label={t('averageClimateChartFigure')}
                className="h-[350px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyAverages}
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="month"
                      tickFormatter={(v) => monthName(v as number, locale)}
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={['auto', 'auto']}
                      stroke="var(--color-muted-foreground)"
                      tickLine={false}
                      width={40}
                      tickFormatter={(v) => `${v}°`}
                      unit={tempUnit}
                    />
                    <Tooltip
                      formatter={(value) => [
                        typeof value === 'number' ? `${value}${tempUnit}` : String(value),
                        t('averageClimateSeriesAvgTemp'),
                      ]}
                      labelFormatter={(label) => monthNameLong(label as number, locale)}
                      contentStyle={{
                        background: 'var(--color-popover)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        color: 'var(--color-popover-foreground)',
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="avgTemp"
                      name={t('averageClimateSeriesAvgTemp')}
                      fill="var(--color-primary)"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={!reducedMotion}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* sr-only data table for screen readers when chart is visible */}
              <table className="sr-only">
                <caption>{t('averageClimateTableCaption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('averageClimateTableHeaderMonth')}</th>
                    <th scope="col">{t('averageClimateTableHeaderAvgTemp')}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyAverages.map((row) => (
                    <tr key={row.month}>
                      <td>{monthNameLong(row.month, locale)}</td>
                      <td>{row.avgTemp != null ? `${row.avgTemp}${tempUnit}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )
        ) : (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {t('averageClimateNoData')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main ChartsPage
// ---------------------------------------------------------------------------

export function ChartsPage() {
  const { t, i18n } = useTranslation('charts');
  const { data: station } = useStation();
  const { data: observation } = useRealtimeObservation();
  const tz = station?.timezone ?? 'UTC';
  const locale = i18n.language;

  // Derive temperature unit label from BFF-converted observation (ADR-042).
  // Falls back to empty string when observation isn't loaded yet.
  const tempUnit = asConverted(observation?.outTemp ?? null)?.label ?? '';
  const [activeTab, setActiveTab] = useState<TabId>('homepage');
  const [activeRange, setActiveRange] = useState<RangeId>('1d');
  const [showTable, setShowTable] = useState(false);
  const [tabsCanScrollRight, setTabsCanScrollRight] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabScrollRef = useRef<HTMLDivElement | null>(null);

  // Reset homepage showTable when active tab changes
  useEffect(() => setShowTable(false), [activeTab]);

  // Detect whether the tab row overflows so we can show a fade indicator
  useLayoutEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;

    function checkOverflow() {
      if (!el) return;
      setTabsCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }

    checkOverflow();
    el.addEventListener('scroll', checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkOverflow);
      ro.disconnect();
    };
  }, []);

  // useMemo so that archiveFrom only changes when activeRange changes, not on every render.
  // Without this, rangeToFromParam returns a new Date() each render, producing a new ISO
  // string every millisecond. That string flows into useArchive's deps array, triggering
  // a refetch on every render → setLoading(true) → re-render → new string → infinite loop.
  const archiveFrom = useMemo(() => rangeToFromParam(activeRange), [activeRange]);
  const { data: archiveData, loading: archiveLoading, error: archiveError, refetch: archiveRefetch } = useArchive({
    from: archiveFrom,
  });

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      if (e.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
      else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = TABS.length - 1;

      if (nextIndex !== null) {
        e.preventDefault();
        setActiveTab(TABS[nextIndex].id);
        tabRefs.current[nextIndex]?.focus();
      }
    },
    []
  );

  const chartData = (archiveData ?? []).map((record) => ({
    timestamp: record.timestamp,
    temp: record.outTemp,
  }));

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <h1 className="sr-only">{t('title')}</h1>

      {/* WAI-ARIA Tabs */}
      <div className="relative">
        <div
          ref={tabScrollRef}
          role="tablist"
          aria-label={t('ariaTabGroupLabel')}
          className="flex gap-1 overflow-x-auto pb-1"
        >
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={[
                'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'min-h-[44px] md:min-h-0',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-muted/70',
              ].join(' ')}
            >
              {t(`tabs.${tab.id}`)}
            </button>
          ))}
        </div>
        {/* Scroll fade indicator — visible only when content overflows right */}
        {tabsCanScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent"
          />
        )}
      </div>

      {/* Homepage Tab Panel */}
      <div
        role="tabpanel"
        id="panel-homepage"
        aria-labelledby="tab-homepage"
        hidden={activeTab !== 'homepage'}
      >
        {/* Range Selector */}
        <div
          className="flex gap-1 mb-4"
          role="group"
          aria-label={t('ariaRangeGroupLabel')}
        >
          {RANGES.map((range) => (
            <Button
              key={range}
              type="button"
              variant={activeRange === range ? 'default' : 'outline'}
              size="sm"
              aria-pressed={activeRange === range}
              onClick={() => setActiveRange(range)}
              className="min-h-[44px] md:min-h-0"
            >
              {t(`ranges.${range}`)}
            </Button>
          ))}
        </div>

        {/* Temperature Chart Card */}
        <Card aria-busy={archiveLoading}>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-heading text-base leading-snug font-medium">{t('temperatureCardHeading', { range: activeRange })}</h2>
            <button
              type="button"
              onClick={() => setShowTable((prev) => !prev)}
              aria-pressed={showTable}
              className="inline-flex items-center min-h-[44px] md:min-h-0 px-3 py-2 text-sm text-muted-foreground rounded-md border border-border hover:text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {showTable ? t('showChart') : t('showDataTable')}
            </button>
          </CardHeader>
          <CardContent>
            {archiveLoading ? (
              <>
                <span className="sr-only" role="status">{t('loadingChart')}</span>
                <TileSkeleton className="h-[350px]" />
              </>
            ) : archiveError ? (
              <TileError message={t('unableToLoad')} onRetry={archiveRefetch} />
            ) : archiveData && archiveData.length > 0 ? (
              showTable ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t('tableCaption')}</caption>
                    <thead>
                      <tr className="border-b border-border">
                        <th scope="col" className="py-2 px-3 text-left font-medium text-muted-foreground">{t('tableHeaderTime')}</th>
                        <th scope="col" className="py-2 px-3 text-right font-medium text-muted-foreground">{t('tableHeaderTemperature')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archiveData.map((record) => (
                        <tr key={record.timestamp} className="border-b border-border last:border-0">
                          <td className="py-1.5 px-3 text-foreground">{formatXAxisHour(record.timestamp, tz, locale)}</td>
                          <td className="py-1.5 px-3 text-right text-foreground">{record.outTemp}{tempUnit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <div
                    role="figure"
                    aria-label={t('ariaChartFigure', { range: activeRange })}
                    className="h-[350px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--color-border)"
                          opacity={0.5}
                        />
                        <XAxis
                          dataKey="timestamp"
                          tickFormatter={(v) => formatXAxisHour(v, tz, locale)}
                          tick={{ fontSize: 11 }}
                          interval={7}
                          stroke="var(--color-muted-foreground)"
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          domain={['auto', 'auto']}
                          stroke="var(--color-muted-foreground)"
                          tickLine={false}
                          width={40}
                          tickFormatter={(v) => `${v}°`}
                          unit={tempUnit}
                        />
                        <Tooltip
                          formatter={(value) => [
                            typeof value === 'number' ? `${value}${tempUnit}` : String(value),
                            t('seriesTemperature'),
                          ]}
                          labelFormatter={(label) => formatXAxisHour(String(label), tz, locale)}
                          contentStyle={{
                            background: 'var(--color-popover)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px',
                            color: 'var(--color-popover-foreground)',
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="temp"
                          name={t('seriesTemperature')}
                          stroke="var(--color-primary)"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={!reducedMotion}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* sr-only data table for screen readers when chart is visible */}
                  <table className="sr-only">
                    <caption>{t('tableCaption')}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('tableHeaderTime')}</th>
                        <th scope="col">{t('tableHeaderTemperature')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archiveData.map((record) => (
                        <tr key={record.timestamp}>
                          <td>{formatXAxisHour(record.timestamp, tz, locale)}</td>
                          <td>{record.outTemp != null ? `${record.outTemp}${tempUnit}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">{t('noData')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Average Climate Tab Panel */}
      <div
        role="tabpanel"
        id="panel-averageclimate"
        aria-labelledby="tab-averageclimate"
        hidden={activeTab !== 'averageclimate'}
      >
        {activeTab === 'averageclimate' && (
          <AverageClimateTabContent station={station} tz={tz} locale={locale} tempUnit={tempUnit} />
        )}
      </div>

      {/* Monthly Tab Panel */}
      <div
        role="tabpanel"
        id="panel-monthly"
        aria-labelledby="tab-monthly"
        hidden={activeTab !== 'monthly'}
      >
        {activeTab === 'monthly' && (
          <MonthlyTabContent station={station} tz={tz} locale={locale} tempUnit={tempUnit} />
        )}
      </div>

      {/* Annual Tab Panel */}
      <div
        role="tabpanel"
        id="panel-annual"
        aria-labelledby="tab-annual"
        hidden={activeTab !== 'annual'}
      >
        {activeTab === 'annual' && (
          <AnnualTabContent station={station} tz={tz} locale={locale} tempUnit={tempUnit} />
        )}
      </div>
    </div>
  );
}

export default ChartsPage;
