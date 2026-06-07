// ConfigDrivenChart.tsx — T2.2
// Renders a Recharts ComposedChart driven entirely by ChartConfig + SeriesConfig.
// Never conditionally switches between chart types — ComposedChart handles all
// element types (Line, Area, Bar) in one chart, mirroring the MonthlyAveragesCard pattern.
//
// Accessibility:
//   - Chart container: role="img" + aria-label (WCAG 1.1.1 / coding rules §5.5)
//   - visually-hidden sr-only data table provides values to screen readers
//   - No color-only state signals; series distinguished by name in Legend
//   - Reduced-motion: isAnimationActive={false} when reducedMotion prop is true

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
  ResponsiveContainer,
} from 'recharts';
import type { ChartConfig, SeriesConfig } from '../../api/types';
import { useTheme } from '../../lib/theme-provider';
import { ensureChartContrast } from '../../utils/chart-contrast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fallback color palette when neither series.color nor globalColors provides a color. */
const FALLBACK_PALETTE: string[] = [
  '#7cb5ec',
  '#434348',
  '#90ed7d',
  '#f7a35c',
  '#8085e9',
  '#f15c80',
];

/**
 * CSS variable for chart typography. Defined in src/index.css as
 * --font-chart: 'Lexend', system-ui, sans-serif;
 */
const CHART_FONT = 'var(--font-chart, Lexend, sans-serif)';

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
    return undefined; // let Recharts decide
  })();

  // stackId for stacking support
  const stackId = series.stacking ? 'stack' : undefined;

  // Shared line/area props
  const connectNulls = series.connectNulls ?? false;
  const strokeWidth = series.lineWidth ?? 2;
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
    case 'column':
      return (
        <Bar
          key={dataKey}
          yAxisId={yAxisId}
          dataKey={dataKey}
          name={name}
          fill={series.fillColor ?? color}
          fillOpacity={series.fillOpacity ?? series.opacity ?? 1}
          stackId={stackId}
          isAnimationActive={animationActive}
        />
      );

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
          dot={{ r: series.markerRadius ?? 4, fill: color }}
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

  // Filter to visible series only once; keep original index for color resolution
  const visibleSeries = config.series
    .map((s, i) => ({ series: s, originalIndex: i }))
    .filter(({ series }) => series.visible !== false);

  const rightAxisNeeded = needsRightAxis(config.series);
  const { left: leftAxisCfg, right: rightAxisCfg } = collectAxisConfigs(config.series);

  const chartTitle = config.title ?? 'Chart';

  // Build domain for left axis (supports min, max, or both)
  const leftDomain: [number | string, number | string] | undefined =
    leftAxisCfg.min != null || leftAxisCfg.max != null
      ? [leftAxisCfg.min ?? 'auto', leftAxisCfg.max ?? 'auto']
      : undefined;

  // Build domain for right axis
  const rightDomain: [number | string, number | string] | undefined =
    rightAxisCfg.min != null || rightAxisCfg.max != null
      ? [rightAxisCfg.min ?? 'auto', rightAxisCfg.max ?? 'auto']
      : undefined;

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
  const rightTicks = buildTicks(rightAxisCfg);

  return (
    <div style={{ minWidth: 0, minHeight: 0, width: '100%', height: '100%' }}>
      {config.subtitle && (
        <p className="text-xs text-muted-foreground mb-1">{config.subtitle}</p>
      )}
      {/*
        sr-only data table — provides chart data to screen readers.
        WCAG 1.1.1 / coding rules §5.5.
        "sr-only" is a Tailwind utility that visually hides but keeps accessible.
      */}
      <table className="sr-only">
        <caption>{chartTitle}</caption>
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

      {/*
        Chart container: role="img" + aria-label so screen readers announce it
        as a graphic rather than an anonymous div (WCAG 1.1.1).
        The sr-only table above is the text alternative.
      */}
      <div role="img" aria-label={chartTitle}>
        <ResponsiveContainer width="99%" height={height}>
          <ComposedChart
            data={data}
            margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />

            <XAxis
              dataKey={xKey}
              height={30}
              tickFormatter={xFormatter}
              tick={{ fontSize: 11, fontFamily: CHART_FONT }}
              className="fill-muted-foreground"
            />

            {/* Left YAxis — always present */}
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize: 10, fontFamily: CHART_FONT }}
              className="fill-muted-foreground"
              domain={leftDomain}
              ticks={leftTicks}
              interval={leftTicks ? 0 : undefined}
              tickFormatter={leftAxisCfg.mirrored ? (v: number) => String(Math.abs(v)) : undefined}
              label={
                leftAxisCfg.label != null
                  ? {
                      value: leftAxisCfg.label,
                      angle: -90,
                      position: 'insideLeft',
                      offset: -5,
                      style: {
                        fontSize: 10,
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
            */}
            {rightAxisNeeded ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fontFamily: CHART_FONT }}
                className="fill-muted-foreground"
                domain={rightDomain}
                ticks={rightTicks}
                interval={rightTicks ? 0 : undefined}
                label={
                  rightAxisCfg.label != null
                    ? {
                        value: rightAxisCfg.label,
                        angle: 90,
                        position: 'insideRight',
                        offset: -5,
                        style: {
                          fontSize: 10,
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
                width={1}
              />
            )}

            <Tooltip
              contentStyle={{
                fontSize: '0.75rem',
                borderRadius: '0.5rem',
              }}
              labelFormatter={tooltipLabelFormatter ? (label: unknown) => tooltipLabelFormatter(label as string | number) : undefined}
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
        </ResponsiveContainer>
      </div>
    </div>
  );
}
