// ConfigDrivenChart.tsx — T2.2 / T2.3 / T2.4 / T4.1
// Renders a Recharts ComposedChart driven entirely by ChartConfig + SeriesConfig.
// Never conditionally switches between chart types — ComposedChart handles all
// element types (Line, Area, Bar) in one chart, mirroring the MonthlyAveragesCard pattern.
//
// Accessibility:
//   - Chart container: role="img" + aria-label (WCAG 1.1.1 / coding rules §5.5)
//   - visually-hidden sr-only data table provides values to screen readers
//   - No color-only state signals; series distinguished by name in Legend
//   - Reduced-motion: isAnimationActive={false} when reducedMotion prop is true
//
// Intentionally unwired: yAxisMinorTicks, states, connectEnds, polar (see CHARTS-REWRITE-PLAN.md §5)

import { useMemo } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ChartContainer } from './chart-container';
import type { ChartConfig, SeriesConfig } from '../../api/types';
import { useTheme } from '../../lib/theme-provider';
import { ensureChartContrast } from '../../utils/chart-contrast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fallback color palette when neither series.color nor globalColors provides a color. */
const FALLBACK_PALETTE: string[] = [
  '#7cb5ec', '#b2df8a', '#f7a35c', '#8c6bb1', '#dd3497',
  '#e4d354', '#268bd2', '#f45b5b', '#6a3d9a', '#33a02c',
];

/**
 * CSS variable for chart typography. Defined in src/index.css as
 * --font-chart: 'Lexend', system-ui, sans-serif;
 */
const CHART_FONT = 'var(--font-chart, Lexend, sans-serif)';

/**
 * 8-point compass label lookup for wind direction axis ticks.
 * Used when the right axis displays wind direction (0–360°).
 */
const COMPASS_TICKS: Record<number, string> = {
  0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
  180: 'S', 225: 'SW', 270: 'W', 315: 'NW', 360: 'N',
};

/** Explicit tick positions for a wind direction axis. */
const WIND_DIR_TICKS = [0, 45, 90, 135, 180, 225, 270, 315, 360];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ConfigDrivenChartProps {
  config: ChartConfig;
  data: Record<string, number | string | null>[];
  xKey: string;
  xFormatter?: (value: string | number) => string;
  tooltipLabelFormatter?: (value: string | number) => string;
  globalColors?: string[];
  globalType?: string;
  height?: number;
  reducedMotion?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the effective series type from the three-level fallback chain:
 *   series.type ?? config.type ?? globalType ?? 'line'
 */
function resolveSeriesType(
  series: SeriesConfig,
  config: ChartConfig,
  globalType: string | undefined,
): string {
  return series.type ?? config.type ?? globalType ?? 'line';
}

/**
 * Resolve the effective color for a series using the three-level fallback chain:
 *   series.color ?? globalColors?.[index] ?? FALLBACK_PALETTE[index % length]
 */
function resolveColor(
  series: SeriesConfig,
  index: number,
  globalColors: string[] | undefined,
): string {
  return (
    series.color ??
    globalColors?.[index] ??
    FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
  );
}

/** Return the yAxisId string for a series (left=0, right=1). */
function resolveYAxisId(series: SeriesConfig): string {
  return (series.yAxis ?? 0) === 1 ? 'right' : 'left';
}

/**
 * Returns true when a series represents wind direction observations.
 * Checks both observationType and seriesId to cover all config patterns.
 */
function isWindDirSeries(series: SeriesConfig): boolean {
  return (
    series.observationType === 'windDir' || series.seriesId === 'windDir'
  );
}

/**
 * Extract the unit suffix from a yAxisLabel string.
 * Parses the last parenthesised group: "Temperature (°F)" → "°F".
 * Returns empty string when no parentheses group is present.
 */
function extractUnitFromLabel(label: string | null | undefined): string {
  if (!label) return '';
  const match = label.match(/\(([^)]+)\)$/);
  return match ? match[1] : '';
}

// ---------------------------------------------------------------------------
// Series element renderers
// ---------------------------------------------------------------------------

interface SeriesElementProps {
  series: SeriesConfig;
  seriesType: string;
  color: string;
  reducedMotion: boolean;
}

function renderSeriesElement({
  series,
  seriesType,
  color,
  reducedMotion,
}: SeriesElementProps): React.ReactElement | null {
  const yAxisId = resolveYAxisId(series);
  const name = series.name ?? series.seriesId;
  const dataKey = series.seriesId;
  const animationActive = !reducedMotion;

  // Shared dot props derived from markerEnabled / markerRadius
  const dotProp = (() => {
    if (series.markerEnabled === false) return false;
    if (series.markerEnabled === true && series.markerRadius != null) {
      return { r: series.markerRadius };
    }
    return false; // off by default — matches Belchertown plotOptions.line.marker.enabled=false
  })();

  // stackId for stacking support
  const stackId = series.stacking ? 'stack' : undefined;

  // Shared line/area props
  const connectNulls = series.connectNulls ?? false;

  // T4.1b: borderWidth wires to strokeWidth on Line/Area; also adds stroke+strokeWidth on Bar.
  // Falls back to series.lineWidth ?? 2 when borderWidth is not set.
  const strokeWidth = series.borderWidth ?? series.lineWidth ?? 2;
  const strokeOpacity = series.opacity ?? 1;

  // dashStyle → SVG strokeDasharray
  const DASH_MAP: Record<string, string> = {
    Dash: '8 4', Dot: '2 4', DashDot: '8 4 2 4',
    LongDash: '16 4', ShortDash: '4 4', LongDashDot: '16 4 2 4',
    ShortDashDot: '4 4 2 4', ShortDot: '2 2',
  };
  const strokeDasharray = series.dashStyle
    ? DASH_MAP[series.dashStyle] ?? undefined
    : undefined;

  switch (seriesType) {
    case 'spline':
      return (
        <Line
          key={dataKey}
          type="monotone"
          yAxisId={yAxisId}
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
          strokeDasharray={strokeDasharray}
          connectNulls={connectNulls}
          dot={dotProp}
          isAnimationActive={animationActive}
        />
      );

    case 'area':
      return (
        <Area
          key={dataKey}
          type="monotone"
          yAxisId={yAxisId}
          dataKey={dataKey}
          name={name}
          stroke={color}
          fill={series.fillColor ?? color}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
          strokeDasharray={strokeDasharray}
          fillOpacity={series.fillOpacity ?? series.opacity ?? 0.3}
          connectNulls={connectNulls}
          dot={dotProp}
          stackId={stackId}
          isAnimationActive={animationActive}
        />
      );

    case 'bar':
    case 'column': {
      // T4.1b: borderWidth > 0 → add stroke outline on bars
      const borderWidth = series.borderWidth;
      const barStroke = borderWidth != null && borderWidth > 0 ? color : undefined;
      const barStrokeWidth = borderWidth != null && borderWidth > 0 ? borderWidth : undefined;
      return (
        <Bar
          key={dataKey}
          yAxisId={yAxisId}
          dataKey={dataKey}
          name={name}
          fill={series.fillColor ?? color}
          fillOpacity={series.fillOpacity ?? series.opacity ?? 1}
          stroke={barStroke}
          strokeWidth={barStrokeWidth}
          stackId={stackId}
          isAnimationActive={animationActive}
        />
      );
    }

    case 'scatter':
      // Recharts has no ScatterChart within ComposedChart that takes dataKey in the
      // same way — approximate with Line dot=true connectNull=false.
      return (
        <Line
          key={dataKey}
          type="linear"
          yAxisId={yAxisId}
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={0}
          strokeOpacity={0}
          dot={{ r: series.markerRadius ?? 2, fill: color }}
          connectNulls={false}
          isAnimationActive={animationActive}
        />
      );

    case 'line':
    default:
      return (
        <Line
          key={dataKey}
          type="linear"
          yAxisId={yAxisId}
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
          strokeDasharray={strokeDasharray}
          connectNulls={connectNulls}
          dot={dotProp}
          isAnimationActive={animationActive}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// YAxis configuration helpers
// ---------------------------------------------------------------------------

interface AxisConfig {
  label: string | undefined;
  min: number | undefined;
  max: number | undefined;
  softMin: number | undefined;
  softMax: number | undefined;
  tickInterval: number | undefined;
  mirrored: boolean;
}

/**
 * Collect axis configuration for left (yAxis=0) and right (yAxis=1) axes
 * by scanning all visible series.
 */
function collectAxisConfigs(
  series: SeriesConfig[],
): { left: AxisConfig; right: AxisConfig } {
  const left: AxisConfig = { label: undefined, min: undefined, max: undefined, softMin: undefined, softMax: undefined, tickInterval: undefined, mirrored: false };
  const right: AxisConfig = { label: undefined, min: undefined, max: undefined, softMin: undefined, softMax: undefined, tickInterval: undefined, mirrored: false };

  for (const s of series) {
    if (s.visible === false) continue;
    const side = (s.yAxis ?? 0) === 1 ? right : left;
    if (s.yAxisLabel != null && side.label == null) side.label = s.yAxisLabel;
    if (s.yAxisMin != null && side.min == null) side.min = s.yAxisMin;
    if (s.yAxisMax != null && side.max == null) side.max = s.yAxisMax;
    // T4.1a: wire softMin/softMax from series config to axis config
    if (s.yAxisSoftMin != null && side.softMin == null) side.softMin = s.yAxisSoftMin;
    if (s.yAxisSoftMax != null && side.softMax == null) side.softMax = s.yAxisSoftMax;
    if (s.mirroredValue) side.mirrored = true;
    if (s.yAxisTickInterval != null && side.tickInterval == null) {
      side.tickInterval = s.yAxisTickInterval;
    }
  }

  return { left, right };
}

/** Returns true if any visible series uses yAxis=1 (right axis). */
function needsRightAxis(series: SeriesConfig[]): boolean {
  return series.some((s) => s.visible !== false && (s.yAxis ?? 0) === 1);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConfigDrivenChart({
  config,
  data,
  xKey,
  xFormatter,
  tooltipLabelFormatter,
  globalColors,
  globalType,
  height = 300,
  reducedMotion = false,
}: ConfigDrivenChartProps) {
  const { resolved: resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const isMobile = useIsMobile();

  const chartMargin = isMobile
    ? { top: 4, right: 4, bottom: 4, left: 0 }
    : { top: 8, right: 55, bottom: 8, left: 15 };
  const phantomAxisWidth = isMobile ? 4 : 60;

  // Filter to visible series only once; keep original index for color resolution
  const visibleSeries = config.series
    .map((s, i) => ({ series: s, originalIndex: i }))
    .filter(({ series }) => series.visible !== false);

  const rightAxisNeeded = needsRightAxis(config.series);
  const { left: leftAxisCfg, right: rightAxisCfg } = collectAxisConfigs(config.series);

  const chartTitle = config.title ?? 'Chart';

  // Detect if the right axis is displaying wind direction.
  // Used to apply compass tick labels instead of raw degree numbers (T2.3).
  const rightAxisIsWindDir = config.series.some(
    (s) => s.visible !== false && (s.yAxis ?? 0) === 1 && isWindDirSeries(s),
  );

  // Rain observation types — rain axis must start at 0, not auto-min.
  const RAIN_OBS_TYPES = ['rain', 'rainRate', 'rainTotal'];

  // Build domain for left axis (supports min, max, softMin, softMax, or both).
  // T4.1a: When softMin/softMax are present, use Recharts function-based domain so
  // the axis expands beyond the soft bounds only when data requires it.
  // T-A2: Default is ['auto','auto'] (tight to data) instead of undefined (includes 0).
  //       Exception: rain axes use [0,'auto'] — rain can't be negative.
  const leftDomain:
    | [number | string | ((v: number) => number), number | string | ((v: number) => number)]
    | undefined = (() => {
    const { min, max, softMin, softMax } = leftAxisCfg;
    // Hard min/max take precedence over soft bounds
    if (min != null || max != null) {
      return [min ?? 'auto', max ?? 'auto'] as [number | string, number | string];
    }
    if (softMin != null || softMax != null) {
      const lo: number | string | ((v: number) => number) =
        softMin != null
          ? (dataMin: number) => Math.min(softMin, dataMin)
          : 'auto';
      const hi: number | string | ((v: number) => number) =
        softMax != null
          ? (dataMax: number) => Math.max(softMax, dataMax)
          : 'auto';
      return [lo, hi];
    }
    // T-A2: auto-scale to data range; keep rain axis floor at 0
    const leftHasRain = config.series.some(
      (s) =>
        s.visible !== false &&
        (s.yAxis ?? 0) === 0 &&
        RAIN_OBS_TYPES.includes(s.observationType ?? s.seriesId),
    );
    return leftHasRain
      ? ([0, 'auto'] as [number, string])
      : (['auto', 'auto'] as [string, string]);
  })();

  // Build domain for right axis (same logic as left, plus wind direction override).
  const rightDomain:
    | [number | string | ((v: number) => number), number | string | ((v: number) => number)]
    | undefined = (() => {
    if (rightAxisIsWindDir) {
      // T2.3: force 0–360 domain for compass axis
      return [0, 360] as [number, number];
    }
    const { min, max, softMin, softMax } = rightAxisCfg;
    if (min != null || max != null) {
      return [min ?? 'auto', max ?? 'auto'] as [number | string, number | string];
    }
    if (softMin != null || softMax != null) {
      const lo: number | string | ((v: number) => number) =
        softMin != null
          ? (dataMin: number) => Math.min(softMin, dataMin)
          : 'auto';
      const hi: number | string | ((v: number) => number) =
        softMax != null
          ? (dataMax: number) => Math.max(softMax, dataMax)
          : 'auto';
      return [lo, hi];
    }
    // T-A2: auto-scale to data range; keep rain axis floor at 0
    const rightHasRain = config.series.some(
      (s) =>
        s.visible !== false &&
        (s.yAxis ?? 0) === 1 &&
        RAIN_OBS_TYPES.includes(s.observationType ?? s.seriesId),
    );
    return rightHasRain
      ? ([0, 'auto'] as [number, string])
      : (['auto', 'auto'] as [string, string]);
  })();

  // Compute explicit tick arrays when tickInterval is set (Recharts needs explicit values)
  function buildTicks(cfg: AxisConfig): number[] | undefined {
    if (cfg.tickInterval == null || cfg.tickInterval <= 0) return undefined;
    const lo = cfg.min ?? 0;
    const hi = cfg.max ?? (lo + cfg.tickInterval * 10);
    const ticks: number[] = [];
    for (let v = lo; v <= hi + cfg.tickInterval * 0.001; v += cfg.tickInterval) {
      ticks.push(Math.round(v * 1e6) / 1e6);
    }
    return ticks.length > 0 && ticks.length <= 100 ? ticks : undefined;
  }
  const leftTicks = buildTicks(leftAxisCfg);
  // T2.3: right axis ticks are compass positions when wind dir; otherwise computed normally
  const rightTicks = rightAxisIsWindDir ? WIND_DIR_TICKS : buildTicks(rightAxisCfg);

  // T2.4: Build a per-series format map for tooltip number formatting.
  // Maps seriesId → { decimals, unit, isWindDir }.
  const seriesFormatMap = useMemo(() => {
    const map = new Map<string, { decimals: number; unit: string; isWindDir: boolean }>();
    for (const { series } of visibleSeries) {
      const decimals =
        series.numberFormat != null && typeof series.numberFormat['decimals'] === 'number'
          ? (series.numberFormat['decimals'] as number)
          : 1;
      // Unit is extracted from the series yAxisLabel, e.g. "Temperature (°F)" → "°F"
      const unit = extractUnitFromLabel(series.yAxisLabel);
      map.set(series.seriesId, { decimals, unit, isWindDir: isWindDirSeries(series) });
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.series]);

  // T-A5: Compute Y-axis tick decimal precision for each axis.
  // Priority: explicit yAxisTickDecimals from series config → barometer/pressure auto-detect (2) → none.
  const PRESSURE_OBS_TYPES = ['barometer', 'pressure', 'altimeter'];

  function resolveTickDecimals(axisIndex: 0 | 1): number | undefined {
    const axisSeries = config.series.filter(
      (s) => s.visible !== false && (s.yAxis ?? 0) === axisIndex,
    );
    // 1. Explicit config value from any series on this axis
    for (const s of axisSeries) {
      if (s.yAxisTickDecimals != null) return s.yAxisTickDecimals;
    }
    // 2. Auto-detect pressure observations → 2 decimal places
    const hasPressure = axisSeries.some((s) =>
      PRESSURE_OBS_TYPES.includes(s.observationType ?? s.seriesId),
    );
    if (hasPressure) return 2;
    return undefined;
  }

  const leftTickDecimals = resolveTickDecimals(0);
  const rightTickDecimals = resolveTickDecimals(1);

  return (
    <div style={{ minWidth: 0, minHeight: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
      {config.title && (
        <h3 className="font-semibold text-foreground mb-2 text-center" style={{ fontSize: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
          {config.title}
        </h3>
      )}
      {config.subtitle && (
        <p className="text-muted-foreground mb-1" style={{ fontSize: 'var(--text-label)' }}>{config.subtitle}</p>
      )}
      {/*
        sr-only data table — provides chart data to screen readers.
        WCAG 1.1.1 / coding rules §5.5.
        Wrapped in a div because sr-only on <table> fails (table display overrides clip).
      */}
      <div className="sr-only">
      <table aria-label={chartTitle}>
        <caption className="sr-only">{chartTitle}</caption>
        <thead>
          <tr>
            <th scope="col">{xKey}</th>
            {visibleSeries.map(({ series }) => (
              <th key={series.seriesId} scope="col">
                {series.name ?? series.seriesId}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => {
            const xVal = row[xKey];
            return (
              <tr key={rowIndex}>
                <td>{xVal != null ? String(xVal) : '—'}</td>
                {visibleSeries.map(({ series }) => {
                  const val = row[series.seriesId];
                  return (
                    <td key={series.seriesId}>
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

      {/*
        Chart container: role="img" + aria-label so screen readers announce it
        as a graphic rather than an anonymous div (WCAG 1.1.1).
        The sr-only table above is the text alternative.
        ChartContainer owns the ResponsiveContainer wrapper.
      */}
      <ChartContainer height={height} ariaLabel={chartTitle}>
          <ComposedChart
            data={data}
            margin={chartMargin}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />

            <XAxis
              dataKey={xKey}
              height={30}
              tickFormatter={xFormatter}
              minTickGap={isMobile ? 20 : 50}
              tick={{ fontSize: 14, fontFamily: CHART_FONT }}
              className="fill-muted-foreground"
            />

            {/* Left YAxis — always present. Rotated labels hidden on mobile (unreadable). */}
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize: 14, fontFamily: CHART_FONT }}
              width={isMobile ? 35 : undefined}
              className="fill-muted-foreground"
              domain={leftDomain}
              ticks={leftTicks}
              interval={leftTicks ? 0 : undefined}
              tickFormatter={
                leftAxisCfg.mirrored ? (v: number) => String(Math.abs(v)) :
                leftTickDecimals != null ? (v: number) => v.toFixed(leftTickDecimals) :
                undefined
              }
              label={
                !isMobile && leftAxisCfg.label != null
                  ? {
                      value: leftAxisCfg.label,
                      angle: -90,
                      position: 'insideLeft',
                      offset: -5,
                      style: {
                        fontSize: 14,
                        fontFamily: CHART_FONT,
                        fill: 'var(--muted-foreground, #a1a1aa)',
                        textAnchor: 'middle',
                      },
                    }
                  : undefined
              }
            />

            {/*
              Right YAxis — only rendered when a series uses yAxis=1.
              When not needed, a "phantom" axis avoids the hide={true} bug
              (recharts/recharts#428): hide breaks XAxis label rendering.
              Per recharts-axis-reference.md §Common mistakes #7:
              use tick={false} axisLine={false} tickLine={false} width={1} instead.

              T2.3: When right axis is wind direction, compass labels replace degree numbers.
              Explicit ticks at 8 compass points; interval={0} ensures all are shown.
            */}
            {rightAxisNeeded ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 14, fontFamily: CHART_FONT }}
                width={isMobile ? 30 : undefined}
                className="fill-muted-foreground"
                domain={rightDomain}
                ticks={rightTicks}
                interval={rightAxisIsWindDir ? 0 : (rightTicks ? 0 : undefined)}
                tickFormatter={
                  rightAxisIsWindDir
                    ? (v: number) => COMPASS_TICKS[v] ?? String(v)
                    : rightTickDecimals != null
                      ? (v: number) => v.toFixed(rightTickDecimals)
                      : undefined
                }
                label={
                  !isMobile && rightAxisCfg.label != null
                    ? {
                        value: rightAxisCfg.label,
                        angle: 90,
                        position: 'insideRight',
                        offset: -5,
                        style: {
                          fontSize: 14,
                          fontFamily: CHART_FONT,
                          fill: 'var(--muted-foreground, #a1a1aa)',
                          textAnchor: 'middle',
                        },
                      }
                    : undefined
                }
              />
            ) : (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={false}
                axisLine={false}
                tickLine={false}
                width={phantomAxisWidth}
              />
            )}

            {/*
              T2.4: Tooltip formatter applies per-series number formatting.
              Uses decimals from series.numberFormat, defaulting to 1 decimal place.
              Unit suffix extracted from series yAxisLabel (last parenthesised group).
              Wind direction series show compass label + degrees: "NE (47°)".
            */}
            <Tooltip
              contentStyle={{
                fontSize: '0.75rem',
                borderRadius: '0.5rem',
              }}
              labelFormatter={tooltipLabelFormatter ? (label: unknown) => tooltipLabelFormatter(label as string | number) : undefined}
              formatter={(value: unknown, name: string | number | undefined) => {
                const numVal = Number(value);
                const nameStr = typeof name === 'string' ? name : undefined;
                const fmt = nameStr !== undefined ? seriesFormatMap.get(nameStr) : undefined;
                if (fmt?.isWindDir) {
                  // Wind direction: show compass label with raw degrees in parens
                  const deg = Math.round(numVal);
                  const compassIdx = Math.round(((deg % 360) + 360) % 360 / 45) * 45;
                  const normalised = compassIdx === 360 ? 0 : compassIdx;
                  const compass = COMPASS_TICKS[normalised] ?? COMPASS_TICKS[0];
                  return [`${compass} (${deg}°)`, name];
                }
                const decimals = fmt?.decimals ?? 1;
                const formatted = numVal.toFixed(decimals);
                const unit = fmt?.unit ?? '';
                return [unit ? `${formatted} ${unit}` : formatted, name];
              }}
            />

            <Legend
              wrapperStyle={{ fontSize: '0.75rem', fontFamily: CHART_FONT }}
            />

            {[...visibleSeries]
              .sort((a, b) => (a.series.zIndex ?? 0) - (b.series.zIndex ?? 0))
              .map(({ series, originalIndex }) => {
              const seriesType = resolveSeriesType(series, config, globalType);
              const color = ensureChartContrast(
                resolveColor(series, originalIndex, globalColors),
                isDark,
              );
              return renderSeriesElement({ series, seriesType, color, reducedMotion });
            })}
          </ComposedChart>
      </ChartContainer>
    </div>
  );
}
