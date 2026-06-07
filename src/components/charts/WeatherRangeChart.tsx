// WeatherRangeChart.tsx
//
// Renders a Cartesian arearange chart showing daily high/low ranges.
// Per Belchertown wiki: weatherRange renders as arearange (area_display=1)
// or columnrange (default), NOT polar unless operator sets polar=true.
//
// Accessibility (WCAG 2.1 AA):
//   - sr-only <table> provides all values to screen readers (WCAG 1.1.1)

import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WeatherRangeChartProps {
  highData: Array<{ dateTime: number; value: number | null }>;
  lowData: Array<{ dateTime: number; value: number | null }>;
  field: string;
  unit?: string;
  height?: number;
  reducedMotion?: boolean;
}

// ---------------------------------------------------------------------------
// Temperature color zones — Belchertown's get_outTemp_color()
// Flat color bands (stepped, not blended) matching Highcharts zones behavior.
// ---------------------------------------------------------------------------

interface TempZone {
  value: number;
  color: string;
}

const TEMP_ZONES_F: TempZone[] = [
  { value: 0,   color: '#1278c8' },
  { value: 25,  color: '#30bfef' },
  { value: 32,  color: '#1fafdd' },
  { value: 40,  color: 'rgba(0,172,223,1)' },
  { value: 50,  color: '#71bc3c' },
  { value: 55,  color: 'rgba(90,179,41,0.8)' },
  { value: 65,  color: 'rgba(131,173,45,1)' },
  { value: 70,  color: 'rgba(206,184,98,1)' },
  { value: 75,  color: 'rgba(255,174,0,0.9)' },
  { value: 80,  color: 'rgba(255,153,0,0.9)' },
  { value: 85,  color: 'rgba(255,127,0,1)' },
  { value: 90,  color: 'rgba(255,79,0,0.9)' },
  { value: 95,  color: 'rgba(255,69,69,1)' },
  { value: 110, color: 'rgba(255,104,104,1)' },
];

const TEMP_ZONES_C: TempZone[] = [
  { value: -5,   color: '#1278c8' },
  { value: -3.8, color: '#30bfef' },
  { value: 0,    color: '#1fafdd' },
  { value: 4.4,  color: 'rgba(0,172,223,1)' },
  { value: 10,   color: '#71bc3c' },
  { value: 12.7, color: 'rgba(90,179,41,0.8)' },
  { value: 18.3, color: 'rgba(131,173,45,1)' },
  { value: 21.1, color: 'rgba(206,184,98,1)' },
  { value: 23.8, color: 'rgba(255,174,0,0.9)' },
  { value: 26.6, color: 'rgba(255,153,0,0.9)' },
  { value: 29.4, color: 'rgba(255,127,0,1)' },
  { value: 32.2, color: 'rgba(255,79,0,0.9)' },
  { value: 35,   color: 'rgba(255,69,69,1)' },
  { value: 43.3, color: 'rgba(255,104,104,1)' },
];

const TEMP_FIELDS = new Set([
  'outTemp', 'inTemp', 'dewpoint', 'windchill', 'heatindex',
  'appTemp', 'extraTemp1', 'extraTemp2', 'extraTemp3', 'extraTemp4',
]);

function getOutTempColor(temp: number, unit: string): string {
  const zones = unit.includes('C') ? TEMP_ZONES_C : TEMP_ZONES_F;
  for (let i = zones.length - 1; i >= 0; i--) {
    if (temp >= zones[i].value) return zones[i].color;
  }
  return zones[0].color;
}

// ---------------------------------------------------------------------------
// Chart font — matches ConfigDrivenChart
// ---------------------------------------------------------------------------

const CHART_FONT = 'var(--font-chart, var(--font-sans))';

// ---------------------------------------------------------------------------
// Merged data row
// ---------------------------------------------------------------------------

interface RangeRow {
  timestamp: number;
  high: number | null;
  low: number | null;
  avg: number | null;
  base: number | null;
  range: number | null;
}

function mergeData(
  highData: Array<{ dateTime: number; value: number | null }>,
  lowData: Array<{ dateTime: number; value: number | null }>,
): RangeRow[] {
  return highData.map((h, i) => {
    const low = lowData[i]?.value ?? null;
    const high = h.value;
    const avg = high !== null && low !== null ? (high + low) / 2 : null;
    const base = low;
    const range = high !== null && low !== null ? high - low : null;
    return { timestamp: h.dateTime, high, low, avg, base, range };
  });
}

// ---------------------------------------------------------------------------
// Y-axis auto-scaling — tight to data with clean tick intervals
// ---------------------------------------------------------------------------

function computeYDomain(data: RangeRow[]): {
  yMin: number;
  yMax: number;
  ticks: number[];
} {
  const highs = data.map((d) => d.high).filter((v): v is number => v !== null);
  const lows  = data.map((d) => d.low).filter((v): v is number => v !== null);
  if (highs.length === 0 || lows.length === 0) {
    return { yMin: 0, yMax: 100, ticks: [0, 20, 40, 60, 80, 100] };
  }

  const rawMax = Math.max(...highs);
  const rawMin = Math.min(...lows);
  const tickInterval = Math.max(5, Math.ceil(Math.round(rawMax / 5) / 5) * 5);
  const yMin = Math.floor(rawMin / tickInterval) * tickInterval;
  const yMax = Math.ceil(rawMax / tickInterval) * tickInterval;

  const ticks: number[] = [];
  for (let t = yMin; t <= yMax; t += tickInterval) ticks.push(t);

  return { yMin, yMax, ticks };
}

// ---------------------------------------------------------------------------
// Date formatter
// ---------------------------------------------------------------------------

function formatXAxisTick(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString('default', { day: 'numeric', month: 'short' });
}

function formatFullDate(timestamp: number, totalCount: number): string {
  const d = new Date(timestamp * 1000);
  if (totalCount <= 12) {
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('default', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Stepped temperature gradient — flat color bands matching Highcharts zones.
// Two stops per boundary so colors change abruptly (no blending).
// gradientUnits="userSpaceOnUse" ties colors to Y-axis pixel positions.
// ---------------------------------------------------------------------------

function buildGradientStops(
  yMin: number,
  yMax: number,
  unit: string,
  plotTop: number,
  plotBottom: number,
): Array<{ offset: number; color: string }> {
  const zones = unit.includes('C') ? TEMP_ZONES_C : TEMP_ZONES_F;
  const domainRange = yMax - yMin;
  if (domainRange <= 0) return [];
  const plotRange = plotBottom - plotTop;

  const tempToPixel = (temp: number) =>
    plotTop + ((yMax - temp) / domainRange) * plotRange;

  const stops: Array<{ offset: number; color: string }> = [];

  // Collect zone boundaries within [yMin, yMax]
  const visibleBoundaries = zones.filter((z) => z.value > yMin && z.value < yMax);

  // Start: color at yMax (top of plot)
  const topColor = getOutTempColor(yMax - 0.01, unit);
  stops.push({ offset: plotTop, color: topColor });

  // Stepped stops: two stops per boundary (end old color, start new color)
  for (const z of visibleBoundaries) {
    const px = tempToPixel(z.value);
    const colorAbove = getOutTempColor(z.value + 0.01, unit);
    const colorBelow = getOutTempColor(z.value - 0.01, unit);
    stops.push({ offset: px - 0.5, color: colorAbove });
    stops.push({ offset: px + 0.5, color: colorBelow });
  }

  // End: color at yMin (bottom of plot)
  const bottomColor = getOutTempColor(yMin, unit);
  stops.push({ offset: plotBottom, color: bottomColor });

  return stops;
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

interface CustomTooltipPayload {
  timestamp: number;
  high: number | null;
  low: number | null;
  avg: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip(props: any) {
  const { active, payload, unit, totalCount } = props as {
    active?: boolean;
    payload?: Array<{ payload?: CustomTooltipPayload }>;
    unit: string;
    totalCount: number;
  };
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload ?? null;
  if (!row) return null;

  const { timestamp, high, low, avg } = row;

  return (
    <div
      role="tooltip"
      className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md"
    >
      <div className="font-semibold mb-1">{formatFullDate(timestamp, totalCount)}</div>
      {high !== null && (
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getOutTempColor(high, unit) }} />
          <span>High: {high.toFixed(1)}{unit}</span>
        </div>
      )}
      {low !== null && (
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getOutTempColor(low, unit) }} />
          <span>Low: {low.toFixed(1)}{unit}</span>
        </div>
      )}
      {avg !== null && (
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getOutTempColor(avg, unit) }} />
          <span>Avg: {avg.toFixed(1)}{unit}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart margins — match ConfigDrivenChart so all charts are the same width
// ---------------------------------------------------------------------------

const CHART_MARGIN = { top: 8, right: 55, bottom: 8, left: 15 };
const YAXIS_WIDTH = 42;
const XAXIS_HEIGHT = 30;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WeatherRangeChart({
  highData,
  lowData,
  field,
  unit = '',
  height = 300,
  reducedMotion: _reducedMotion = false,
}: WeatherRangeChartProps) {
  if (highData.length === 0) return null;

  const mergedData = mergeData(highData, lowData);
  const totalCount = mergedData.length;
  const { yMin, yMax, ticks } = computeYDomain(mergedData);

  const safeField = field.replace(/[^a-zA-Z0-9]/g, '_');
  const gradientId = `tempGradient_${safeField}`;
  const isTemp = TEMP_FIELDS.has(field) || unit.includes('°') || unit.toLowerCase().includes('c') || unit.toLowerCase().includes('f');

  // Compute gradient pixel coordinates from chart dimensions
  const plotTop = CHART_MARGIN.top;
  const plotBottom = height - CHART_MARGIN.bottom - XAXIS_HEIGHT;
  const gradientStops = isTemp ? buildGradientStops(yMin, yMax, unit, plotTop, plotBottom) : [];

  // Y-axis label from field name
  const yAxisLabel = isTemp ? 'Outside Temperature' : field;

  return (
    <div className="flex flex-col gap-2">
      <div className="sr-only">
        <table aria-label={`${field} range data`}>
          <caption>{field} high and low values for each period.</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">High</th>
              <th scope="col">Low</th>
              <th scope="col">Average</th>
            </tr>
          </thead>
          <tbody>
            {mergedData.map((row, i) => (
              <tr key={i}>
                <th scope="row">{formatFullDate(row.timestamp, totalCount)}</th>
                <td>{row.high?.toFixed(1) ?? '—'}</td>
                <td>{row.low?.toFixed(1) ?? '—'}</td>
                <td>{row.avg?.toFixed(1) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        role="img"
        aria-label={`${field} daily high and low range chart${unit ? ` in ${unit}` : ''}`}
        style={{ minWidth: 0, minHeight: 0, width: '100%', height }}
      >
        <ResponsiveContainer width="99%" height="100%">
          <ComposedChart data={mergedData} margin={CHART_MARGIN}>
            {isTemp && gradientStops.length > 0 && (
              <defs>
                <linearGradient id={gradientId} x1="0" y1={plotTop} x2="0" y2={plotBottom} gradientUnits="userSpaceOnUse">
                  {gradientStops.map((s, i) => (
                    <stop key={i} offset={s.offset} stopColor={s.color} />
                  ))}
                </linearGradient>
              </defs>
            )}

            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />

            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxisTick}
              minTickGap={50}
              height={XAXIS_HEIGHT}
              tick={{ fontSize: 11, fontFamily: CHART_FONT }}
              className="fill-muted-foreground"
            />

            <YAxis
              type="number"
              domain={[yMin, yMax]}
              ticks={ticks}
              interval={0}
              width={YAXIS_WIDTH}
              tick={{ fontSize: 10, fontFamily: CHART_FONT }}
              className="fill-muted-foreground"
              label={{
                value: yAxisLabel + (unit ? ` (${unit})` : ''),
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fontFamily: CHART_FONT, fill: 'var(--muted-foreground)' },
                offset: -5,
              }}
            />

            <Tooltip
              content={(tooltipProps) => (
                <CustomTooltip {...tooltipProps} unit={unit} totalCount={totalCount} />
              )}
            />

            <Area
              dataKey="base"
              stackId="range"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
              activeDot={false}
              dot={false}
              legendType="none"
            />
            <Area
              dataKey="range"
              stackId="range"
              stroke="none"
              fill={isTemp ? `url(#${gradientId})` : 'var(--temp-hi, #f59e0b)'}
              fillOpacity={0.85}
              isAnimationActive={false}
              activeDot={false}
              dot={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
