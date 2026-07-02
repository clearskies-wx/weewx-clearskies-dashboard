// WeatherRangeChart.tsx
//
// Renders a Cartesian arearange chart showing daily high/low ranges.
// Temperature zones are FLAT COLOR BANDS (separate Area components per zone),
// NOT gradients. Matches Highcharts zones behavior from Belchertown.

import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ChartContainer } from './chart-container';
import { formatNumber } from '../../utils/format-number';

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
  /**
   * IANA timezone identifier for the station (ADR-075 T3.8).
   * All toLocale* calls use this timezone so date labels render in station
   * local time rather than browser local time.
   */
  stationTz?: string;
}

// ---------------------------------------------------------------------------
// Temperature color zones — Belchertown's Highcharts zones (flat bands)
// ---------------------------------------------------------------------------

interface TempZone { min: number; max: number; color: string; }

const TEMP_ZONES_F: TempZone[] = [
  { min: -Infinity, max: 0,   color: '#1278c8' },
  { min: 0,         max: 25,  color: '#30bfef' },
  { min: 25,        max: 32,  color: '#1fafdd' },
  { min: 32,        max: 40,  color: 'rgba(0,172,223,1)' },
  { min: 40,        max: 50,  color: '#71bc3c' },
  { min: 50,        max: 55,  color: 'rgba(90,179,41,0.8)' },
  { min: 55,        max: 65,  color: 'rgba(131,173,45,1)' },
  { min: 65,        max: 70,  color: 'rgba(206,184,98,1)' },
  { min: 70,        max: 75,  color: 'rgba(255,174,0,0.9)' },
  { min: 75,        max: 80,  color: 'rgba(255,153,0,0.9)' },
  { min: 80,        max: 85,  color: 'rgba(255,127,0,1)' },
  { min: 85,        max: 90,  color: 'rgba(255,79,0,0.9)' },
  { min: 90,        max: 95,  color: 'rgba(255,69,69,1)' },
  { min: 95,        max: 110, color: 'rgba(255,104,104,1)' },
  { min: 110,       max: Infinity, color: 'rgba(218,113,113,1)' },
];

const TEMP_ZONES_C: TempZone[] = [
  { min: -Infinity, max: -5,   color: '#1278c8' },
  { min: -5,        max: -3.8, color: '#30bfef' },
  { min: -3.8,      max: 0,    color: '#1fafdd' },
  { min: 0,         max: 4.4,  color: 'rgba(0,172,223,1)' },
  { min: 4.4,       max: 10,   color: '#71bc3c' },
  { min: 10,        max: 12.7, color: 'rgba(90,179,41,0.8)' },
  { min: 12.7,      max: 18.3, color: 'rgba(131,173,45,1)' },
  { min: 18.3,      max: 21.1, color: 'rgba(206,184,98,1)' },
  { min: 21.1,      max: 23.8, color: 'rgba(255,174,0,0.9)' },
  { min: 23.8,      max: 26.6, color: 'rgba(255,153,0,0.9)' },
  { min: 26.6,      max: 29.4, color: 'rgba(255,127,0,1)' },
  { min: 29.4,      max: 32.2, color: 'rgba(255,79,0,0.9)' },
  { min: 32.2,      max: 35,   color: 'rgba(255,69,69,1)' },
  { min: 35,        max: 43.3, color: 'rgba(255,104,104,1)' },
  { min: 43.3,      max: Infinity, color: 'rgba(218,113,113,1)' },
];

const TEMP_FIELDS = new Set([
  'outTemp', 'inTemp', 'dewpoint', 'windchill', 'heatindex',
  'appTemp', 'extraTemp1', 'extraTemp2', 'extraTemp3', 'extraTemp4',
]);

function getOutTempColor(temp: number, unit: string): string {
  const zones = unit.includes('C') ? TEMP_ZONES_C : TEMP_ZONES_F;
  for (let i = zones.length - 1; i >= 0; i--) {
    if (temp >= zones[i].min) return zones[i].color;
  }
  return zones[0].color;
}

const CHART_FONT = 'var(--font-chart, var(--font-sans))';

// ---------------------------------------------------------------------------
// Data merging + zone band computation
// ---------------------------------------------------------------------------

interface ZoneBandRow {
  timestamp: number;
  high: number | null;
  low: number | null;
  avg: number | null;
  base: number;
  [key: string]: number | null; // zone_0, zone_1, etc.
}

function buildZoneBandData(
  highData: Array<{ dateTime: number; value: number | null }>,
  lowData: Array<{ dateTime: number; value: number | null }>,
  zones: TempZone[],
  visibleZoneIndices: number[],
): ZoneBandRow[] {
  return highData.map((h, i) => {
    const low = lowData[i]?.value ?? null;
    const high = h.value;
    const avg = high !== null && low !== null ? (high + low) / 2 : null;

    const row: ZoneBandRow = {
      timestamp: h.dateTime,
      high,
      low,
      avg,
      base: low ?? 0,
    };

    if (high === null || low === null) {
      for (const zi of visibleZoneIndices) {
        row[`zone_${zi}`] = null;
      }
      return row;
    }

    for (const zi of visibleZoneIndices) {
      const z = zones[zi];
      const clampedLow = Math.max(low, z.min);
      const clampedHigh = Math.min(high, z.max);
      row[`zone_${zi}`] = Math.max(0, clampedHigh - clampedLow);
    }

    return row;
  });
}

// ---------------------------------------------------------------------------
// Y-axis auto-scaling
// ---------------------------------------------------------------------------

function computeYDomain(highs: number[], lows: number[]): {
  yMin: number;
  yMax: number;
  ticks: number[];
} {
  if (highs.length === 0 || lows.length === 0) {
    return { yMin: 0, yMax: 100, ticks: [0, 20, 40, 60, 80, 100] };
  }
  const rawMax = Math.max(...highs);
  const rawMin = Math.min(...lows);
  const yMin = Math.floor(rawMin / 5) * 5;
  const yMax = Math.ceil(rawMax / 5) * 5;
  const ticks: number[] = [];
  for (let t = yMin; t <= yMax; t += 5) ticks.push(t);
  return { yMin, yMax, ticks };
}

// ---------------------------------------------------------------------------
// Date formatters
// ---------------------------------------------------------------------------

/**
 * ADR-075 T3.8: stationTz is threaded from the chart component so all date
 * labels render in the station's local timezone rather than the browser's.
 */
function formatXAxisTick(timestamp: number, stationTz: string, locale: string): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: stationTz });
}

function formatFullDate(timestamp: number, totalCount: number, stationTz: string, locale: string): string {
  const d = new Date(timestamp * 1000);
  if (totalCount <= 12) return d.toLocaleString(locale, { month: 'long', year: 'numeric', timeZone: stationTz });
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: stationTz });
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip(props: any) {
  const { active, payload, unit, totalCount, stationTz } = props as {
    active?: boolean;
    payload?: Array<{ payload?: ZoneBandRow }>;
    unit: string;
    totalCount: number;
    stationTz: string;
  };
  const { t, i18n } = useTranslation('charts');
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload ?? null;
  if (!row) return null;
  const { timestamp, high, low, avg } = row;

  return (
    <div role="tooltip" className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-semibold mb-1">{formatFullDate(timestamp, totalCount, stationTz, i18n.language)}</div>
      {high !== null && (
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getOutTempColor(high, unit) }} />
          <span>{t('tooltip.high', { value: `${formatNumber(high, 1, i18n.language)}${unit}` })}</span>
        </div>
      )}
      {low !== null && (
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getOutTempColor(low, unit) }} />
          <span>{t('tooltip.low', { value: `${formatNumber(low, 1, i18n.language)}${unit}` })}</span>
        </div>
      )}
      {avg !== null && (
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getOutTempColor(avg, unit) }} />
          <span>{t('tooltip.avg', { value: `${formatNumber(avg, 1, i18n.language)}${unit}` })}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart layout — matches ConfigDrivenChart
// ---------------------------------------------------------------------------

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
  stationTz = 'UTC',
}: WeatherRangeChartProps) {
  const { t, i18n } = useTranslation('charts');
  const isMobile = useIsMobile();
  if (highData.length === 0) return null;

  const isTemp = TEMP_FIELDS.has(field) || unit.includes('°') || unit.toLowerCase().includes('c') || unit.toLowerCase().includes('f');
  const zones = isTemp ? (unit.includes('C') ? TEMP_ZONES_C : TEMP_ZONES_F) : [];

  const allHighs = highData.map((d) => d.value).filter((v): v is number => v !== null);
  const allLows = lowData.map((d) => d.value).filter((v): v is number => v !== null);
  const { yMin, yMax, ticks } = computeYDomain(allHighs, allLows);

  const dataMaxHigh = allHighs.length > 0 ? Math.max(...allHighs) : yMax;
  const dataMinLow = allLows.length > 0 ? Math.min(...allLows) : yMin;

  // Only render zones that overlap with the data range
  const visibleZoneIndices = zones
    .map((z, i) => ({ z, i }))
    .filter(({ z }) => z.max > dataMinLow && z.min < dataMaxHigh)
    .map(({ i }) => i);

  const mergedData = buildZoneBandData(highData, lowData, zones, visibleZoneIndices);
  const totalCount = mergedData.length;

  const yAxisLabel = isTemp ? t('weatherRangeChart.outsideTemperature') : field;

  const chartMargin = isMobile
    ? { top: 4, right: 4, bottom: 4, left: 4 }
    : { top: 8, right: 15, bottom: 8, left: 15 };
  const phantomAxisWidth = isMobile ? 30 : 60;

  return (
    <div className="flex flex-col gap-2">
      <div className="sr-only">
        <table aria-label={t('weatherRangeChart.tableAriaLabel', { field })}>
          <caption>{t('weatherRangeChart.tableCaption', { field })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('weatherRangeChart.columnDate')}</th>
              <th scope="col">{t('weatherRangeChart.columnHigh')}</th>
              <th scope="col">{t('weatherRangeChart.columnLow')}</th>
              <th scope="col">{t('weatherRangeChart.columnAverage')}</th>
            </tr>
          </thead>
          <tbody>
            {mergedData.map((row, i) => (
              <tr key={i}>
                <th scope="row">{formatFullDate(row.timestamp, totalCount, stationTz, i18n.language)}</th>
                <td>{row.high !== null ? formatNumber(row.high, 1, i18n.language) : '—'}</td>
                <td>{row.low !== null ? formatNumber(row.low, 1, i18n.language) : '—'}</td>
                <td>{row.avg !== null ? formatNumber(row.avg, 1, i18n.language) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ChartContainer
        height={height}
        ariaLabel={
          unit
            ? t('weatherRangeChart.ariaLabelWithUnit', { field, unit })
            : t('weatherRangeChart.ariaLabel', { field })
        }
      >
          <ComposedChart data={mergedData} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />

            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v: number) => formatXAxisTick(v, stationTz, i18n.language)}
              minTickGap={isMobile ? 20 : 50}
              height={XAXIS_HEIGHT}
              tick={{ fontSize: 14, fontFamily: CHART_FONT }}
              className="fill-muted-foreground"
            />

            <YAxis
              type="number"
              domain={[yMin, yMax]}
              allowDataOverflow
              ticks={ticks}
              interval={0}
              width={isMobile ? 35 : undefined}
              tick={{ fontSize: 14, fontFamily: CHART_FONT }}
              className="fill-muted-foreground"
              label={
                !isMobile
                  ? {
                      value: yAxisLabel + (unit ? ` (${unit})` : ''),
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

            {/* Phantom right YAxis — matches ConfigDrivenChart width */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={false}
              axisLine={false}
              tickLine={false}
              width={phantomAxisWidth}
            />

            <Tooltip
              content={(tooltipProps) => (
                <CustomTooltip {...tooltipProps} unit={unit} totalCount={totalCount} stationTz={stationTz} />
              )}
            />

            {/* Invisible base area — positions the visible bands at the correct Y level.
                Height = low temperature value, so the stacked zones start from the low. */}
            <Area
              dataKey="base"
              stackId="zones"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
              activeDot={false}
              dot={false}
              legendType="none"
            />

            {/* One Area per visible temperature zone — FLAT SOLID COLOR per band.
                Stacked bottom-to-top. Each zone's height = how much of the
                high-low range falls within that zone's temperature bounds. */}
            {visibleZoneIndices.map((zi) => (
              <Area
                key={`zone_${zi}`}
                dataKey={`zone_${zi}`}
                stackId="zones"
                stroke="none"
                fill={zones[zi].color}
                fillOpacity={0.85}
                isAnimationActive={false}
                activeDot={false}
                dot={false}
                legendType="none"
              />
            ))}
          </ComposedChart>
      </ChartContainer>
    </div>
  );
}
