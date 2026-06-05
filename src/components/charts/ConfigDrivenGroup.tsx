// ConfigDrivenGroup.tsx — T2.3
// Orchestrates one ChartGroupConfig: date controls, data fetching, and
// rendering of one or more ConfigDrivenChart instances.
//
// Architecture:
//   ConfigDrivenGroup receives ChartGroupConfig
//     → Determines data mode (climatology vs archive)
//     → Renders date controls (rolling ranges | year/month dropdowns | none)
//     → Fetches via useArchive or useClimatologyMonthly
//     → Transforms records into seriesId-keyed rows
//     → Renders ConfigDrivenChart for each chart in the group
//     → Supports chart/table view toggle
//
// Accessibility:
//   - Range button group: role="radiogroup" + aria-label + aria-checked per button
//   - Dropdowns: <select> with visible/sr-only <label>
//   - Table toggle: <button> with aria-pressed
//   - Container: aria-busy while loading
//   - Loading state: sr-only role="status" announcement
//   - Visible data table in table mode (not sr-only)
//
// No DOMPurify dep available in Phase 2; pageContent rendered as plain text.
// Phase 4 T4.5 handles proper Markdown rendering.

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useArchive, useClimatologyMonthly } from '../../hooks/useWeatherData';
import { ConfigDrivenChart } from './ConfigDrivenChart';
import type { ChartGroupConfig } from '../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ConfigDrivenGroupProps {
  group: ChartGroupConfig;
  globalColors?: string[];
  globalType?: string;
  reducedMotion?: boolean;
  /** From station.firstRecord, used to compute year dropdown range. */
  stationFirstYear?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a range string like "1d", "3d", "7h", "30m" to seconds.
 * Falls back to 86400 (1 day) on unrecognised input.
 */
function parseRangeToSeconds(range: string): number {
  const match = range.match(/^(\d+)([dhm])$/);
  if (!match) return 86400;
  const [, num, unit] = match;
  const n = parseInt(num, 10);
  if (unit === 'd') return n * 86400;
  if (unit === 'h') return n * 3600;
  if (unit === 'm') return n * 60;
  return 86400;
}

/**
 * Build a year list from stationFirstYear (or currentYear) down to currentYear,
 * descending so the most-recent year appears first.
 */
function buildYearList(stationFirstYear: number | undefined): number[] {
  const currentYear = new Date().getFullYear();
  const firstYear = stationFirstYear ?? currentYear;
  const years: number[] = [];
  for (let y = currentYear; y >= firstYear; y--) {
    years.push(y);
  }
  return years;
}

/** Month labels (1-indexed, Jan=1) for the month dropdown. */
const MONTH_LABELS: { value: number; label: string }[] = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

/**
 * Map from `${observationType}:${averageType}` → ClimatologyMonthly field key.
 * Used to map series config onto the four climatology arrays.
 */
const CLIMATOLOGY_FIELD_MAP: Record<string, string> = {
  'outTemp:avg_max': 'avgHighTemp',
  'outTemp:avg_min': 'avgLowTemp',
  'dewpoint:avg': 'avgDewpoint',
  'rain:avg_monthly_total': 'avgRainfall',
};

/**
 * Format a timestamp ISO string for the x-axis tick, choosing resolution
 * based on the active range string.
 */
function formatTimestamp(value: string | number, selectedRange: string): string {
  const d = new Date(typeof value === 'number' ? value : value);
  if (isNaN(d.getTime())) return String(value);
  const rangeSec = parseRangeToSeconds(selectedRange);
  const rangeDays = rangeSec / 86400;

  if (rangeDays <= 3) {
    // Sub-3-day: show hour
    return d.toLocaleTimeString([], { hour: 'numeric', hour12: true });
  }
  if (rangeDays <= 14) {
    // 3d–14d: show day + month
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  // >14 days: show month short
  return d.toLocaleDateString([], { month: 'short' });
}

// ---------------------------------------------------------------------------
// Loading / Error sub-components (mirrors charts.tsx pattern)
// ---------------------------------------------------------------------------

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-[300px]'}`}
      aria-hidden="true"
    />
  );
}

function TileError({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        {retryLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConfigDrivenGroup({
  group,
  globalColors,
  globalType,
  reducedMotion = false,
  stationFirstYear,
}: ConfigDrivenGroupProps) {
  const { t } = useTranslation('charts');

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [selectedRange, setSelectedRange] = useState<string>(
    group.rollingRanges[0] ?? '1d',
  );
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  // -------------------------------------------------------------------------
  // Data mode detection
  // -------------------------------------------------------------------------

  // Climatology mode: any chart in the group uses monthly x-axis grouping
  const isClimatology = group.charts.some((c) => c.xAxisGroupby === 'month');

  // -------------------------------------------------------------------------
  // Archive fetch params (useMemo — prevents infinite re-render loops)
  // -------------------------------------------------------------------------

  const archiveParams = useMemo(() => {
    if (isClimatology) return undefined;

    // Collect unique observation types across all visible series
    const fields = new Set<string>();
    group.charts.forEach((chart) => {
      chart.series.forEach((s) => {
        if (s.observationType && s.visible !== false) {
          fields.add(s.observationType);
        }
      });
    });

    let from: string;
    let to: string;

    if (group.timespanStart != null && group.timespanStop != null) {
      // Fixed time window (timespan_specific groups)
      from = new Date(group.timespanStart * 1000).toISOString();
      to = new Date(group.timespanStop * 1000).toISOString();
    } else if (group.enableDateRanges && group.rollingRanges.length > 0) {
      // Rolling range mode
      const rangeSeconds = parseRangeToSeconds(selectedRange);
      to = new Date().toISOString();
      from = new Date(Date.now() - rangeSeconds * 1000).toISOString();
    } else if (selectedYear) {
      // Year/month mode
      if (selectedMonth != null) {
        from = new Date(selectedYear, selectedMonth - 1, 1).toISOString();
        const nextMonth = new Date(selectedYear, selectedMonth, 1);
        to = nextMonth.toISOString();
      } else {
        from = new Date(selectedYear, 0, 1).toISOString();
        to = new Date(selectedYear + 1, 0, 1).toISOString();
      }
    } else {
      // Default: use group's timeLength
      const seconds =
        typeof group.timeLength === 'number' ? group.timeLength : 86400;
      to = new Date().toISOString();
      from = new Date(Date.now() - seconds * 1000).toISOString();
    }

    // Interval heuristic based on time range
    const rangeMs = new Date(to).getTime() - new Date(from).getTime();
    const rangeDays = rangeMs / (1000 * 60 * 60 * 24);
    let interval: string | undefined;
    if (rangeDays > 14) interval = 'day';
    else if (rangeDays > 3) interval = 'hour';
    // else: raw records (no interval param)

    return {
      from,
      to,
      fields: Array.from(fields).join(','),
      interval,
    };
  }, [
    isClimatology,
    group.charts,
    group.timespanStart,
    group.timespanStop,
    group.enableDateRanges,
    group.rollingRanges,
    group.timeLength,
    selectedRange,
    selectedYear,
    selectedMonth,
  ]);

  // -------------------------------------------------------------------------
  // Data fetching (both hooks called unconditionally — Rules of Hooks)
  // Pass undefined to useArchive when in climatology mode to prevent a fetch.
  // The hook treats undefined params as "skip" (returns empty/null gracefully).
  // -------------------------------------------------------------------------

  const archiveResult = useArchive(isClimatology ? undefined : archiveParams);
  const climatologyResult = useClimatologyMonthly();

  // -------------------------------------------------------------------------
  // Data transformation (useMemo to avoid re-computation on unrelated renders)
  // -------------------------------------------------------------------------

  // Archive path: map each ArchiveRecord into a seriesId-keyed row
  const archiveData = useMemo(() => {
    if (!archiveResult.data) return [];
    return archiveResult.data.map((record) => {
      const row: Record<string, number | string | null> = {
        timestamp: record.timestamp,
      };
      group.charts.forEach((chart) => {
        chart.series.forEach((series) => {
          if (series.visible !== false && series.observationType) {
            row[series.seriesId] =
              (record[series.observationType] as number | null) ?? null;
          }
        });
      });
      return row;
    });
  }, [archiveResult.data, group.charts]);

  // Climatology path: map ClimatologyMonthly 12-element arrays into month rows
  const climatologyData = useMemo(() => {
    if (!climatologyResult.data) return [];
    const clim = climatologyResult.data;
    return clim.months.map((month, i) => {
      const row: Record<string, number | string | null> = { month };
      group.charts.forEach((chart) => {
        chart.series.forEach((series) => {
          if (series.visible !== false && series.observationType) {
            const fieldKey =
              CLIMATOLOGY_FIELD_MAP[
                `${series.observationType}:${series.averageType ?? 'avg'}`
              ];
            if (fieldKey && fieldKey in clim) {
              row[series.seriesId] =
                (clim as Record<string, (number | null)[]>)[fieldKey]?.[i] ??
                null;
            }
          }
        });
      });
      return row;
    });
  }, [climatologyResult.data, group.charts]);

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------

  const chartData = isClimatology ? climatologyData : archiveData;
  const xKey = isClimatology ? 'month' : 'timestamp';
  const xFormatter = isClimatology
    ? undefined
    : (v: string | number) => formatTimestamp(v, selectedRange);

  const isLoading = isClimatology
    ? climatologyResult.loading
    : archiveResult.loading;
  const fetchError = isClimatology
    ? climatologyResult.error
    : archiveResult.error;
  const onRetry = isClimatology
    ? climatologyResult.refetch
    : archiveResult.refetch;

  // -------------------------------------------------------------------------
  // Date controls mode detection
  // -------------------------------------------------------------------------

  const showRollingRanges =
    !isClimatology &&
    group.enableDateRanges &&
    group.rollingRanges.length > 0;

  const showYearMonthDropdowns =
    !isClimatology &&
    !showRollingRanges &&
    (group.availableYears.length > 0 || stationFirstYear != null);

  // Build the year list: prefer group.availableYears, fall back to computed range
  const yearList = useMemo(() => {
    if (group.availableYears.length > 0) return group.availableYears;
    return buildYearList(stationFirstYear);
  }, [group.availableYears, stationFirstYear]);

  // -------------------------------------------------------------------------
  // Visible data table columns (for table mode)
  // All visible series across all charts
  // -------------------------------------------------------------------------

  const allVisibleSeries = useMemo(
    () =>
      group.charts.flatMap((chart) =>
        chart.series.filter((s) => s.visible !== false),
      ),
    [group.charts],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* pageContent — plain text in Phase 2; Phase 4 T4.5 handles Markdown */}
      {group.pageContent != null && group.pageContent !== '' && (
        <p className="text-sm text-muted-foreground">{group.pageContent}</p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Date controls                                                        */}
      {/* ------------------------------------------------------------------ */}

      {/* Mode A: Rolling range buttons */}
      {showRollingRanges && (
        <div
          role="radiogroup"
          aria-label={t('ariaRangeGroupLabel')}
          className="flex flex-wrap gap-2"
        >
          {group.rollingRanges.map((range) => {
            const isSelected = range === selectedRange;
            return (
              <button
                key={range}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedRange(range)}
                className={[
                  'min-h-[44px] md:min-h-0 px-3 py-1.5 rounded-md border text-sm',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-muted/50',
                ].join(' ')}
              >
                {/* Use i18n key if it exists, fall back to the raw range string */}
                {t(`ranges.${range}`, { defaultValue: range })}
              </button>
            );
          })}
        </div>
      )}

      {/* Mode B: Year / month dropdowns */}
      {showYearMonthDropdowns && (
        <div className="flex flex-wrap gap-4">
          {/* Year selector */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`cdg-year-select-${group.groupId}`}
              className="text-xs font-medium text-muted-foreground"
            >
              {t('monthlyYearLabel')}
            </label>
            <select
              id={`cdg-year-select-${group.groupId}`}
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="min-h-[44px] md:min-h-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {yearList.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Optional month selector */}
          {group.enableMonthlyBreakdown && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`cdg-month-select-${group.groupId}`}
                className="text-xs font-medium text-muted-foreground"
              >
                {t('monthlyMonthLabel')}
              </label>
              <select
                id={`cdg-month-select-${group.groupId}`}
                value={selectedMonth ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedMonth(val === '' ? null : Number(val));
                }}
                className="min-h-[44px] md:min-h-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">{t('allMonths')}</option>
                {MONTH_LABELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Chart / table toggle button + chart container                        */}
      {/* ------------------------------------------------------------------ */}

      <div aria-busy={isLoading || undefined}>
        {/* Toggle button row */}
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => setShowTable((prev) => !prev)}
            aria-pressed={showTable}
            className="inline-flex items-center min-h-[44px] md:min-h-0 px-3 py-2 text-sm text-muted-foreground rounded-md border border-border hover:text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {showTable ? t('showChart') : t('showDataTable')}
          </button>
        </div>

        {/* Loading state */}
        {isLoading ? (
          <>
            <span className="sr-only" role="status">
              {t('loadingChart')}
            </span>
            <TileSkeleton className="h-[300px]" />
          </>
        ) : fetchError ? (
          <TileError message={t('unableToLoad')} onRetry={onRetry} retryLabel={t('retry')} />
        ) : showTable ? (
          /* ---------------------------------------------------------------- */
          /* Visible data table (not sr-only — this is the explicit table view) */
          /* ---------------------------------------------------------------- */
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <caption className="sr-only">
                {group.title ?? t('tableDataCaption')}
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="py-2 px-3 text-left font-medium text-muted-foreground"
                  >
                    {xKey === 'timestamp' ? t('tableColumnTime') : t('tableColumnMonth')}
                  </th>
                  {allVisibleSeries.map((s) => (
                    <th
                      key={s.seriesId}
                      scope="col"
                      className="py-2 px-3 text-right font-medium text-muted-foreground"
                    >
                      {s.name ?? s.seriesId}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, rowIndex) => {
                  const xVal = row[xKey];
                  const displayX =
                    xKey === 'timestamp' && xVal != null
                      ? formatTimestamp(xVal, selectedRange)
                      : xVal != null
                      ? String(xVal)
                      : '—';
                  return (
                    <tr
                      key={rowIndex}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-1.5 px-3 text-foreground">
                        {displayX}
                      </td>
                      {allVisibleSeries.map((s) => {
                        const val = row[s.seriesId];
                        return (
                          <td
                            key={s.seriesId}
                            className="py-1.5 px-3 text-right text-foreground"
                          >
                            {val != null ? String(val) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ---------------------------------------------------------------- */
          /* Chart view: one ConfigDrivenChart per chart in the group          */
          /* ---------------------------------------------------------------- */
          <div className="flex flex-col gap-6">
            {group.charts.map((chart) => (
              <ConfigDrivenChart
                key={chart.chartId}
                config={chart}
                data={chartData}
                xKey={xKey}
                xFormatter={xFormatter}
                globalColors={globalColors}
                globalType={globalType}
                height={300}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
