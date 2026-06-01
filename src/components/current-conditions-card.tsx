// current-conditions-card.tsx — C1 Current Conditions card.
//
// Layout: icon-left (112px WeatherIcon) + text-right block, with an integrated
// temperature curve chart across the bottom of the card.
//
// Design tokens (LOCKED 2026-05-31, design-tokens-typography.md):
//   Temperature numeral: Outfit (--font-display) 4.75rem (--text-stat-hero) 700
//   Unit (°F / °C):      Outfit (--font-display) 1.9rem  (--text-stat-unit)  400
//   Card title:          Manrope (--font-sans)   0.82rem (--text-card-title) 600
//   Body/labels:         Manrope (--font-sans)   various sizes
//   Chart axis text:     Lexend  (--font-chart)  0.875rem                   400
//
// A11y (rules/coding.md §5):
//   - aria-live on the temperature block announces SSE updates
//   - Temperature div has aria-label with spoken form including unit
//   - Hi/Lo: color carries meaning, paired with text label (not color-only)
//   - Chart container: role="img" + aria-label summary
//   - <table class="sr-only"> fallback for chart data
//   - All values via ConvertedValue.formatted — no client unit math
//   - Missing values → "—" or element hidden

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from 'recharts';
import { asConverted } from '../api/types';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import { WeatherIcon } from './weather-icon';
import type { Observation, UnitsBlock, ArchiveRecord, HourlyForecastPoint } from '../api/types';

// ---------------------------------------------------------------------------
// Sub-components: loading / error states
// ---------------------------------------------------------------------------

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        {t('retry')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Temperature curve
// ---------------------------------------------------------------------------

interface CurvePoint {
  ts: number;
  past: number | null;
  future: number | null;
}

function fmtAxisTime(ts: number): string {
  const h = new Date(ts).getHours();
  if (h === 0) return '12a';
  if (h === 6) return '6a';
  if (h === 12) return '12p';
  if (h === 18) return '6p';
  return '';
}

function buildCurveData(
  todayArchive: ArchiveRecord[] | null,
  hourlyForecast: HourlyForecastPoint[] | null,
  nowTs: number,
  todayMidnightMs: number,
): CurvePoint[] {
  const tomorrowMs = todayMidnightMs + 24 * 3600 * 1000;
  const points: CurvePoint[] = [];

  if (todayArchive) {
    for (const rec of todayArchive) {
      const ts = new Date(rec.timestamp).getTime();
      if (ts < todayMidnightMs || ts > tomorrowMs) continue;
      const temp = typeof rec.outTemp === 'number' ? rec.outTemp : null;
      points.push({ ts, past: temp, future: null });
    }
  }

  if (hourlyForecast) {
    for (const h of hourlyForecast) {
      const ts = new Date(h.validTime).getTime();
      if (ts < nowTs - 30 * 60 * 1000 || ts > tomorrowMs) continue;
      points.push({ ts, past: null, future: h.outTemp });
    }
  }

  return points.sort((a, b) => a.ts - b.ts);
}

interface TempCurveProps {
  todayArchive: ArchiveRecord[] | null;
  hourlyForecast: HourlyForecastPoint[] | null;
  currentTemp: number | null;
  tempUnit: string;
}

function TempCurve({ todayArchive, hourlyForecast, currentTemp, tempUnit }: TempCurveProps) {
  const { t } = useTranslation('now');
  const now = Date.now();

  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const data = useMemo(
    () => buildCurveData(todayArchive, hourlyForecast, now, todayMidnight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayArchive, hourlyForecast, todayMidnight],
  );

  const domainEnd = todayMidnight + 24 * 3600 * 1000;
  const ticks = [0, 6, 12, 18, 24].map((h) => todayMidnight + h * 3600 * 1000);

  const allTemps = data
    .flatMap((d) => [d.past, d.future])
    .filter((v): v is number => v !== null);
  const yMin = allTemps.length > 0 ? Math.floor(Math.min(...allTemps) / 5) * 5 - 5 : 50;
  const yMax = allTemps.length > 0 ? Math.ceil(Math.max(...allTemps) / 5) * 5 + 5 : 90;
  const yStep = 10;
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    yTicks.push(v);
  }

  // Build sr-only table rows — every ~4 data points
  const srRows = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 8)) === 0);

  if (data.length === 0) {
    // No data: silent degrade — render nothing in this region
    return null;
  }

  return (
    <div
      style={{
        flexShrink: 0,
        paddingTop: '0.6rem',
        borderTop: '1px solid var(--border)',
        marginTop: '0.5rem',
      }}
    >
      {/* Section label */}
      <p
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-micro)',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          marginBottom: '0.25rem',
        }}
      >
        {t('todaysTemperature')}
      </p>

      {/* Chart: role="img" with aria-label for screen readers */}
      <div role="img" aria-label={t('tempCurveAriaLabel')}>
        <ResponsiveContainer width="100%" height={112}>
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -12 }}>
            {/* Past actual: solid blue filled area */}
            <Area
              type="monotone"
              dataKey="past"
              stroke="#2563eb"
              strokeWidth={2.5}
              fill="rgba(37,99,235,0.15)"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* Future forecast: dashed lighter blue line, no fill */}
            <Line
              type="monotone"
              dataKey="future"
              stroke="#5b91e8"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* "Now" vertical reference line */}
            <ReferenceLine
              x={now}
              stroke="#dc2626"
              strokeWidth={1.25}
              strokeDasharray="2 2"
              label={{
                value: 'Now',
                position: 'insideTopLeft',
                style: {
                  fontFamily: 'var(--font-chart)',
                  fontSize: '11px',
                  fontWeight: 700,
                  fill: 'var(--foreground)',
                },
              }}
            />

            {/* Current temperature dot */}
            {currentTemp !== null && (
              <ReferenceDot
                x={now}
                y={currentTemp}
                r={4}
                fill="#dc2626"
                stroke="var(--background)"
                strokeWidth={1.5}
              />
            )}

            <XAxis
              dataKey="ts"
              type="number"
              domain={[todayMidnight, domainEnd]}
              ticks={ticks}
              tickFormatter={fmtAxisTime}
              tickLine={false}
              axisLine={false}
              tick={{ fontFamily: 'var(--font-chart)', fontSize: 12, fill: 'var(--foreground)' }}
              interval={0}
              scale="time"
            />

            <YAxis
              domain={[yMin, yMax]}
              ticks={yTicks}
              tickFormatter={(v: number) => `${v}°`}
              tickLine={false}
              axisLine={false}
              tick={{ fontFamily: 'var(--font-chart)', fontSize: 12, fill: 'var(--foreground)' }}
              width={34}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Screen-reader fallback table */}
      <table className="sr-only">
        <caption>{t('tempCurveSrCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">{tempUnit || '°'}</th>
            <th scope="col">Type</th>
          </tr>
        </thead>
        <tbody>
          {srRows.map((row) => {
            const timeStr = new Intl.DateTimeFormat(undefined, {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }).format(new Date(row.ts));
            const temp = (row.past ?? row.future);
            const type = row.future !== null ? 'Forecast' : 'Actual';
            return (
              <tr key={row.ts}>
                <td>{timeStr}</td>
                <td>{temp !== null ? Math.round(temp) : '—'}</td>
                <td>{type}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CurrentConditionsCardProps {
  observation: Observation | null;
  loading: boolean;
  error: Error | null;
  units?: UnitsBlock;
  /** Weather description text. */
  weatherText?: string | null;
  /** WMO weather code for the icon. */
  weatherCode?: number | string | null;
  /** Today's high temperature (raw number, native unit — from useTodayStats). */
  todayHigh?: number | null;
  /** Today's low temperature (raw number, native unit — from useTodayStats). */
  todayLow?: number | null;
  /** Today's archive records for the curve past leg. */
  todayArchive?: ArchiveRecord[] | null;
  /** Hourly forecast for the curve future leg. */
  hourlyForecast?: HourlyForecastPoint[] | null;
  onRetry: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CurrentConditionsCard({
  observation,
  loading,
  error,
  units,
  weatherText,
  weatherCode,
  todayHigh,
  todayLow,
  todayArchive,
  hourlyForecast,
  onRetry,
}: CurrentConditionsCardProps) {
  const { t } = useTranslation('now');
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 20;

  // Temperature — via ConvertedValue; no client unit math
  const outTempCV = asConverted(observation?.outTemp ?? null);
  const tempUnit = outTempCV?.label ?? units?.outTemp ?? '';

  // Integer display (no decimal for temperature)
  const tempDisplay = useMemo(() => {
    if (!outTempCV || outTempCV.value === null) return '—';
    return Math.round(outTempCV.value).toString();
  }, [outTempCV]);

  // Raw float for the chart reference dot
  const currentTempRaw = outTempCV?.value ?? null;

  // Feels-like: best available — appTemp > windchill > heatindex (ADR-050)
  const feelsLikeCV = useMemo(() => {
    const app = asConverted(observation?.appTemp ?? null);
    if (app !== null && app.value !== null) return app;
    const chill = asConverted(observation?.windchill ?? null);
    if (chill !== null && chill.value !== null) return chill;
    return asConverted(observation?.heatindex ?? null);
  }, [observation]);

  // High/Low display: integer + degree symbol
  const highDisplay = todayHigh != null ? `${Math.round(todayHigh)}°` : null;
  const lowDisplay = todayLow != null ? `${Math.round(todayLow)}°` : null;

  return (
    <Card footprint="wide" rowSpan={2} aria-busy={loading}>
      {/* Card title — Manrope 0.82rem semibold with bottom rule */}
      <CardHeader>
        <h2
          className="text-foreground"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-card-title)',
            fontWeight: 600,
            paddingBottom: '0.4rem',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {t('currentConditions')}
        </h2>
      </CardHeader>

      <CardContent className="flex flex-col gap-0">
        {loading ? (
          <>
            <span className="sr-only" role="status">
              {t('loading.currentConditions')}
            </span>
            <div className="flex gap-4 mb-4">
              <TileSkeleton className="h-28 w-28 shrink-0" />
              <div className="flex flex-col gap-2 flex-1">
                <TileSkeleton className="h-16 w-36" />
                <TileSkeleton className="h-4 w-28" />
                <TileSkeleton className="h-4 w-40" />
              </div>
            </div>
          </>
        ) : error ? (
          <TileError message={t('error.currentConditions')} onRetry={onRetry} />
        ) : observation ? (
          <>
            {/* ── Top region: icon LEFT, text RIGHT ─────────────────────── */}
            <div className="flex items-center gap-[1.1rem] mb-3">
              {/* Weather icon 112px — flex-shrink:0 */}
              {weatherCode != null ? (
                <WeatherIcon
                  code={weatherCode}
                  isNight={isNight}
                  size={112}
                  className="shrink-0"
                />
              ) : (
                <span
                  className="shrink-0"
                  style={{ display: 'inline-block', width: 112, height: 112 }}
                  aria-hidden="true"
                />
              )}

              {/* Text block */}
              <div className="min-w-0 flex flex-col gap-1">
                {/* Temperature: Outfit 4.75rem bold (--text-stat-hero) */}
                <div
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={
                    outTempCV !== null && outTempCV.value !== null
                      ? t('temperature.ariaLabel', { temp: tempDisplay, unit: tempUnit })
                      : undefined
                  }
                  className="flex items-start leading-none"
                >
                  <span
                    className="text-foreground"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-stat-hero)',
                      fontWeight: 700,
                      letterSpacing: '-0.03em',
                      lineHeight: 0.9,
                    }}
                  >
                    {tempDisplay}
                  </span>
                  <span
                    className="text-muted-foreground"
                    aria-hidden="true"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-stat-unit)',
                      fontWeight: 400,
                      marginTop: '0.35rem',
                    }}
                  >
                    {tempUnit || '°'}
                  </span>
                </div>

                {/* Feels-like — ADR-050: text-only, no icon */}
                {feelsLikeCV !== null && feelsLikeCV.value !== null && (
                  <p
                    aria-live="polite"
                    aria-atomic="true"
                    className="text-muted-foreground"
                    style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-secondary)' }}
                  >
                    {t('feelsLike')}{' '}
                    <span style={{ fontWeight: 500 }}>
                      {Math.round(feelsLikeCV.value)}{feelsLikeCV.label || '°'}
                    </span>
                  </p>
                )}

                {/* Condition sentence */}
                {weatherText && (
                  <p
                    className="text-foreground"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--text-body)',
                      lineHeight: 1.35,
                    }}
                  >
                    {weatherText}
                  </p>
                )}

                {/* High / Low — red high, blue low.
                    Color is NOT the only indicator: text label "High"/"Low" also present. */}
                {(highDisplay !== null || lowDisplay !== null) && (
                  <>
                    {/* Visual display — aria-hidden; sr-only sibling carries the spoken text */}
                    <p
                      aria-hidden="true"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--text-secondary)',
                        fontWeight: 600,
                      }}
                    >
                      {highDisplay !== null && (
                        <span style={{ color: '#c81e1e' }}>
                          {t('hiLabel')} {highDisplay}
                        </span>
                      )}
                      {highDisplay !== null && lowDisplay !== null && (
                        <span className="text-muted-foreground"> &nbsp; </span>
                      )}
                      {lowDisplay !== null && (
                        <span style={{ color: '#1d4ed8' }}>
                          {t('loLabel')} {lowDisplay}
                        </span>
                      )}
                    </p>
                    {/* Screen-reader text for High/Low */}
                    <span className="sr-only">
                      {highDisplay !== null && t('hiAria', { temp: highDisplay })}
                      {highDisplay !== null && lowDisplay !== null && '. '}
                      {lowDisplay !== null && t('loAria', { temp: lowDisplay })}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* ── Bottom region: temperature curve ──────────────────────── */}
            <TempCurve
              todayArchive={todayArchive ?? null}
              hourlyForecast={hourlyForecast ?? null}
              currentTemp={currentTempRaw}
              tempUnit={tempUnit}
            />
          </>
        ) : (
          <p
            className="text-muted-foreground"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-secondary)' }}
          >
            {t('noData.observation')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
