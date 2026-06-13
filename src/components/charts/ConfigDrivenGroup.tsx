// ConfigDrivenGroup.tsx — T2.3
// Orchestrates one ChartGroupConfig: date controls, data fetching, and
// rendering of one or more ConfigDrivenChart instances.
//
// Architecture:
//   ConfigDrivenGroup receives ChartGroupConfig
//     → Renders date controls (rolling ranges | year/month dropdowns | none)
//     → Fetches via useArchive (standard charts) or useGroupedArchive (xAxisGroupby charts)
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
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { useArchive, useGroupedArchive, useCustomQueries } from '../../hooks/useWeatherData';
import { buildWindRoseMatrix, defaultBeaufortColors } from '../../utils/wind-rose-binning';
import { ConfigDrivenChart } from './ConfigDrivenChart';
import { WindRoseChart } from './WindRoseChart';
import { WeatherRangeChart } from './WeatherRangeChart';
import { ChartGauge } from './ChartGauge';
import { HaysChart } from './HaysChart';
import { lttbDownsample } from '../../utils/lttb';
import { exportChartAsCsv, exportChartAsPng, buildExportFilename } from '../../utils/chart-export';
import { Card, CardHeader, CardTitle, CardAction } from '../ui/card';
import { ChartFullscreenButton, ChartFullscreenOverlay } from '../ui/chart-fullscreen';
import type { ChartGroupConfig, ChartConfig, GroupedArchiveData } from '../../api/types';

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
 * Transform a GroupedArchiveData response into chart-row format for one chart.
 *
 * Each series spec key is "<field>:<aggregateType>[:<averageType>]".
 * Rows are keyed by series.name (the seriesId used by ConfigDrivenChart).
 */
function buildGroupedChartData(
  chart: ChartConfig,
  groupedData: GroupedArchiveData | null,
  customQueryData?: Record<string, Array<{ x: number | string; y: number | null }>> | null,
): { data: Record<string, number | string | null>[]; xKey: string } {
  if (!groupedData) return { data: [], xKey: 'label' };

  return {
    data: groupedData.labels.map((label, i) => {
      const row: Record<string, number | string | null> = { label };
      for (const series of chart.series) {
        if (series.useCustomSql && customQueryData?.[series.seriesId]) {
          const points = customQueryData[series.seriesId];
          const pt = points.find((p) => String(p.x) === label || p.x === i + 1);
          row[series.seriesId] = pt?.y ?? null;
          continue;
        }
        const obsType = series.observationType ?? series.seriesId;
        const rawAgg = series.aggregateType ?? 'avg';
        const aggType = rawAgg === 'sumcumulative' ? 'sum' : rawAgg;
        const avgType = series.averageType;
        const key = avgType ? `${obsType}:${aggType}:${avgType}` : `${obsType}:${aggType}`;
        row[series.seriesId] = groupedData.series[key]?.[i] ?? null;
      }
      return row;
    }),
    xKey: 'label',
  };
}

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
    // Sub-3-day: show hour ("1 AM", "2 PM")
    return d.toLocaleTimeString([], { hour: 'numeric', hour12: true });
  }
  if (rangeDays <= 90) {
    // 3d–90d: show day + month ("6 Jun", "15 May")
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  // >90d: show month + year ("Mar '26")
  return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
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
  const [internalSelectedYear, setInternalSelectedYear] = useState<number | null>(
    group.availableYears.length > 0 ? group.availableYears[0] : null,
  );
  const [internalSelectedMonth, setInternalSelectedMonth] = useState<number | null>(new Date().getMonth() + 1);

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
  const [fullscreen, setFullscreen] = useState(false);

  // Ref to the chart rendering container — used by PNG export to locate the SVG.
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Data mode detection
  // -------------------------------------------------------------------------

  // Each CHART independently decides its data source.
  // Charts with xAxisGroupby use the grouped archive endpoint.
  // All others use the standard archive endpoint.

  // Wind rose mode: any chart in the group has a windRose series
  const hasWindRose =
    group.charts.some((chart) =>
      chart.series.some((s) => s.seriesId === 'windRose'),
    );

  // Range chart mode: any chart has a series with rangeType set
  const hasRangeChart =
    group.charts.some((chart) =>
      chart.series.some((s) => s.rangeType != null || s.seriesId === 'haysChart'),
    );

  // The observation field to fetch for range/hays charts (e.g. 'outTemp', pollen field)
  const rangeField = useMemo(() => {
    if (!hasRangeChart) return null;
    for (const chart of group.charts) {
      for (const s of chart.series) {
        // Prefer an explicit rangeType series; fall back to haysChart series.
        if ((s.rangeType != null || s.seriesId === 'haysChart') && (s.observationType ?? s.rangeType)) {
          return s.observationType ?? s.rangeType ?? s.seriesId;
        }
      }
    }
    return null;
  }, [hasRangeChart, group.charts]);

  // Custom SQL series — collect ALL series IDs that use custom SQL.
  const customSqlSeriesIds = useMemo(() => {
    const ids: string[] = [];
    for (const chart of group.charts) {
      for (const s of chart.series) {
        if (s.useCustomSql && s.seriesId) ids.push(s.seriesId);
      }
    }
    return ids;
  }, [group.charts]);

  const customQueryResults = useCustomQueries(customSqlSeriesIds);

  // -------------------------------------------------------------------------
  // Archive fetch params (useMemo — prevents infinite re-render loops)
  // -------------------------------------------------------------------------

  const archiveParams = useMemo(() => {
    // Collect unique observation types across all visible series.
    // Skip series that use xAxisGroupby — those use the grouped archive endpoint instead.
    // For wind rose groups, always include windSpeed and windDir so the
    // BFF can inject the beaufort field (ADR-042) and the binning utility
    // has the direction data it needs.
    const SKIP_SERIES = new Set(['windRose', 'weatherRange', 'haysChart']);
    const FIELD_ALIASES: Record<string, string> = { rainTotal: 'rain' };
    const fields = new Set<string>();
    group.charts.forEach((chart) => {
      // Charts using xAxisGroupby fetch from the grouped archive endpoint — skip here.
      if (chart.xAxisGroupby) return;
      chart.series.forEach((s) => {
        if (s.useCustomSql) return;
        if (SKIP_SERIES.has(s.seriesId)) return;
        if (s.rangeType != null) return;
        if (s.visible !== false) {
          const raw = s.observationType ?? s.seriesId;
          fields.add(FIELD_ALIASES[raw] ?? raw);
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
      // Default: use the widest timeLength across group and all charts.
      // Chart-level timeLength overrides group-level per Belchertown semantics.
      let maxSeconds = typeof group.timeLength === 'number' ? group.timeLength : 86400;
      for (const chart of group.charts) {
        if (typeof chart.timeLength === 'number' && chart.timeLength > maxSeconds) {
          maxSeconds = chart.timeLength;
        }
      }
      to = new Date().toISOString();
      from = new Date(Date.now() - maxSeconds * 1000).toISOString();
    }

    // Anchor to month start if configured
    if (group.startAtBeginningOfMonth) {
      const d = new Date(from);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      from = d.toISOString();
    }

    // Proportional aggregate interval — matches Belchertown's scaling.
    // ratio = max(1, range_seconds / base_time_seconds)
    // aggregate_interval = base_interval * ratio
    // time_length can be a number (seconds) or a weewx string (day/week/month/year/all).
    const rangeSec = (new Date(to).getTime() - new Date(from).getTime()) / 1000;
    // Use group aggregate_interval, or fall back to the most common chart-level value.
    // graphs.conf allows per-chart aggregate_interval; when the group doesn't set one,
    // pick the smallest chart-level value so all charts get sufficient granularity.
    let baseAggInterval = group.aggregateInterval ?? 0;
    if (!baseAggInterval) {
      const chartIntervals = group.charts
        .map((c) => c.aggregateInterval)
        .filter((v): v is number => v != null && v > 0);
      baseAggInterval = chartIntervals.length > 0 ? Math.min(...chartIntervals) : 300;
    }
    const TIME_LENGTH_MAP: Record<string, number> = {
      day: 86400, week: 604800, month: 2592000, year: 31536000,
    };
    const baseTimeSec = typeof group.timeLength === 'number'
      ? group.timeLength
      : TIME_LENGTH_MAP[String(group.timeLength).toLowerCase()] ?? 86400;
    const ratio = Math.max(1, rangeSec / baseTimeSec);
    const aggInterval = Math.round(baseAggInterval * ratio);

    // Only use aggregate_interval when it exceeds the raw archive interval
    const useAggregation = aggInterval > 300;

    // Build per-field aggregation map from operator's charts.conf aggregate_type.
    // Default is avg (Belchertown rolling-range default, line 3543).
    // Operator overrides: e.g., rainRate→max, rainTotal→sum (graphs.conf lines 184/190).
    const aggPairs: string[] = [];
    if (useAggregation) {
      group.charts.forEach((chart) => {
        chart.series.forEach((s) => {
          if (s.aggregateType && s.aggregateType !== 'avg' && s.aggregateType.toLowerCase() !== 'none') {
            const obsType = s.observationType ?? s.seriesId;
            const aliasedField = FIELD_ALIASES[obsType] ?? obsType;
            aggPairs.push(`${aliasedField}:${s.aggregateType}`);
          }
        });
      });
    }

    // Skip archive fetch when no non-grouped fields were collected (e.g. all charts
    // use xAxisGroupby and there are no wind rose series).
    if (fields.size === 0) return undefined;

    return {
      from,
      to,
      fields: Array.from(fields).join(','),
      aggregate_interval: useAggregation ? String(aggInterval) : undefined,
      agg_map: aggPairs.length > 0 ? aggPairs.join(',') : undefined,
    };
  }, [
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
  // Grouped archive params — one fetch per group covering all xAxisGroupby charts.
  // Rules of Hooks: this useMemo is always called; it returns null when no
  // xAxisGroupby charts exist, which causes useGroupedArchive to skip.
  // -------------------------------------------------------------------------

  // Compute epoch timestamps for the selected year (used as from/to for grouped fetch).
  // When no year is selected (all-time), both are undefined.
  const selectedYearFrom: number | undefined = selectedYear
    ? Math.floor(new Date(selectedYear, 0, 1).getTime() / 1000)
    : undefined;
  const selectedYearTo: number | undefined = selectedYear
    ? Math.floor(new Date(selectedYear + 1, 0, 1).getTime() / 1000)
    : undefined;

  const groupedParams = useMemo(() => {
    const xAxisCharts = group.charts.filter((c) => c.xAxisGroupby);
    if (xAxisCharts.length === 0) return null;

    const fieldSpecs: string[] = [];
    for (const chart of xAxisCharts) {
      for (const series of chart.series) {
        if (series.useCustomSql) continue;
        const obsType = series.observationType ?? series.seriesId;
        const rawAgg = series.aggregateType ?? 'avg';
        const aggType = rawAgg === 'sumcumulative' ? 'sum' : rawAgg;
        const avgType = series.averageType;
        const spec = avgType ? `${obsType}:${aggType}:${avgType}` : `${obsType}:${aggType}`;
        fieldSpecs.push(spec);
      }
    }

    // All xAxisGroupby charts in a group share the same group_by value.
    const groupBy = xAxisCharts[0].xAxisGroupby!;

    return {
      group_by: groupBy,
      fields: [...new Set(fieldSpecs)].join(','),
      from: selectedYearFrom,
      to: selectedYearTo,
      force_full_period: true,
    };
  }, [group.charts, selectedYearFrom, selectedYearTo]);

  const groupedArchive = useGroupedArchive(groupedParams);

  // -------------------------------------------------------------------------
  // Data fetching (all hooks called unconditionally — Rules of Hooks)
  // Wind rose data is derived from the same archive fetch (T3.2: client-side binning).
  // Range chart data uses two separate fetches (agg=max and agg=min).
  // -------------------------------------------------------------------------

  const archiveResult = useArchive(
    archiveParams ?? undefined,
    { skip: archiveParams === undefined },
  );

  // Separate raw fetch for wind rose — needs unaggregated data to preserve
  // the wind speed distribution for correct Beaufort classification.
  const windRoseParams = useMemo(() => {
    if (!hasWindRose || !archiveParams) return undefined;
    // Use the same proportional aggregate_interval as the archive charts.
    // This keeps data volume proportional to the time range.
    return {
      from: archiveParams.from,
      to: archiveParams.to,
      fields: 'windSpeed,windDir',
      limit: '50000',
      aggregate_interval: archiveParams.aggregate_interval,
    };
  }, [hasWindRose, archiveParams]);
  const windRoseArchiveResult = useArchive(windRoseParams, { skip: !hasWindRose });

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

  // Archive path: map each ArchiveRecord into a seriesId-keyed row,
  // then merge any custom SQL series data by matching timestamp.
  const archiveData = useMemo(() => {
    if (!archiveResult.data) return [];
    const rows = archiveResult.data.map((record) => {
      const row: Record<string, number | string | null> = {
        timestamp: record.timestamp,
      };
      group.charts.forEach((chart) => {
        chart.series.forEach((series) => {
          if (series.useCustomSql) return;
          if (series.visible !== false) {
            const obsType = series.observationType ?? series.seriesId;
            row[series.seriesId] =
              (record[obsType] as number | null) ?? null;
          }
        });
      });
      return row;
    });

    // Merge custom SQL data into archive rows by matching x value to timestamp.
    if (customQueryResults.data) {
      for (const [seriesId, points] of Object.entries(customQueryResults.data)) {
        for (const pt of points) {
          const matchIdx = rows.findIndex((r) => r.timestamp === pt.x || r.timestamp === String(pt.x));
          if (matchIdx >= 0) {
            rows[matchIdx][seriesId] = pt.y;
          }
        }
      }
    }

    return rows;
  }, [archiveResult.data, group.charts, customQueryResults.data]);

  // Gap detection: insert null rows at data gaps > gapsize to break Recharts lines.
  // Only applies to raw (non-aggregated) data — hourly/daily records have natural
  // gaps that exceed the 5-minute gapsize and would break all line rendering.
  const isAggregated = !!archiveParams?.aggregate_interval;
  const gapProcessedArchiveData = useMemo(() => {
    if (isAggregated) return archiveData;
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
  }, [archiveData, group.gapsize, isAggregated]);

  // Wind rose data: uses separate RAW archive fetch (not aggregated) to preserve
  // the wind speed distribution for correct Beaufort classification.
  const windRoseData = useMemo(() => {
    if (!hasWindRose || !windRoseArchiveResult.data || windRoseArchiveResult.data.length === 0) return null;
    return buildWindRoseMatrix(windRoseArchiveResult.data as unknown as Record<string, unknown>[]);
  }, [hasWindRose, windRoseArchiveResult.data]);

  // LTTB downsampling — archive data only.
  // Applied only for chart rendering; the raw archiveData is still used for the table view.
  // Uses gap-processed data so line breaks at data gaps are preserved after downsampling.
  const downsampledArchiveData = useMemo(() => {
    if (gapProcessedArchiveData.length <= MAX_RAW_POINTS) return gapProcessedArchiveData;
    // Use the first visible non-xAxisGroupby series as the y-key for LTTB triangle selection.
    // LTTB selects points by maximising visual area; it needs a representative y-axis field.
    // If no visible series exists, fall back to returning the full data unsampled.
    const firstVisibleSeries = group.charts
      .filter((c) => !c.xAxisGroupby)
      .flatMap((c) => c.series)
      .find((s) => s.visible !== false);
    if (!firstVisibleSeries) return gapProcessedArchiveData;
    return lttbDownsample(gapProcessedArchiveData, LTTB_THRESHOLD, 'timestamp', firstVisibleSeries.seriesId);
  }, [gapProcessedArchiveData, group.charts]);

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
  // Table view uses archive data (xAxisGroupby charts have their own rendering path).
  const chartData = archiveData;
  const xKey = 'timestamp';
  // Actual displayed range for X-axis formatting (per-chart formatters use this).
  const displayedRange = useMemo(() => {
    if (archiveParams?.from && archiveParams?.to) {
      const sec = (new Date(archiveParams.to).getTime() - new Date(archiveParams.from).getTime()) / 1000;
      const days = Math.round(sec / 86400);
      return `${days}d`;
    }
    return selectedRange;
  }, [archiveParams?.from, archiveParams?.to, selectedRange]);

  // Loading and error state: all active fetches must complete.
  const isLoading = archiveResult.loading
    || groupedArchive.loading
    || (hasRangeChart && (rangeHighResult.loading || rangeLowResult.loading));
  const fetchError = archiveResult.error
    ?? groupedArchive.error
    ?? (hasRangeChart ? (rangeHighResult.error ?? rangeLowResult.error) : null);
  const onRetry = () => {
    archiveResult.refetch();
    groupedArchive.refetch();
    if (hasRangeChart) { rangeHighResult.refetch(); rangeLowResult.refetch(); }
  };

  // -------------------------------------------------------------------------
  // Date controls mode detection
  // -------------------------------------------------------------------------

  const showRollingRanges =
    group.enableDateRanges &&
    group.rollingRanges.length > 0;

  const showYearMonthDropdowns =
    !showRollingRanges &&
    group.availableYears.length > 0;

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
    const columns: { key: string; label: string }[] = [
      { key: xKey, label: t('tableColumnTime') },
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
        <Card footprint="full" className="p-4">
          <div className="prose prose-sm dark:prose-invert max-w-none [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{group.pageContent}</ReactMarkdown>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Date controls                                                        */}
      {/* ------------------------------------------------------------------ */}

      {/* ------------------------------------------------------------------ */}
      {/* Chart / table toggle button + chart container — all in one Card    */}
      {/* ------------------------------------------------------------------ */}

      <Card footprint="full" className="p-4 overflow-hidden min-h-[var(--card-row)]">
      <CardHeader>
        {group.title && <CardTitle as="h2">{group.title}</CardTitle>}
        <CardAction>
          <ChartFullscreenButton onClick={() => setFullscreen(true)} />
        </CardAction>
      </CardHeader>

      {/* Mode B: Year / month dropdowns + export icons — single row on mobile, wraps on desktop */}
      {!hideControls && showYearMonthDropdowns && (
        <div className="flex items-end gap-2 md:flex-wrap md:gap-4 mb-4">
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
              value={selectedYear ?? undefined}
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

          {/* Export + table toggle — right-justified on same row as dropdowns */}
          <div className="flex items-end gap-2 ml-auto">
            {group.exporting !== false && (
            <button
              type="button"
              onClick={handlePngExport}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t('exportPng')}
              title={t('exportPng')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            )}
            {group.exporting !== false && (
            <button
              type="button"
              onClick={handleCsvExport}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t('exportCsv')}
              title={t('exportCsv')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </button>
            )}
            <button
              type="button"
              onClick={() => setShowTable((prev) => !prev)}
              aria-pressed={showTable}
              className="hidden md:inline-flex items-center px-3 py-2 text-sm text-muted-foreground rounded-md border border-border hover:text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {showTable ? t('showChart') : t('showDataTable')}
            </button>
          </div>
        </div>
      )}

      {/* Mode A: Rolling range buttons — now inside the card, below the group title */}
      {!hideControls && showRollingRanges && (
        <div
          role="radiogroup"
          aria-label={t('ariaRangeGroupLabel')}
          className="flex flex-wrap gap-2 mb-4"
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

      <div aria-busy={isLoading || undefined} style={{ minWidth: 0, overflow: 'hidden' }}>
        {/* Export/toggle row for groups WITHOUT year/month dropdowns (rolling range groups).
            Year/month groups have the export buttons inline with their dropdowns above. */}
        {!(showYearMonthDropdowns && !hideControls) && (
        <div className="flex justify-end items-center gap-2 mb-2">
          {group.exporting !== false && (
          <button
            type="button"
            onClick={handlePngExport}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t('exportPng')}
            title={t('exportPng')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          )}
          {group.exporting !== false && (
          <button
            type="button"
            onClick={handleCsvExport}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t('exportCsv')}
            title={t('exportCsv')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </button>
          )}
          <button
            type="button"
            onClick={() => setShowTable((prev) => !prev)}
            aria-pressed={showTable}
            className="hidden md:inline-flex items-center px-3 py-2 text-sm text-muted-foreground rounded-md border border-border hover:text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {showTable ? t('showChart') : t('showDataTable')}
          </button>
        </div>
        )}

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
                    {t('tableColumnTime')}
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
                    xVal != null
                      ? formatTimestamp(xVal, selectedRange)
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
          <div ref={chartContainerRef} className="space-y-6" style={{ overflow: 'hidden' }}>
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
                  return (
                    <TileSkeleton key={chart.chartId} className="h-[300px]" />
                  );
                }
                const windRoseSeries = chart.series.find(
                  (s) => s.seriesId === 'windRose',
                );
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
                    title={chart.title}
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
                  <div key={chart.chartId}>
                    {chart.title && <h3 className="text-sm font-semibold text-center mb-2">{chart.title}</h3>}
                    <HaysChart
                      highData={rangeHighPoints}
                      lowData={rangeLowPoints}
                      field={haysField}
                      unit={haysUnit}
                      softMax={haysSoftMax}
                      height={300}
                      reducedMotion={reducedMotion}
                    />
                  </div>
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
                  <div key={chart.chartId}>
                    {chart.title && <h3 className="text-sm font-semibold text-center mb-2">{chart.title}</h3>}
                    <WeatherRangeChart
                      highData={rangeHighPoints}
                      lowData={rangeLowPoints}
                      field={fieldName}
                      unit={unitLabel}
                      height={300}
                      reducedMotion={reducedMotion}
                    />
                  </div>
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

              // Per-chart data source: charts with xAxisGroupby use the grouped
              // archive endpoint (already fetched above); all others use archive data.
              if (chart.xAxisGroupby) {
                const { data: groupedChartData, xKey: groupedXKey } = buildGroupedChartData(
                  chart,
                  groupedArchive.data,
                  customQueryResults.data,
                );
                return (
                  <ConfigDrivenChart
                    key={chart.chartId}
                    config={chart}
                    data={groupedChartData}
                    xKey={groupedXKey}
                    xFormatter={undefined}
                    globalColors={globalColors}
                    globalType={globalType}
                    height={300}
                    reducedMotion={reducedMotion}
                  />
                );
              }

              // Per-chart time filtering: if the chart has its own timeLength,
              // clip data to that window (Belchertown chart-level override).
              let chartData = downsampledArchiveData;
              if (typeof chart.timeLength === 'number') {
                const cutoff = new Date(Date.now() - chart.timeLength * 1000).toISOString();
                chartData = downsampledArchiveData.filter(
                  (r) => r.timestamp != null && String(r.timestamp) >= cutoff,
                );
              }

              return (
                <ConfigDrivenChart
                  key={chart.chartId}
                  config={chart}
                  data={chartData}
                  xKey="timestamp"
                  xFormatter={(v: string | number) => formatTimestamp(v, displayedRange)}
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
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Fullscreen overlay — renders the same chart content at full viewport */}
      {/* ------------------------------------------------------------------ */}
      <ChartFullscreenOverlay
        isOpen={fullscreen}
        onClose={() => setFullscreen(false)}
        aria-label={group.title ? `${group.title} — fullscreen` : 'Chart fullscreen view'}
      >
        <div className="h-full overflow-y-auto py-2">
          {isLoading ? (
            <TileSkeleton className="h-full" />
          ) : fetchError ? (
            <TileError message={t('unableToLoad')} onRetry={onRetry} retryLabel={t('retry')} />
          ) : (
            <div className="space-y-6 h-full">
              {group.charts.map((chart) => {
                const isWindRoseChart = chart.series.some((s) => s.seriesId === 'windRose');
                const isHaysChartLocal = chart.series.some((s) => s.seriesId === 'haysChart');
                const isRangeChart = chart.series.some((s) => s.rangeType != null);

                if (isWindRoseChart) {
                  if (!windRoseData) return <TileSkeleton key={chart.chartId} className="h-full" />;
                  const windRoseSeries = chart.series.find((s) => s.seriesId === 'windRose');
                  const beaufortColors = Object.keys(windRoseSeries?.beaufortColors ?? {}).length > 0
                    ? windRoseSeries!.beaufortColors
                    : defaultBeaufortColors;
                  return (
                    <WindRoseChart
                      key={chart.chartId}
                      data={windRoseData}
                      beaufortColors={beaufortColors}
                      height={400}
                      reducedMotion={reducedMotion}
                      title={chart.title}
                    />
                  );
                }

                if (isHaysChartLocal) {
                  if (rangeHighPoints.length === 0 || rangeLowPoints.length === 0) {
                    return <TileSkeleton key={chart.chartId} className="h-full" />;
                  }
                  const haysSeries = chart.series.find((s) => s.seriesId === 'haysChart');
                  const haysField = haysSeries?.observationType ?? rangeField ?? 'value';
                  const haysUnit = haysSeries?.yAxisLabel ?? '';
                  const haysSoftMax = haysSeries?.yAxisSoftMax ?? undefined;
                  return (
                    <div key={chart.chartId} className="h-full">
                      {chart.title && <h3 className="text-sm font-semibold text-center mb-2">{chart.title}</h3>}
                      <HaysChart
                        highData={rangeHighPoints}
                        lowData={rangeLowPoints}
                        field={haysField}
                        unit={haysUnit}
                        softMax={haysSoftMax}
                        height={400}
                        reducedMotion={reducedMotion}
                      />
                    </div>
                  );
                }

                if (isRangeChart) {
                  if (rangeHighPoints.length === 0 || rangeLowPoints.length === 0) {
                    return <TileSkeleton key={chart.chartId} className="h-full" />;
                  }
                  const rangeSeries = chart.series.find((s) => s.rangeType != null);
                  const fieldName = rangeSeries?.observationType ?? rangeField ?? 'value';
                  const unitLabel = rangeSeries?.yAxisLabel ?? '';
                  return (
                    <div key={chart.chartId} className="h-full">
                      {chart.title && <h3 className="text-sm font-semibold text-center mb-2">{chart.title}</h3>}
                      <WeatherRangeChart
                        highData={rangeHighPoints}
                        lowData={rangeLowPoints}
                        field={fieldName}
                        unit={unitLabel}
                        height={400}
                        reducedMotion={reducedMotion}
                      />
                    </div>
                  );
                }

                const isGaugeChart =
                  chart.type === 'gauge' || chart.type === 'solidgauge' ||
                  group.type === 'gauge' || group.type === 'solidgauge';

                if (isGaugeChart) {
                  const gaugeSeries = chart.series[0];
                  const gaugeObsType = gaugeSeries?.observationType ?? null;
                  const latestRecord = archiveResult.data && archiveResult.data.length > 0
                    ? archiveResult.data[archiveResult.data.length - 1]
                    : null;
                  const rawValue = latestRecord && gaugeObsType
                    ? (latestRecord[gaugeObsType] as number | null | undefined)
                    : null;
                  const gaugeValue = typeof rawValue === 'number' ? rawValue : 0;
                  const gaugeMin = chart.yAxisMin ?? gaugeSeries?.yAxisMin ?? 0;
                  const gaugeMax = gaugeSeries?.yAxisMax ?? 100;
                  const gaugeUnit = gaugeSeries?.yAxisLabel ?? '';
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

                if (chart.xAxisGroupby) {
                  const { data: groupedChartData, xKey: groupedXKey } = buildGroupedChartData(
                    chart,
                    groupedArchive.data,
                    customQueryResults.data,
                  );
                  return (
                    <ConfigDrivenChart
                      key={chart.chartId}
                      config={chart}
                      data={groupedChartData}
                      xKey={groupedXKey}
                      xFormatter={undefined}
                      globalColors={globalColors}
                      globalType={globalType}
                      height={400}
                      reducedMotion={reducedMotion}
                    />
                  );
                }

                let fsChartData = downsampledArchiveData;
                if (typeof chart.timeLength === 'number') {
                  const cutoff = new Date(Date.now() - chart.timeLength * 1000).toISOString();
                  fsChartData = downsampledArchiveData.filter(
                    (r) => r.timestamp != null && String(r.timestamp) >= cutoff,
                  );
                }

                return (
                  <ConfigDrivenChart
                    key={chart.chartId}
                    config={chart}
                    data={fsChartData}
                    xKey="timestamp"
                    xFormatter={(v: string | number) => formatTimestamp(v, displayedRange)}
                    globalColors={globalColors}
                    globalType={globalType}
                    height={400}
                    reducedMotion={reducedMotion}
                  />
                );
              })}
            </div>
          )}
        </div>
      </ChartFullscreenOverlay>
    </div>
  );
}
