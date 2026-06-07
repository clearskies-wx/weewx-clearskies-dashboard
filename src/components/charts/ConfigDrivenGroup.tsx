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
// T4.1/T4.2: Range charts detected via rangeType series field.
//   - Dual-fetch: one useArchive call with agg=max (high), one with agg=min (low)
//   - WeatherRangeChart rendered in place of ConfigDrivenChart for range chart groups
//
// T4.5: pageContent rendered as Markdown via react-markdown + remark-gfm.

import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useArchive, useClimatologyMonthly } from '../../hooks/useWeatherData';
import { buildWindRoseMatrix, defaultBeaufortColors } from '../../utils/wind-rose-binning';
import { ConfigDrivenChart } from './ConfigDrivenChart';
import { WindRoseChart } from './WindRoseChart';
import { WeatherRangeChart } from './WeatherRangeChart';
import { ChartGauge } from './ChartGauge';
import { HaysChart } from './HaysChart';
import { lttbDownsample } from '../../utils/lttb';
import { exportChartAsCsv, exportChartAsPng, buildExportFilename } from '../../utils/chart-export';
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
  /**
   * When true, the rolling-range radiogroup and year/month dropdowns are not
   * rendered. The parent (ChartsPage TabNavCard) owns date controls instead.
   * Data fetching is unaffected — only the UI controls are hidden.
   */
  hideControls?: boolean;
  /** Controlled rolling-range value. Falls back to internal state when omitted. */
  selectedRange?: string;
  /** Controlled year value. Falls back to internal state when omitted. */
  selectedYear?: number;
  /** Controlled month value (1-indexed; null = all months). Falls back to internal state when omitted. */
  selectedMonth?: number | null;
  onRangeChange?: (range: string) => void;
  onYearChange?: (year: number) => void;
  onMonthChange?: (month: number | null) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum raw points before LTTB downsampling is applied to archive data. */
const MAX_RAW_POINTS = 1000;

/** Target point count after LTTB downsampling (per ADR-009: >1000 → 500). */
const LTTB_THRESHOLD = 500;

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
  hideControls = false,
  selectedRange: controlledRange,
  selectedYear: controlledYear,
  selectedMonth: controlledMonth,
  onRangeChange,
  onYearChange,
  onMonthChange,
}: ConfigDrivenGroupProps) {
  const { t, i18n } = useTranslation('charts');

  // -------------------------------------------------------------------------
  // State — internal fallbacks used when controlled props are not provided
  // -------------------------------------------------------------------------

  const [internalSelectedRange, setInternalSelectedRange] = useState<string>(
    group.rollingRanges[0] ?? '1d',
  );
  const [internalSelectedYear, setInternalSelectedYear] = useState<number>(new Date().getFullYear());
  const [internalSelectedMonth, setInternalSelectedMonth] = useState<number | null>(null);

  // Effective values: use controlled prop when provided, fall back to internal state
  const selectedRange = controlledRange ?? internalSelectedRange;
  const selectedYear = controlledYear ?? internalSelectedYear;
  const selectedMonth = controlledMonth !== undefined ? controlledMonth : internalSelectedMonth;

  // Setters: call prop callback when provided, always update internal state as fallback
  function setSelectedRange(range: string) {
    setInternalSelectedRange(range);
    onRangeChange?.(range);
  }
  function setSelectedYear(year: number) {
    setInternalSelectedYear(year);
    onYearChange?.(year);
  }
  function setSelectedMonth(month: number | null) {
    setInternalSelectedMonth(month);
    onMonthChange?.(month);
  }
  const [showTable, setShowTable] = useState(false);

  // Ref to the chart rendering container — used by PNG export to locate the SVG.
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Data mode detection
  // -------------------------------------------------------------------------

  // Climatology mode: any chart in the group uses monthly x-axis grouping
  const isClimatology = group.charts.some((c) => c.xAxisGroupby === 'month');

  // Wind rose mode: any chart in the group has a series with seriesId === 'windRose'
  const hasWindRose =
    !isClimatology &&
    group.charts.some((chart) =>
      chart.series.some((s) => s.seriesId === 'windRose'),
    );

  // Range chart mode (T4.1/T4.2): any chart has a series with rangeType set.
  // Range charts require two separate archive fetches (agg=max and agg=min).
  // Hays charts (polar arearange for pollen/allergen) also use the same dual-fetch,
  // so they are included here to share the rangeHigh/rangeLow fetch infrastructure.
  const hasRangeChart =
    !isClimatology &&
    group.charts.some((chart) =>
      chart.series.some((s) => s.rangeType != null || s.seriesId === 'haysChart'),
    );

  // The observation field to fetch for range/hays charts (e.g. 'outTemp', pollen field)
  const rangeField = useMemo(() => {
    if (!hasRangeChart) return null;
    for (const chart of group.charts) {
      for (const s of chart.series) {
        // Prefer an explicit rangeType series; fall back to haysChart series.
        if ((s.rangeType != null || s.seriesId === 'haysChart') && s.observationType) {
          return s.observationType;
        }
      }
    }
    return null;
  }, [hasRangeChart, group.charts]);

  // -------------------------------------------------------------------------
  // Archive fetch params (useMemo — prevents infinite re-render loops)
  // -------------------------------------------------------------------------

  const archiveParams = useMemo(() => {
    if (isClimatology) return undefined;

    // Collect unique observation types across all visible series.
    // For wind rose groups, always include windSpeed and windDir so the
    // BFF can inject the beaufort field (ADR-042) and the binning utility
    // has the direction data it needs.
    const fields = new Set<string>();
    group.charts.forEach((chart) => {
      chart.series.forEach((s) => {
        if (s.observationType && s.visible !== false) {
          fields.add(s.observationType);
        }
      });
    });
    if (hasWindRose) {
      fields.add('windSpeed');
      fields.add('windDir');
    }

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
      if (group.forceFullYear || selectedMonth == null) {
        from = new Date(selectedYear, 0, 1).toISOString();
        to = new Date(selectedYear + 1, 0, 1).toISOString();
      } else {
        from = new Date(selectedYear, selectedMonth - 1, 1).toISOString();
        const nextMonth = new Date(selectedYear, selectedMonth, 1);
        to = nextMonth.toISOString();
      }
    } else {
      // Default: use group's timeLength
      const seconds =
        typeof group.timeLength === 'number' ? group.timeLength : 86400;
      to = new Date().toISOString();
      from = new Date(Date.now() - seconds * 1000).toISOString();
    }

    // Anchor to month start if configured
    if (group.startAtBeginningOfMonth) {
      const d = new Date(from);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      from = d.toISOString();
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
    hasWindRose,
    group.charts,
    group.timespanStart,
    group.timespanStop,
    group.enableDateRanges,
    group.rollingRanges,
    group.timeLength,
    group.forceFullYear,
    group.startAtBeginningOfMonth,
    selectedRange,
    selectedYear,
    selectedMonth,
  ]);

  // Build params for range chart dual-fetch (agg=max and agg=min).
  // Range charts always use interval=day so each point represents one day.
  const rangeArchiveParamsMax = useMemo(() => {
    if (!hasRangeChart || !rangeField || !archiveParams) return undefined;
    return {
      from: archiveParams.from,
      to: archiveParams.to,
      fields: rangeField,
      interval: 'day',
      agg: 'max',
    };
  }, [hasRangeChart, rangeField, archiveParams]);

  const rangeArchiveParamsMin = useMemo(() => {
    if (!hasRangeChart || !rangeField || !archiveParams) return undefined;
    return {
      from: archiveParams.from,
      to: archiveParams.to,
      fields: rangeField,
      interval: 'day',
      agg: 'min',
    };
  }, [hasRangeChart, rangeField, archiveParams]);

  // -------------------------------------------------------------------------
  // Data fetching (all hooks called unconditionally — Rules of Hooks)
  // Pass undefined to useArchive when in climatology mode to prevent a fetch.
  // The hook treats undefined params as "skip" (returns empty/null gracefully).
  // Wind rose data is derived from the same archive fetch (T3.2: client-side binning).
  // Range chart data uses two separate fetches (agg=max and agg=min).
  // -------------------------------------------------------------------------

  const archiveResult = useArchive(
    isClimatology || hasRangeChart ? undefined : archiveParams ?? undefined,
    { skip: isClimatology || hasRangeChart },
  );
  const climatologyResult = useClimatologyMonthly();

  // Range chart dual-fetch — both hooks called unconditionally; skip when not a range chart.
  const rangeHighResult = useArchive(
    rangeArchiveParamsMax,
    { skip: !hasRangeChart || rangeArchiveParamsMax === undefined },
  );
  const rangeLowResult = useArchive(
    rangeArchiveParamsMin,
    { skip: !hasRangeChart || rangeArchiveParamsMin === undefined },
  );

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
          if (series.visible !== false) {
            const obsType = series.observationType ?? series.seriesId;
            row[series.seriesId] =
              (record[obsType] as number | null) ?? null;
          }
        });
      });
      return row;
    });
  }, [archiveResult.data, group.charts]);

  // Gap detection: insert null rows at data gaps > gapsize to break Recharts lines.
  const gapProcessedArchiveData = useMemo(() => {
    if (!group.gapsize || group.gapsize <= 0 || archiveData.length < 2) return archiveData;
    const gapMs = group.gapsize * 1000;
    const result: typeof archiveData = [archiveData[0]];
    for (let i = 1; i < archiveData.length; i++) {
      const prevTs = new Date(archiveData[i - 1].timestamp as string).getTime();
      const currTs = new Date(archiveData[i].timestamp as string).getTime();
      if (currTs - prevTs > gapMs) {
        const nullRow: Record<string, number | string | null> = { timestamp: archiveData[i].timestamp };
        for (const key of Object.keys(archiveData[i])) {
          if (key !== 'timestamp') nullRow[key] = null;
        }
        result.push(nullRow);
      }
      result.push(archiveData[i]);
    }
    return result;
  }, [archiveData, group.gapsize]);

  // Wind rose data: derived client-side from the same archive fetch (T3.2).
  // Uses raw archiveResult.data (ArchiveRecord[]) so the BFF-injected `beaufort`
  // ConvertedValue is accessible without the seriesId remapping done in archiveData.
  const windRoseData = useMemo(() => {
    if (!hasWindRose || !archiveResult.data || archiveResult.data.length === 0) return null;
    return buildWindRoseMatrix(archiveResult.data as unknown as Record<string, unknown>[]);
  }, [hasWindRose, archiveResult.data]);

  // LTTB downsampling (archive only — climatology has exactly 12 points, never needs it)
  // Applied only for chart rendering; the raw archiveData is still used for the table view.
  // Uses gap-processed data so line breaks at data gaps are preserved after downsampling.
  const downsampledArchiveData = useMemo(() => {
    if (isClimatology || gapProcessedArchiveData.length <= MAX_RAW_POINTS) return gapProcessedArchiveData;
    // Use the first visible series' seriesId as the y-key for LTTB triangle selection.
    // LTTB selects points by maximising visual area; it needs a representative y-axis field.
    // If no visible series exists, fall back to returning the full data unsampled.
    const firstVisibleSeries = group.charts[0]?.series?.find(
      (s) => s.visible !== false,
    );
    if (!firstVisibleSeries) return gapProcessedArchiveData;
    return lttbDownsample(gapProcessedArchiveData, LTTB_THRESHOLD, 'timestamp', firstVisibleSeries.seriesId);
  }, [isClimatology, gapProcessedArchiveData, group.charts]);

  // Climatology path: map ClimatologyMonthly 12-element arrays into month rows
  const climatologyData = useMemo(() => {
    if (!climatologyResult.data) return [];
    const clim = climatologyResult.data;
    return clim.months.map((month, i) => {
      const row: Record<string, number | string | null> = { month };
      group.charts.forEach((chart) => {
        chart.series.forEach((series) => {
          const obsType = series.observationType ?? series.seriesId;
          if (series.visible !== false && obsType) {
            const fieldKey =
              CLIMATOLOGY_FIELD_MAP[
                `${obsType}:${series.averageType ?? 'avg'}`
              ];
            if (fieldKey && fieldKey in clim) {
              row[series.seriesId] =
                (clim as unknown as Record<string, (number | null)[]>)[fieldKey]?.[i] ??
                null;
            }
          }
        });
      });
      return row;
    });
  }, [climatologyResult.data, group.charts]);

  // Range chart data transformation (T4.1/T4.2):
  // Map archive records into { dateTime, value } pairs for WeatherRangeChart.
  // dateTime is epoch seconds (from ISO timestamp); value is the field value.
  const rangeHighPoints = useMemo(() => {
    if (!hasRangeChart || !rangeField || !rangeHighResult.data) return [];
    return rangeHighResult.data
      .filter((r) => r[rangeField] !== null && r[rangeField] !== undefined)
      .map((r) => ({
        dateTime: Math.floor(new Date(r.timestamp).getTime() / 1000),
        value: r[rangeField] as number | null,
      }));
  }, [hasRangeChart, rangeField, rangeHighResult.data]);

  const rangeLowPoints = useMemo(() => {
    if (!hasRangeChart || !rangeField || !rangeLowResult.data) return [];
    return rangeLowResult.data
      .filter((r) => r[rangeField] !== null && r[rangeField] !== undefined)
      .map((r) => ({
        dateTime: Math.floor(new Date(r.timestamp).getTime() / 1000),
        value: r[rangeField] as number | null,
      }));
  }, [hasRangeChart, rangeField, rangeLowResult.data]);

  // Range chart table data: merge high/low points into rows for table/CSV.
  const rangeTableData = useMemo(() => {
    if (!hasRangeChart || rangeHighPoints.length === 0) return [];
    return rangeHighPoints.map((hp, i) => {
      const lp = rangeLowPoints[i];
      return {
        timestamp: new Date(hp.dateTime * 1000).toISOString(),
        high: hp.value,
        low: lp?.value ?? null,
      };
    });
  }, [hasRangeChart, rangeHighPoints, rangeLowPoints]);

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------

  // Full dataset — used by the data table view so users see every raw row.
  const chartData = hasRangeChart
    ? rangeTableData
    : isClimatology ? climatologyData : archiveData;
  // Downsampled dataset — used by ConfigDrivenChart for efficient rendering.
  // For climatology (12 points) and small archive sets, this equals chartData.
  const chartRenderData = isClimatology ? climatologyData : downsampledArchiveData;
  const xKey = isClimatology ? 'month' : 'timestamp';
  const xFormatter = isClimatology
    ? undefined
    : (v: string | number) => formatTimestamp(v, selectedRange);

  // Loading and error state: for range charts, both fetches must complete.
  const isLoading = isClimatology
    ? climatologyResult.loading
    : hasRangeChart
    ? rangeHighResult.loading || rangeLowResult.loading
    : archiveResult.loading;
  const fetchError = isClimatology
    ? climatologyResult.error
    : hasRangeChart
    ? rangeHighResult.error ?? rangeLowResult.error
    : archiveResult.error;
  const onRetry = isClimatology
    ? climatologyResult.refetch
    : hasRangeChart
    ? () => { rangeHighResult.refetch(); rangeLowResult.refetch(); }
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
  // Export handlers
  // -------------------------------------------------------------------------

  function handleCsvExport(): void {
    const title = group.title ?? 'Chart';
    if (hasRangeChart) {
      const fieldLabel = rangeField ?? 'Value';
      const columns = [
        { key: 'timestamp', label: t('tableColumnTime') },
        { key: 'high', label: `${fieldLabel} High` },
        { key: 'low', label: `${fieldLabel} Low` },
      ];
      exportChartAsCsv(
        rangeTableData as Record<string, unknown>[],
        columns,
        buildExportFilename(title, 'csv'),
      );
      return;
    }
    const xLabel =
      xKey === 'timestamp' ? t('tableColumnTime') : t('tableColumnMonth');
    const columns: { key: string; label: string }[] = [
      { key: xKey, label: xLabel },
      ...allVisibleSeries.map((s) => ({ key: s.seriesId, label: s.name ?? s.seriesId })),
    ];
    exportChartAsCsv(
      chartData as Record<string, unknown>[],
      columns,
      buildExportFilename(title, 'csv'),
    );
  }

  function handlePngExport(): void {
    const container = chartContainerRef.current;
    if (!container) return;
    const title = group.title ?? 'Chart';
    // exportChartAsPng is async but we don't need to await it here —
    // errors are swallowed silently (download either starts or it doesn't).
    void exportChartAsPng(container, buildExportFilename(title, 'png'));
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* pageContent — Markdown rendered via react-markdown (T4.5) */}
      {group.pageContent && (
        <div className="prose prose-sm dark:prose-invert max-w-none mb-4 [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{group.pageContent}</ReactMarkdown>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Date controls                                                        */}
      {/* ------------------------------------------------------------------ */}

      {/* Mode A: Rolling range buttons — hidden when parent owns date controls */}
      {!hideControls && showRollingRanges && (
        <div
          role="radiogroup"
          aria-label={t('ariaRangeGroupLabel')}
          className="flex flex-wrap gap-2"
          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
            const ranges = group.rollingRanges;
            const currentIdx = ranges.indexOf(selectedRange);
            let nextIdx = currentIdx;

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              nextIdx = (currentIdx + 1) % ranges.length;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              nextIdx = (currentIdx - 1 + ranges.length) % ranges.length;
            } else {
              return;
            }

            setSelectedRange(ranges[nextIdx]);
            const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
            buttons[nextIdx]?.focus();
          }}
        >
          {group.rollingRanges.map((range) => {
            const isSelected = range === selectedRange;
            return (
              <button
                key={range}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
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

      {/* Mode B: Year / month dropdowns — hidden when parent owns date controls */}
      {!hideControls && showYearMonthDropdowns && (
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
                {Array.from({ length: 12 }, (_, i) => {
                  const label = new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2000, i));
                  return (
                    <option key={i + 1} value={i + 1}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Chart / table toggle button + chart container                        */}
      {/* ------------------------------------------------------------------ */}

      <div aria-busy={isLoading || undefined}>
        {/* Toggle + export button row */}
        <div className="flex justify-end items-center gap-2 mb-2">
          {/* PNG export — icon-only button; aria-label satisfies §5.4 */}
          {group.exporting !== false && (
          <button
            type="button"
            onClick={handlePngExport}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t('exportPng')}
            title={t('exportPng')}
          >
            {/* Download-arrow icon — decorative; aria-hidden per §5.5 */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          )}

          {/* CSV export — icon-only button; aria-label satisfies §5.4 */}
          {group.exporting !== false && (
          <button
            type="button"
            onClick={handleCsvExport}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t('exportCsv')}
            title={t('exportCsv')}
          >
            {/* CSV / file-lines icon — decorative; aria-hidden per §5.5 */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </button>
          )}

          {/* Chart / table toggle */}
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
              {hasRangeChart ? (
                <>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 px-3 text-left font-medium text-muted-foreground">
                        {t('tableColumnTime')}
                      </th>
                      <th scope="col" className="py-2 px-3 text-right font-medium text-muted-foreground">
                        {(rangeField ?? 'Value') + ' High'}
                      </th>
                      <th scope="col" className="py-2 px-3 text-right font-medium text-muted-foreground">
                        {(rangeField ?? 'Value') + ' Low'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rangeTableData.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-border last:border-0">
                        <td className="py-1.5 px-3 text-foreground">
                          {formatTimestamp(row.timestamp, selectedRange)}
                        </td>
                        <td className="py-1.5 px-3 text-right text-foreground">
                          {row.high != null ? String(row.high) : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-right text-foreground">
                          {row.low != null ? String(row.low) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
              <>
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
                {(chartData as Record<string, string | number | null>[]).map((row, rowIndex) => {
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
              </>
              )}
            </table>
          </div>
        ) : (
          /* ---------------------------------------------------------------- */
          /* Chart view: one chart per chart in the group.                    */
          /* Wind rose charts render as WindRoseChart.                        */
          /* Hays charts render as HaysChart (polar arearange).              */
          /* Range charts render as WeatherRangeChart.                        */
          /* All others render as ConfigDrivenChart.                          */
          /* ref is used by PNG export to locate the chart SVG.              */
          /* ---------------------------------------------------------------- */
          <div ref={chartContainerRef} className="flex flex-col gap-6">
            {group.charts.map((chart) => {
              const isWindRoseChart = chart.series.some(
                (s) => s.seriesId === 'windRose',
              );
              const isHaysChartLocal = chart.series.some(
                (s) => s.seriesId === 'haysChart',
              );
              const isRangeChart = chart.series.some(
                (s) => s.rangeType != null,
              );

              if (isWindRoseChart) {
                if (!windRoseData) {
                  // Wind rose data still loading or unavailable — show skeleton
                  return (
                    <TileSkeleton key={chart.chartId} className="h-[300px]" />
                  );
                }
                const windRoseSeries = chart.series.find(
                  (s) => s.seriesId === 'windRose',
                );
                // Merge operator-configured colors over the default palette.
                const beaufortColors = Object.keys(windRoseSeries?.beaufortColors ?? {}).length > 0
                  ? windRoseSeries!.beaufortColors
                  : defaultBeaufortColors;
                return (
                  <WindRoseChart
                    key={chart.chartId}
                    data={windRoseData}
                    beaufortColors={beaufortColors}
                    height={300}
                    reducedMotion={reducedMotion}
                  />
                );
              }

              if (isHaysChartLocal) {
                // Show skeleton until both high and low data are available
                if (rangeHighPoints.length === 0 || rangeLowPoints.length === 0) {
                  return (
                    <TileSkeleton key={chart.chartId} className="h-[300px]" />
                  );
                }
                // Extract field, unit, and softMax from the haysChart series
                const haysSeries = chart.series.find((s) => s.seriesId === 'haysChart');
                const haysField = haysSeries?.observationType ?? rangeField ?? 'value';
                const haysUnit = haysSeries?.yAxisLabel ?? '';
                // yAxisSoftMax is number | null | undefined; convert null → undefined for the prop
                const haysSoftMax = haysSeries?.yAxisSoftMax ?? undefined;
                return (
                  <HaysChart
                    key={chart.chartId}
                    highData={rangeHighPoints}
                    lowData={rangeLowPoints}
                    field={haysField}
                    unit={haysUnit}
                    softMax={haysSoftMax}
                    height={300}
                    reducedMotion={reducedMotion}
                  />
                );
              }

              if (isRangeChart) {
                // Show skeleton until both high and low data are available
                if (rangeHighPoints.length === 0 || rangeLowPoints.length === 0) {
                  return (
                    <TileSkeleton key={chart.chartId} className="h-[300px]" />
                  );
                }
                // Extract field and unit from the range series
                const rangeSeries = chart.series.find((s) => s.rangeType != null);
                const fieldName = rangeSeries?.observationType ?? rangeField ?? 'value';
                // Unit from yAxisLabel or empty string
                const unitLabel = rangeSeries?.yAxisLabel ?? '';
                return (
                  <WeatherRangeChart
                    key={chart.chartId}
                    highData={rangeHighPoints}
                    lowData={rangeLowPoints}
                    field={fieldName}
                    unit={unitLabel}
                    height={300}
                    reducedMotion={reducedMotion}
                  />
                );
              }

              // Gauge chart detection (Belchertown type=gauge or type=solidgauge).
              // Gauge charts display the LATEST value of the first series —
              // they don't render a time-series line.
              const isGaugeChart =
                chart.type === 'gauge' ||
                chart.type === 'solidgauge' ||
                group.type === 'gauge' ||
                group.type === 'solidgauge';

              if (isGaugeChart) {
                const gaugeSeries = chart.series[0];
                const gaugeObsType = gaugeSeries?.observationType ?? null;

                // Extract latest value from archive data for this observation type.
                // archiveResult.data is ordered ascending by timestamp; last record = latest.
                const latestRecord =
                  archiveResult.data && archiveResult.data.length > 0
                    ? archiveResult.data[archiveResult.data.length - 1]
                    : null;
                const rawValue =
                  latestRecord && gaugeObsType
                    ? (latestRecord[gaugeObsType] as number | null | undefined)
                    : null;
                const gaugeValue = typeof rawValue === 'number' ? rawValue : 0;

                // Axis bounds: prefer chart-level yAxisMin, then series-level.
                const gaugeMin = chart.yAxisMin ?? gaugeSeries?.yAxisMin ?? 0;
                const gaugeMax = gaugeSeries?.yAxisMax ?? 100;

                // Unit from series yAxisLabel
                const gaugeUnit = gaugeSeries?.yAxisLabel ?? '';

                // Color zones from the first series (Belchertown stores them per-series)
                const gaugeZones = gaugeSeries?.colorZones ?? null;
                const gaugeColorsEnabled = gaugeSeries?.colorsEnabled ?? false;

                return (
                  <ChartGauge
                    key={chart.chartId}
                    value={gaugeValue}
                    min={gaugeMin}
                    max={gaugeMax}
                    unit={gaugeUnit}
                    title={chart.title ?? gaugeSeries?.name ?? ''}
                    colorZones={gaugeZones}
                    colorsEnabled={gaugeColorsEnabled}
                    reducedMotion={reducedMotion}
                  />
                );
              }

              return (
                <ConfigDrivenChart
                  key={chart.chartId}
                  config={chart}
                  data={chartRenderData}
                  xKey={xKey}
                  xFormatter={xFormatter}
                  globalColors={globalColors}
                  globalType={globalType}
                  height={300}
                  reducedMotion={reducedMotion}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
