// WeatherRangeChart.tsx — T-B1 through T-B4
//
// Renders a Cartesian arearange chart showing daily high/low temperature ranges.
// Uses Recharts ComposedChart with stacked Areas:
//   - Invisible "base" area (transparent fill, no stroke) pushes the visible
//     band up to the correct Y position.
//   - Visible "range" area (high - low) filled with an SVG linearGradient
//     whose stops map temperature thresholds to Y pixel positions, producing
//     Belchertown's 15-band cool→warm temperature color effect.
//
// Per Belchertown wiki: weatherRange renders as arearange (area_display=1) or
// columnrange (default), NOT as a polar/radial chart unless the operator
// explicitly sets polar=true. This component handles the arearange variant.
//
// Accessibility (WCAG 2.1 AA):
//   - Chart wrapper has role="img" + aria-label (WCAG 1.1.1)
//   - sr-only <table> provides all values to screen readers (WCAG 1.1.1)
//   - Custom tooltip with keyboard-accessible Recharts Tooltip
//   - Color gradient paired with position (not color-only state signal)
//   - Both light and dark themes use CSS variables; temperature colors are
//     Belchertown's documented zone colors (not theme-dependent — they are
//     semantic, conveying temperature magnitude, not UI state)

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
// Temperature color zones — Belchertown's get_outTemp_color() zones
// Same visual gradient for both °F and °C; different thresholds.
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

/**
 * Returns the temperature zone color for a given temperature value and unit.
 * Mirrors Belchertown's get_outTemp_color() JavaScript function.
 */
function getOutTempColor(temp: number, unit: string): string {
  const zones = unit.includes('C') ? TEMP_ZONES_C : TEMP_ZONES_F;
  for (let i = zones.length - 1; i >= 0; i--) {
    if (temp >= zones[i].value) return zones[i].color;
  }
  return zones[0].color;
}

// ---------------------------------------------------------------------------
// Merged data row
// ---------------------------------------------------------------------------

interface RangeRow {
  timestamp: number;   // epoch seconds
  high: number | null;
  low: number | null;
  avg: number | null;
  // Stacked area values: base = low (invisible, positions the band), range = high - low
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
    return {
      timestamp: h.dateTime,
      high,
      low,
      avg,
      base,
      range,
    };
  });
}

// ---------------------------------------------------------------------------
// Y-axis scaling — Belchertown's algorithm
// tickInterval = Math.ceil(Math.round(max / 5) / 5) * 5
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

  // Belchertown tick interval calculation
  const tickInterval = Math.max(5, Math.ceil(Math.round(rawMax / 5) / 5) * 5);

  const yMin = Math.floor(rawMin / tickInterval) * tickInterval;
  const yMax = Math.ceil(rawMax / tickInterval) * tickInterval;

  const ticks: number[] = [];
  for (let t = yMin; t <= yMax; t += tickInterval) {
    ticks.push(t);
  }

  return { yMin, yMax, ticks };
}

// ---------------------------------------------------------------------------
// Date formatter — "3 Nov", "10 Nov" style matching Belchertown
// ---------------------------------------------------------------------------

function formatXAxisTick(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const day = d.getDate();
  const month = d.toLocaleString('default', { month: 'short' });
  return `${day} ${month}`;
}

function formatFullDate(timestamp: number, totalCount: number): string {
  const d = new Date(timestamp * 1000);
  if (totalCount <= 12) {
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('default', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// SVG gradient def builder
// Produces a vertical linearGradient with stops mapped to temperature zones.
// gradientUnits="userSpaceOnUse" so positions are in chart pixel coordinates.
// ---------------------------------------------------------------------------

interface GradientDefProps {
  id: string;
  yMin: number;
  yMax: number;
  unit: string;
  // Chart SVG coordinate space: top and bottom Y pixel values of the plot area
  plotTop: number;
  plotBottom: number;
}

function TempGradientDef({ id, yMin, yMax, unit, plotTop, plotBottom }: GradientDefProps) {
  const zones = unit.includes('C') ? TEMP_ZONES_C : TEMP_ZONES_F;
  const domainRange = yMax - yMin;
  if (domainRange <= 0) return null;

  // Only include zones that are within the visible domain, plus the boundary stops
  const stops: Array<{ offset: string; color: string }> = [];

  // Work from top (hottest) to bottom (coldest) for SVG gradient direction y1→y2
  // The gradient goes from y1=plotTop (hottest, high temp) to y2=plotBottom (coldest, low temp)
  // So offset=0% is the top (high temp) and offset=100% is the bottom (low temp)
  // We build stops from the perspective of temperature ascending (bottom→top)
  // then convert to gradient offsets (top→bottom = 100%→0%)

  const visibleZones = zones.filter(
    (z, i) => {
      const nextVal = zones[i + 1]?.value ?? Infinity;
      // Include zone if it overlaps [yMin, yMax]
      return z.value <= yMax && nextVal >= yMin;
    }
  );

  if (visibleZones.length === 0) {
    // Fallback: single color for the whole area
    const midTemp = (yMin + yMax) / 2;
    const color = getOutTempColor(midTemp, unit);
    return (
      <defs>
        <linearGradient id={id} x1="0" y1={plotTop} x2="0" y2={plotBottom} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
      </defs>
    );
  }

  // Build stops: one per zone boundary that falls in range.
  // The gradient y1=plotTop (hot/high) to y2=plotBottom (cold/low).
  // A stop at a given temperature maps to offset = (yMax - temp) / domainRange * 100%
  // because offset=0% is at y1=plotTop (= yMax) and offset=100% is at y2=plotBottom (= yMin).
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.value > yMax + 5) break; // well above visible area

    const clampedTemp = Math.max(yMin, Math.min(yMax, z.value));
    const offsetFraction = (yMax - clampedTemp) / domainRange;
    const offsetPct = (offsetFraction * 100).toFixed(2) + '%';

    stops.push({ offset: offsetPct, color: z.color });
  }

  // Ensure we have stops at 0% and 100% for a complete gradient
  if (stops.length === 0 || stops[0].offset !== '0%') {
    stops.unshift({ offset: '0%', color: getOutTempColor(yMax, unit) });
  }
  if (stops[stops.length - 1].offset !== '100.00%' && stops[stops.length - 1].offset !== '100%') {
    stops.push({ offset: '100%', color: getOutTempColor(yMin, unit) });
  }

  return (
    <defs>
      <linearGradient
        id={id}
        x1="0"
        y1={plotTop}
        x2="0"
        y2={plotBottom}
        gradientUnits="userSpaceOnUse"
      >
        {stops.map((s, i) => (
          <stop key={i} offset={s.offset} stopColor={s.color} />
        ))}
      </linearGradient>
    </defs>
  );
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

function CustomTooltip(props: { active?: boolean; payload?: Array<{ payload?: CustomTooltipPayload }>; unit: string; totalCount: number }) {
  const { active, payload, unit, totalCount } = props;
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
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: getOutTempColor(high, unit) }}
          />
          <span>High: {high.toFixed(1)}{unit}</span>
        </div>
      )}
      {low !== null && (
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: getOutTempColor(low, unit) }}
          />
          <span>Low: {low.toFixed(1)}{unit}</span>
        </div>
      )}
      {avg !== null && (
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: getOutTempColor(avg, unit) }}
          />
          <span>Avg: {avg.toFixed(1)}{unit}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart margins (fixed) — per Recharts rules:
//   no negative margins; XAxis height provides label space.
// ---------------------------------------------------------------------------

const CHART_MARGIN = { top: 8, right: 16, bottom: 4, left: 8 };

// Y-axis width: enough for labels like "-10" or "110"
const YAXIS_WIDTH = 42;

// Approximate plot area dimensions for the gradient def.
// These are estimates used only to set gradient coordinates;
// the actual pixel values depend on the container size.
// We compute approximate plotTop/Bottom for a given container height.
function computePlotBounds(containerHeight: number): { plotTop: number; plotBottom: number } {
  // plotTop = margin.top (XAxis lives at the bottom, not top)
  // plotBottom = containerHeight - margin.bottom - XAxis.height (default 30)
  const xAxisHeight = 30;
  const plotTop = CHART_MARGIN.top;
  const plotBottom = containerHeight - CHART_MARGIN.bottom - xAxisHeight;
  return { plotTop, plotBottom };
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

/**
 * WeatherRangeChart — Cartesian arearange chart.
 *
 * Displays a filled area band between daily high and low temperature values,
 * colored with Belchertown's 15-band temperature gradient (blue=cold → red=hot).
 *
 * Accessibility: role="img" + aria-label on the chart wrapper; sr-only data
 * table provides all values to screen readers (WCAG 1.1.1).
 */
export function WeatherRangeChart({
  highData,
  lowData,
  field,
  unit = '',
  height = 300,
  // reducedMotion accepted but Recharts areas have no entry animation to suppress
  reducedMotion: _reducedMotion = false,
}: WeatherRangeChartProps) {
  // Guard: no data
  if (highData.length === 0) return null;

  const mergedData = mergeData(highData, lowData);
  const totalCount = mergedData.length;
  const { yMin, yMax, ticks } = computeYDomain(mergedData);
  const { plotTop, plotBottom } = computePlotBounds(height);

  // Stable gradient ID — use field name to avoid collisions when multiple
  // WeatherRangeCharts exist on the same page (e.g., outTemp + windchill).
  // We sanitize the field name to a valid SVG id fragment.
  const safeField = field.replace(/[^a-zA-Z0-9]/g, '_');
  const gradientId = `tempGradient_${safeField}`;

  const isTemp = unit.includes('°') || unit.toLowerCase().includes('c') || unit.toLowerCase().includes('f');

  return (
    <div className="flex flex-col gap-2">
      {/*
        Screen-reader data table — wrapped in sr-only div because sr-only
        directly on <table> fails (table display overrides clip). WCAG 1.1.1.
      */}
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

      {/*
        Chart wrapper — role="img" + aria-label (WCAG 1.1.1).
        minWidth:0, minHeight:0 prevent flex container from reporting 0 to
        ResizeObserver (Recharts rule §6.1 item 8).
      */}
      <div
        role="img"
        aria-label={`${field} daily high and low range chart${unit ? ` in ${unit}` : ''}`}
        style={{ minWidth: 0, minHeight: 0, width: '100%', height }}
      >
        {/*
          ResponsiveContainer width="99%" per Recharts rules §6.1 item 9:
          100% causes layout calculation failure; 99% forces recalculation.
        */}
        <ResponsiveContainer width="99%" height="100%">
          <ComposedChart data={mergedData} margin={CHART_MARGIN}>
            {/*
              SVG defs: temperature gradient.
              gradientUnits="userSpaceOnUse" with Y coordinates in chart pixel
              space. plotTop/plotBottom are approximate — the gradient covers
              the full plot area regardless of exact pixel position.
            */}
            {isTemp && (
              <TempGradientDef
                id={gradientId}
                yMin={yMin}
                yMax={yMax}
                unit={unit}
                plotTop={plotTop}
                plotBottom={plotBottom}
              />
            )}

            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />

            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxisTick}
              minTickGap={50}
              tick={{ fontSize: 11, fontFamily: 'var(--font-chart)' }}
              className="fill-muted-foreground"
            />

            {/*
              YAxis: do NOT use hide={true} — known Recharts bug (#428) causes
              XAxis labels to vanish. width={YAXIS_WIDTH} carves space for labels.
            */}
            <YAxis
              type="number"
              domain={[yMin, yMax]}
              ticks={ticks}
              interval={0}
              width={YAXIS_WIDTH}
              tickFormatter={(v: number) => unit ? `${v}${unit}` : String(v)}
              tick={{ fontSize: 10, fontFamily: 'var(--font-chart)' }}
              className="fill-muted-foreground"
            />

            <Tooltip
              content={(props) => (
                <CustomTooltip {...props} unit={unit} totalCount={totalCount} />
              )}
            />

            {/*
              Stacked Area arearange technique:
              1. "base" area (fill=transparent, no stroke) is invisible but its
                 area pushes the stacked visual band up to the low-temp baseline.
              2. "range" area (fill=gradient) renders only the high-low band.

              Both use stackId="range" so they stack additively.
              activeDot={false} prevents Recharts from drawing dot markers on
              hover — the gradient fill is the primary visual; dots would obscure it.
            */}
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
