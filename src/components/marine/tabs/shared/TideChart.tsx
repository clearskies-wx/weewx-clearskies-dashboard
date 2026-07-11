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
} from 'recharts';
import { ChartContainer } from '../../../charts/chart-container';
import { formatValue } from '../../../../utils/format';
import { formatTime } from '../../../../utils/format-date';
import { buildHourTicks } from './hour-ticks';
import type { TidePrediction, WaterLevel } from '../../../../api/types';

export interface TideChartProps {
  predictions: TidePrediction[];
  waterLevels?: WaterLevel[];
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
  ariaLabel,
  locale,
  stationTz,
  heightUnit = 'ft',
}: TideChartProps) {
  const { t } = useTranslation('marine');

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

  const levelPoints: LevelPoint[] = useMemo(
    () =>
      waterLevels.map((w) => ({
        ts: new Date(w.time).getTime(),
        level: w.height,
      })),
    [waterLevels],
  );

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

  const allHeights = [
    ...predictionPoints.map((p) => p.height),
    ...levelPoints.map((p) => p.level),
  ];
  const yMin = Math.min(...allHeights);
  const yMax = Math.max(...allHeights);
  const yPad = Math.max((yMax - yMin) * 0.1, 0.5);

  const tickFormatter = (ts: number) => formatTime(new Date(ts), locale, stationTz);

  return (
    <>
      <ChartContainer height={250} ariaLabel={ariaLabel}>
        <ComposedChart margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
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
            domain={[yMin - yPad, yMax + yPad]}
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--muted-foreground)' }}
            width={40}
            label={{
              value: heightUnit,
              angle: -90,
              position: 'insideLeft',
              style: { fontFamily: 'var(--font-chart)', fontSize: 12, fill: 'var(--muted-foreground)' },
            }}
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />

          <Area
            data={predictionPoints}
            type="monotone"
            dataKey="height"
            name={t('tide.predictedTide')}
            stroke="var(--chart-1)"
            fill="var(--chart-1)"
            fillOpacity={0.25}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls
          />

          {levelPoints.length > 0 && (
            <Line
              data={levelPoints}
              type="monotone"
              dataKey="level"
              name={t('tide.observedLevel')}
              stroke="var(--chart-3)"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}

          <Scatter
            data={extremaPoints}
            dataKey="height"
            name={t('tide.tideExtrema')}
            fill="var(--chart-2)"
            isAnimationActive={false}
            shape={(props: unknown) => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: ExtremaPoint };
              const label = payload.type === 'high' ? t('tide.tideHigh') : t('tide.tideLow');
              return (
                <g>
                  <circle cx={cx} cy={cy} r={4} fill="var(--chart-2)" stroke="var(--background)" strokeWidth={1.5} />
                  <text
                    x={cx}
                    y={cy - 10}
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

      {/* sr-only data table fallback — WCAG 1.1.1 (rules/coding.md §5.5) */}
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
    </>
  );
}

export default TideChart;
