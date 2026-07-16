// TideChart.tsx — shared 72h tide chart (T7.2 DASHBOARD-MANUAL §12).
// Reused standalone by all four activity tabs (boating/surfing/fishing/
// beachSafety) — each embeds its own copy of the tide forecast.
//
// Renders TidePrediction[] as a filled area curve, with high/low points
// marked via a Scatter overlay, plus an optional observed-water-level line
// from WaterLevel[] (CO-OPS station observations) when available.
//
// Chart conventions (DESIGN-MANUAL "Charts (Recharts)"):
//   - ResponsiveContainer via ChartContainer, aria-label on the wrapper.
//   - Lexend / --text-chart-label (14px) tick labels — no rem values in
//     Recharts tick props.
//   - --chart-1..5 for series colors.
//   - No negative margins; XAxis `height` for label space, not margin.bottom.
//   - sr-only data table alongside the chart (WCAG 1.1.1 / coding rules §5.5).

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ComposedChart,
  Area,
  Line,
  Scatter,
  XAxis,
  YAxis,
  ReferenceLine,
  Legend,
} from 'recharts';
import { ChartContainer } from '../../../charts/chart-container';
import { formatValue } from '../../../../utils/format';
import { formatTime } from '../../../../utils/format-date';
import { formatNumber } from '../../../../utils/format-number';
import { buildHourTicks } from './hour-ticks';
import { useAlmanac } from '../../../../hooks/useWeatherData';
import { MoonPhaseIcon } from '../../../moon-phase-icon';
import type { TidePrediction, WaterLevel } from '../../../../api/types';

interface TotalWaterLevelPoint {
  time: string;
  height: number;
  residual: number;
}

export interface TideChartProps {
  predictions: TidePrediction[];
  waterLevels?: WaterLevel[];
  totalWaterLevelForecast?: TotalWaterLevelPoint[];
  ariaLabel: string;
  /** i18n.language — required for locale-correct number/time formatting. */
  locale: string;
  /** Station IANA timezone — tide times display in station-local time. */
  stationTz: string;
  /** Height unit label (e.g. "ft", "m"). Defaults to "ft". */
  heightUnit?: string;
}

interface PredictionPoint {
  ts: number;
  height: number;
}

interface ExtremaPoint {
  ts: number;
  height: number;
  type: string;
}

interface LevelPoint {
  ts: number;
  level: number;
}

export function TideChart({
  predictions,
  waterLevels = [],
  totalWaterLevelForecast,
  ariaLabel,
  locale,
  stationTz,
  heightUnit = 'ft',
}: TideChartProps) {
  const { t } = useTranslation('marine');

  // Almanac: current moon phase for spring/neap context in the tide table.
  // The phase barely changes over 72 hours, so one value serves all table rows.
  const { data: almanacData } = useAlmanac();
  const moonIllumination = almanacData?.moon.illuminationPercent ?? null;
  const moonPhaseName = almanacData?.moon.phaseName ?? null;

  const predictionPoints: PredictionPoint[] = useMemo(
    () =>
      predictions.map((p) => ({
        ts: new Date(p.time).getTime(),
        height: p.height,
      })),
    [predictions],
  );

  const extremaPoints: ExtremaPoint[] = useMemo(
    () =>
      predictions
        .filter((p) => p.type === 'high' || p.type === 'low')
        .map((p) => ({
          ts: new Date(p.time).getTime(),
          height: p.height,
          type: p.type as string,
        })),
    [predictions],
  );

  // Filtered TidePrediction[] for the visible table — preserves the ISO `time`
  // string so formatTime() and Intl.DateTimeFormat work without re-parsing.
  const extremaPredictions = useMemo(
    () => predictions.filter((p) => p.type === 'high' || p.type === 'low'),
    [predictions],
  );

  const levelPoints: LevelPoint[] = useMemo(
    () =>
      waterLevels.map((w) => ({
        ts: new Date(w.time).getTime(),
        level: w.height,
      })),
    [waterLevels],
  );

  const compositePoints = useMemo(
    () =>
      (totalWaterLevelForecast ?? []).map((p) => ({
        ts: new Date(p.time).getTime(),
        total: p.height,
      })),
    [totalWaterLevelForecast],
  );

  const nowTs = Date.now(); // ADR-075: display tick, not data refresh
  const hasComposite = compositePoints.length > 0;
  const hasObserved = levelPoints.length > 0;

  if (predictionPoints.length === 0) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('tide.noTideData')}
      </p>
    );
  }

  const minTs = predictionPoints[0].ts;
  const maxTs = predictionPoints[predictionPoints.length - 1].ts;
  const ticks = buildHourTicks(minTs, maxTs);

  const tickFormatter = (ts: number) => formatTime(new Date(ts), locale, stationTz);
  // formatNumber (Intl.NumberFormat), not .toFixed() — tick labels render to
  // the DOM and must respect the locale's decimal separator (rules/coding.md
  // §6.1/§6.4: .toFixed() is a FAIL condition for any display text).
  const yTickFormatter = (v: number | string) =>
    typeof v === 'number' ? formatNumber(v, 1, locale) : v;

  // Compute UTC timestamps for each midnight boundary in the station timezone
  // within [minTs, maxTs]. Uses 'en-CA' locale to produce stable ISO-format
  // YYYY-MM-DD date keys for comparison across all target browsers.
  // Binary search finds the exact boundary within ±30 s for a clean chart line.
  const midnightBoundaries: Array<{ ts: number; label: string }> = (() => {
    const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: stationTz });
    const labelFmt = new Intl.DateTimeFormat(locale, {
      timeZone: stationTz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const boundaries: Array<{ ts: number; label: string }> = [];
    let prevDate = dateFmt.format(new Date(minTs));

    for (let t = minTs + 3_600_000; t <= maxTs; t += 3_600_000) {
      const curDate = dateFmt.format(new Date(t));
      if (curDate !== prevDate) {
        // Binary search: narrow to ±30 s accuracy
        let lo = t - 3_600_000;
        let hi = t;
        while (hi - lo > 30_000) {
          const mid = Math.floor((lo + hi) / 2);
          if (dateFmt.format(new Date(mid)) === prevDate) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        boundaries.push({ ts: hi, label: labelFmt.format(new Date(hi)) });
        prevDate = curDate;
      }
    }
    return boundaries;
  })();

  // Day formatter for the visible tide table (DASHBOARD-MANUAL §2 — always
  // supply station IANA TZ; en-CA not needed here since we want locale output).
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: stationTz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Shared aria-label for the moon phase icon in each table row.
  // All rows show the same phase; the label is descriptive for screen readers.
  const moonAriaLabel = moonPhaseName
    ? `${t('tide.moonColumn')}: ${moonPhaseName}${moonIllumination !== null ? `, ${moonIllumination}%` : ''}`
    : t('tide.moonColumn');

  return (
    <>
      <ChartContainer height={250} ariaLabel={ariaLabel}>
        {/*
          margin.top=24  — room for midnight-boundary day labels (position: 'top')
          margin.bottom=20 — room for Low-tide labels rendered below trough points
        */}
        <ComposedChart margin={{ top: 12, right: 12, bottom: 36, left: 12 }}>
          <XAxis
            dataKey="ts"
            type="number"
            domain={[minTs, maxTs]}
            ticks={ticks}
            tickFormatter={tickFormatter}
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--muted-foreground)' }}
            height={28}
          />
          <YAxis
            domain={['auto', 'auto']}
            tickFormatter={yTickFormatter}
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--muted-foreground)' }}
            width={40}
            label={{
              value: heightUnit,
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 'var(--text-label)', fill: 'var(--muted-foreground)' },
            }}
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />

          {/* Day boundary lines — one ReferenceLine per midnight in station TZ.
              Visitor sees e.g. "Thu Jul 17" at the transition so times on a
              72-hour chart are unambiguous without date context in the tick. */}
          {midnightBoundaries.map(({ ts, label }) => (
            <ReferenceLine
              key={ts}
              x={ts}
              stroke="var(--border)"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: label,
                position: 'bottom',
                fontSize: 11,
                fill: 'var(--muted-foreground)',
                fontFamily: 'var(--font-chart)',
                offset: 20,
              }}
            />
          ))}

          <Area
            data={predictionPoints}
            type="monotone"
            dataKey="height"
            name={t('tide.predictedTide')}
            stroke="var(--chart-2)"
            fill="var(--chart-2)"
            fillOpacity={0.25}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls
          />

          {hasObserved && (
            <Line
              data={levelPoints}
              type="monotone"
              dataKey="level"
              name={t('tide.observedLevel')}
              stroke="var(--chart-3)"
              strokeWidth={2.5}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}

          {hasComposite && (
            <Line
              data={compositePoints}
              type="monotone"
              dataKey="total"
              name={t('tide.totalWaterLevel', { defaultValue: 'Total Water Level' })}
              stroke="var(--chart-4, var(--chart-1))"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}

          {nowTs >= minTs && nowTs <= maxTs && (
            <ReferenceLine
              x={nowTs}
              stroke="var(--foreground)"
              strokeDasharray="2 4"
              strokeWidth={1}
              label={{
                value: t('tide.now', { defaultValue: 'Now' }),
                position: 'top',
                fontSize: 11,
                fill: 'var(--foreground)',
              }}
            />
          )}

          {(hasObserved || hasComposite) && (
            <Legend
              wrapperStyle={{ fontSize: 'var(--text-label)', fontFamily: 'var(--font-chart)' }}
              iconType="plainline"
            />
          )}

          {/* Extrema scatter — alternate label positions to prevent overlap.
              High labels go ABOVE the peak (natural — peaks are near chart top).
              Low labels go BELOW the trough (natural — troughs are near chart
              bottom); the 20 px bottom margin provides clearance for these.
              Each label includes the height value for at-a-glance reading. */}
          <Scatter
            data={extremaPoints}
            dataKey="height"
            name={t('tide.tideExtrema')}
            fill="var(--chart-2)"
            isAnimationActive={false}
            shape={(props: unknown) => {
              const { cx, cy, payload } = props as {
                cx: number;
                cy: number;
                payload: ExtremaPoint;
              };
              const isHigh = payload.type === 'high';
              const typeLabel = isHigh ? t('tide.tideHigh') : t('tide.tideLow');
              const heightLabel = formatNumber(payload.height, 2, locale);
              const label = `${typeLabel} ${heightLabel} ${heightUnit}`;
              // Highs: label 16 px above the dot (room above peak).
              // Lows: label 20 px below the dot (into bottom-margin area).
              const textY = isHigh ? cy - 16 : cy + 20;
              return (
                <g>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill="var(--chart-2)"
                    stroke="var(--background)"
                    strokeWidth={1.5}
                  />
                  <text
                    x={cx}
                    y={textY}
                    textAnchor="middle"
                    fontFamily="var(--font-chart)"
                    fontSize={11}
                    fill="var(--foreground)"
                  >
                    {label}
                  </text>
                </g>
              );
            }}
          />
        </ComposedChart>
      </ChartContainer>

      {/* sr-only data table fallback — WCAG 1.1.1 (rules/coding.md §5.5).
          Unchanged: lists every interpolated point for maximum screen-reader
          coverage. The visible table below shows extrema only. */}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{t('tide.srTimeColumn')}</th>
            <th scope="col">{t('tide.srHeightColumn', { unit: heightUnit })}</th>
            <th scope="col">{t('tide.srTypeColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {predictions.map((p, i) => (
            <tr key={`${p.time}-${i}`}>
              <td>{formatTime(new Date(p.time), locale, stationTz)}</td>
              <td>{formatValue(p.height, 'default', locale)}</td>
              <td>
                {p.type === 'high'
                  ? t('tide.tideHigh')
                  : p.type === 'low'
                    ? t('tide.tideLow')
                    : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Visible tide table — date-column layout aligned with the chart.
          Columns = one per day. Rows = High, Low, Moon.
          Each cell shows time + height for each extremum that day. */}
      {extremaPredictions.length > 0 && (() => {
        // Group extrema by station-local date
        const dayGroups = new Map<string, { label: string; highs: typeof extremaPredictions; lows: typeof extremaPredictions }>();
        for (const p of extremaPredictions) {
          const d = new Date(p.time);
          const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: stationTz }).format(d);
          const dateLabel = dayFormatter.format(d);
          if (!dayGroups.has(dateKey)) {
            dayGroups.set(dateKey, { label: dateLabel, highs: [], lows: [] });
          }
          const group = dayGroups.get(dateKey)!;
          if (p.type === 'high') group.highs.push(p);
          else group.lows.push(p);
        }
        const days = Array.from(dayGroups.entries()).sort(([a], [b]) => a.localeCompare(b));

        const thStyle: React.CSSProperties = {
          fontSize: 'var(--text-label)',
          fontWeight: 600,
          textTransform: 'uppercase',
          textAlign: 'left',
          padding: '0.375rem 0.5rem',
          whiteSpace: 'nowrap',
        };
        const tdStyle: React.CSSProperties = {
          fontSize: 'var(--text-body)',
          fontWeight: 400,
          padding: '0.25rem 0.5rem',
          fontFeatureSettings: '"tnum"',
          verticalAlign: 'top',
          whiteSpace: 'nowrap',
        };

        return (
          <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className="text-muted-foreground" style={thStyle}>&nbsp;</th>
                  {days.map(([key, { label }]) => (
                    <th key={key} scope="col" className="text-foreground" style={{ ...thStyle, textAlign: 'center' }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* High tide row */}
                <tr>
                  <th scope="row" className="text-muted-foreground" style={thStyle}>{t('tide.tideHigh')}</th>
                  {days.map(([key, { highs }]) => (
                    <td key={key} className="text-foreground" style={{ ...tdStyle, textAlign: 'center' }}>
                      {highs.length > 0
                        ? highs.map((h, i) => (
                            <div key={i}>
                              {formatNumber(h.height, 2, locale)} {heightUnit}
                              <span className="text-muted-foreground ml-1">{formatTime(new Date(h.time), locale, stationTz)}</span>
                            </div>
                          ))
                        : '—'}
                    </td>
                  ))}
                </tr>
                {/* Low tide row */}
                <tr className="bg-muted/30">
                  <th scope="row" className="text-muted-foreground" style={thStyle}>{t('tide.tideLow')}</th>
                  {days.map(([key, { lows }]) => (
                    <td key={key} className="text-foreground" style={{ ...tdStyle, textAlign: 'center' }}>
                      {lows.length > 0
                        ? lows.map((l, i) => (
                            <div key={i}>
                              {formatNumber(l.height, 2, locale)} {heightUnit}
                              <span className="text-muted-foreground ml-1">{formatTime(new Date(l.time), locale, stationTz)}</span>
                            </div>
                          ))
                        : '—'}
                    </td>
                  ))}
                </tr>
                {/* Moon phase row */}
                <tr>
                  <th scope="row" className="text-muted-foreground" style={thStyle}>{t('tide.moonColumn')}</th>
                  {days.map(([key]) => (
                    <td key={key} style={{ ...tdStyle, textAlign: 'center' }}>
                      <div className="flex items-center justify-center gap-1">
                        <MoonPhaseIcon
                          size={18}
                          illuminationPercent={moonIllumination}
                          phaseName={moonPhaseName}
                          ariaLabel={moonAriaLabel}
                        />
                        {moonPhaseName && (
                          <span className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>
                            ({moonPhaseName})
                          </span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}
    </>
  );
}

export default TideChart;
