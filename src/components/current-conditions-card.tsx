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
//
// DataBag pattern (T0B.2): card self-extracts from:
//   dataBag["/api/v1/current"]  (observation, units, scene)
//   dataBag["/api/v1/forecast"] (todayHigh/Low, hourlyForecast, weatherText fallback)
// onRetry removed — page container manages data freshness in the DataBag model.

import { useMemo, useState, useEffect } from 'react';
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
import { formatTime } from '../utils/format-date';
import { formatNumber } from '../utils/format-number';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from './ui/card';
import { WeatherIcon } from './weather-icon';
import type { Observation, UnitsBlock, ArchiveRecord, HourlyForecastPoint, ForecastBundle, SceneDescriptor } from '../api/types';
import type { StationClock } from '../utils/station-clock';
import { stationMidnightMs } from '../utils/station-clock';
import { useArchive, useStation } from '../hooks/useWeatherData';
import { toWmoCode } from '../utils/weather-code';
import { selectWeatherIcon } from '../utils/icon-selection';
import type { CardComponentProps } from '../lib/card-registry';

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

// ---------------------------------------------------------------------------
// Temperature curve
// ---------------------------------------------------------------------------

interface CurvePoint {
  ts: number;
  past: number | null;
  future: number | null;
}

function makeFmtAxisTime(midnightMs: number) {
  return (ts: number): string => {
    const h = Math.round((ts - midnightMs) / 3_600_000);
    if (h === 0 || h === 24) return '12a';
    if (h === 6) return '6a';
    if (h === 12) return '12p';
    if (h === 18) return '6p';
    return '';
  };
}

function buildCurveData(
  todayArchive: ArchiveRecord[] | null,
  hourlyForecast: HourlyForecastPoint[] | null,
  nowTs: number,
  todayMidnightMs: number,
  currentTemp: number | null,
): CurvePoint[] {
  const tomorrowMs = todayMidnightMs + 24 * 3600 * 1000;
  const points: CurvePoint[] = [];

  if (todayArchive) {
    for (const rec of todayArchive) {
      const ts = new Date(rec.timestamp).getTime();
      if (ts < todayMidnightMs || ts > tomorrowMs) continue;
      const cv = asConverted(rec.outTemp as import('../api/types').ConvertedValue | number | null);
      const temp = cv?.value ?? null;
      points.push({ ts, past: temp, future: null });
    }
  }

  // Bridge point at "now" — connects past solid line to future dashed line
  // without a visible gap. Uses currentTemp for both past and future values.
  if (currentTemp !== null) {
    points.push({ ts: nowTs, past: currentTemp, future: currentTemp });
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
  stationClock?: StationClock;
  stationTz?: string;
}

function TempCurve({ todayArchive, hourlyForecast, currentTemp, tempUnit, stationClock, stationTz }: TempCurveProps) {
  const { t, i18n } = useTranslation('now');
  const locale = i18n.language;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    // ADR-075: display tick, not data refresh. Updates the "now" marker
    // position on the temperature curve without triggering any API call.
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const todayMidnight = useMemo(() => {
    if (stationClock) return stationMidnightMs(stationClock);
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [stationClock]);

  const data = useMemo(
    () => buildCurveData(todayArchive, hourlyForecast, now, todayMidnight, currentTemp),
    [todayArchive, hourlyForecast, now, todayMidnight, currentTemp],
  );

  const domainEnd = todayMidnight + 24 * 3600 * 1000;
  const ticks = [0, 6, 12, 18, 24].map((h) => todayMidnight + h * 3600 * 1000);
  const fmtAxisTime = useMemo(() => makeFmtAxisTime(todayMidnight), [todayMidnight]);

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
        paddingTop: '0.2rem',
        borderTop: '1px solid var(--border)',
        marginTop: 'auto',
        marginBottom: 'calc(-1 * var(--card-pad))',
      }}
    >
      {/* Chart: role="img" with aria-label for screen readers */}
      <div role="img" aria-label={t('tempCurveAriaLabel')}>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={data} margin={{ top: 6, right: 16, bottom: 16, left: 4 }}>
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

            {/* "Now" vertical reference line.
                Label position shifts dynamically to stay within chart bounds:
                - insideTopLeft:  text starts at the line, extends RIGHT (horizontalAnchor: start)
                - insideTopRight: text ends at the line, extends LEFT  (horizontalAnchor: end)
                Near either edge, flip so the text extends toward the chart interior. */}
            <ReferenceLine
              x={now}
              stroke="#dc2626"
              strokeWidth={1.25}
              strokeDasharray="2 2"
              label={{
                value: t('chartNowLabel'),
                position: (now - todayMidnight) / (24 * 3600 * 1000) > 0.85
                  ? 'insideTopRight'
                  : 'insideTopLeft',
                style: {
                  fontFamily: 'var(--font-chart)',
                  fontSize: 'var(--text-micro)',
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
              tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--foreground)' }}
              interval={0}
              scale="time"
            />

            <YAxis
              domain={[yMin, yMax]}
              ticks={yTicks}
              tickFormatter={(v: number) => `${v}°`}
              tickLine={false}
              axisLine={false}
              tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--foreground)' }}
              width={34}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Screen-reader fallback table — inline sr-only styles because className="sr-only"
           on <table> elements does not clip reliably (captions leak as visible ghost text). */}
      <div style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', margin: '-1px', padding: 0, border: 0 }}>
        <table>
          <caption>{t('tempCurveSrCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('tempCurveTable.time')}</th>
              <th scope="col">{tempUnit || '°'}</th>
              <th scope="col">{t('tempCurveTable.type')}</th>
            </tr>
          </thead>
          <tbody>
            {srRows.map((row) => {
              const timeStr = stationTz
                ? formatTime(row.ts, locale, stationTz)
                : new Intl.DateTimeFormat(locale, {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  }).format(new Date(row.ts));
              const temp = (row.past ?? row.future);
              const type = row.future !== null ? t('tempCurveTable.forecast') : t('tempCurveTable.actual');
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy props interface — kept for any non-Now-page callers.
// ---------------------------------------------------------------------------

export interface CurrentConditionsCardProps {
  observation: Observation | null;
  loading: boolean;
  error: Error | null;
  units?: UnitsBlock;
  /** Weather description text. */
  weatherText?: string | null;
  /** WMO weather code for the icon. */
  weatherCode?: number | string | null;
  /**
   * Whether it is currently night — from the BFF scene.daytime flag (actual
   * sunrise/sunset).  Defaults to false when absent (safe daytime fallback).
   */
  isNight?: boolean;
  /** Today's high temperature (raw number, native unit — from useTodayStats). */
  todayHigh?: number | null;
  /** Today's low temperature (raw number, native unit — from useTodayStats). */
  todayLow?: number | null;
  /** Hourly forecast for the curve future leg. */
  hourlyForecast?: HourlyForecastPoint[] | null;
  onRetry: () => void;
}

// ---------------------------------------------------------------------------
// Core render logic (shared by both prop shapes)
// ---------------------------------------------------------------------------

interface CurrentConditionsCardInternalProps {
  observation: Observation | null;
  loading: boolean;
  error: Error | null;
  units?: UnitsBlock;
  weatherText?: string | null;
  weatherCode?: number | string | null;
  isNight?: boolean;
  todayHigh?: number | null;
  todayLow?: number | null;
  hourlyForecast?: HourlyForecastPoint[] | null;
}

function CurrentConditionsCardContent({
  observation,
  loading,
  error,
  units,
  weatherText,
  weatherCode,
  isNight = false,
  todayHigh,
  todayLow,
  hourlyForecast,
}: CurrentConditionsCardInternalProps) {
  const { t, i18n } = useTranslation('now');

  // ADR-075: freshness-driven refetch is handled by useApiQuery inside useArchive.
  // The archiveStart24h window is stable (mount-time); useArchive triggers
  // background refetches when freshness.validUntil elapses.
  const archiveStart24h = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);
  const { data: tempArchive, stationClock } = useArchive({ from: archiveStart24h, aggregate_interval: '300', fields: 'outTemp' });
  const { data: station } = useStation();
  const stationTz = station?.timezone;

  // Temperature — via ConvertedValue; no client unit math
  const outTempCV = asConverted(observation?.outTemp ?? null);
  const tempUnit = outTempCV?.label ?? units?.outTemp ?? '';

  const tempDisplay = useMemo(() => {
    if (!outTempCV || outTempCV.value === null) return '—';
    return formatNumber(outTempCV.value, 1, i18n.language);
  }, [outTempCV, i18n.language]);

  // Raw float for the chart reference dot
  const currentTempRaw = outTempCV?.value ?? null;

  // Feels-like: best available — feelsLike (sustained wind) > appTemp > windchill > heatindex
  const feelsLikeCV = useMemo(() => {
    const fl = asConverted(observation?.feelsLike ?? null);
    if (fl !== null && fl.value !== null) return fl;
    const app = asConverted(observation?.appTemp ?? null);
    if (app !== null && app.value !== null) return app;
    const chill = asConverted(observation?.windchill ?? null);
    if (chill !== null && chill.value !== null) return chill;
    return asConverted(observation?.heatindex ?? null);
  }, [observation]);

  // High/Low display: integer + unit (e.g. "72°F")
  const tempUnitShort = tempUnit || '°';
  const highDisplay = todayHigh != null ? `${Math.round(todayHigh)}${tempUnitShort}` : null;
  const lowDisplay = todayLow != null ? `${Math.round(todayLow)}${tempUnitShort}` : null;

  return (
    <Card footprint="wide" rowSpan={2} aria-busy={loading}>
      {/* Card title */}
      <CardHeader>
        <CardTitle as="h2">{t('currentConditions')}</CardTitle>
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
          <p
            role="alert"
            className="text-muted-foreground"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-secondary)' }}
          >
            {t('error.currentConditions')}
          </p>
        ) : observation ? (
          <>
            {/* ── Top region: icon LEFT, text RIGHT ─────────────────────── */}
            <div className="flex items-center gap-[1.1rem] mb-2">
              {/* Weather icon — 96px mobile, 115px desktop (+20%) */}
              {weatherCode != null ? (
                <WeatherIcon
                  code={weatherCode}
                  isNight={isNight}
                  size={115}
                  className="shrink-0 size-[96px] md:size-[115px]"
                />
              ) : (
                <span
                  className="shrink-0 size-[96px] md:size-[115px]"
                  style={{ display: 'inline-block' }}
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
                    <span style={{ fontWeight: 600 }}>
                      {formatNumber(feelsLikeCV.value, 1, i18n.language)}{feelsLikeCV.label || '°'}
                    </span>
                  </p>
                )}

                {/* Condition sentence — slightly larger than supporting stats */}
                {weatherText && (
                  <p
                    className="text-foreground"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--text-section)',
                      fontWeight: 600,
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
                      className="text-muted-foreground"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--text-secondary)',
                        marginBottom: '-0.35rem',
                      }}
                    >
                      {highDisplay !== null && (
                        <span>
                          {t('hiLabel')}{' '}
                          <span style={{ color: 'var(--temp-hi)', fontWeight: 600 }}>{highDisplay}</span>
                        </span>
                      )}
                      {highDisplay !== null && lowDisplay !== null && (
                        <span> &nbsp; </span>
                      )}
                      {lowDisplay !== null && (
                        <span>
                          {t('loLabel')}{' '}
                          <span style={{ color: 'var(--temp-lo)', fontWeight: 600 }}>{lowDisplay}</span>
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

                {/* Dewpoint + Humidity — each on its own line */}
                {(() => {
                  const dewCV = asConverted(observation?.dewpoint ?? null);
                  const humCV = asConverted(observation?.outHumidity ?? null);
                  if ((dewCV === null || dewCV.value === null) && (humCV === null || humCV.value === null)) return null;
                  const lineStyle: React.CSSProperties = {
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--text-secondary)',
                    color: 'var(--muted-foreground)',
                  };
                  return (
                    <div>
                      {dewCV !== null && dewCV.value !== null && (
                        <p style={lineStyle}>
                          {t('observations.dewpoint')} {formatNumber(dewCV.value, 1, i18n.language)}{dewCV.label || '°'}
                        </p>
                      )}
                      {humCV !== null && humCV.value !== null && (
                        <p style={lineStyle}>
                          {t('observations.humidity')} {Math.round(humCV.value)}{humCV.label || '%'}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── Bottom region: temperature curve ──────────────────────── */}
            <TempCurve
              todayArchive={tempArchive ?? null}
              hourlyForecast={hourlyForecast ?? null}
              currentTemp={currentTempRaw}
              tempUnit={tempUnit}
              stationClock={stationClock}
              stationTz={stationTz}
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

// ---------------------------------------------------------------------------
// DataBag-aware component (CardComponentProps — T0B.2 contract)
// ---------------------------------------------------------------------------

export function CurrentConditionsCard(props: CardComponentProps): React.ReactElement;
export function CurrentConditionsCard(props: CurrentConditionsCardProps): React.ReactElement;
export function CurrentConditionsCard(props: CardComponentProps | CurrentConditionsCardProps): React.ReactElement {
  if ('dataBag' in props) {
    // DataBag path — self-extract from /api/v1/current and /api/v1/forecast
    const currentData = props.dataBag['/api/v1/current'] as {
      data?: Observation | null;
      units?: UnitsBlock;
      loading?: boolean;
      error?: unknown;
      scene?: SceneDescriptor | null;
    } | undefined;
    const forecastData = props.dataBag['/api/v1/forecast'] as {
      data?: ForecastBundle | null;
    } | undefined;

    const observation = currentData?.data ?? null;
    const forecast = forecastData?.data ?? null;
    const scene = currentData?.scene ?? null;
    const todayForecast = forecast?.daily?.[0] ?? null;

    // Derived values constructed in the card (per brief §"Critical details for each card")
    const weatherText = observation?.weatherText ?? todayForecast?.weatherText ?? null;
    const isNight = scene ? !scene.daytime : false;

    // The PoP (probability-of-precipitation) gate applies only to the
    // forecast-sourced fallback weatherCode. The conditions engine's
    // observation.weatherCode reflects live station sensor data and is
    // already the "right" call — it passes through unchanged, no gate.
    const weatherCode = observation?.weatherCode != null
      ? observation.weatherCode
      : selectWeatherIcon({
          weatherCode: toWmoCode(todayForecast?.weatherCode),
          precipProbability: todayForecast?.precipProbabilityMax ?? null,
          cloudCover: todayForecast?.cloudCover ?? null,
          isNight,
        }).code;
    const todayHigh = todayForecast?.tempMax ?? null;
    const todayLow = todayForecast?.tempMin ?? null;
    const hourlyForecast = forecast?.hourly ?? null;

    return (
      <CurrentConditionsCardContent
        observation={observation}
        loading={currentData?.loading ?? true}
        error={currentData?.error ? new Error('error') : null}
        units={currentData?.units}
        weatherText={weatherText}
        weatherCode={weatherCode}
        isNight={isNight}
        todayHigh={todayHigh}
        todayLow={todayLow}
        hourlyForecast={hourlyForecast}
      />
    );
  }
  // Legacy path — explicit props (onRetry is discarded — DataBag model has no per-card retry)
  return (
    <CurrentConditionsCardContent
      observation={props.observation}
      loading={props.loading}
      error={props.error}
      units={props.units}
      weatherText={props.weatherText}
      weatherCode={props.weatherCode}
      isNight={props.isNight}
      todayHigh={props.todayHigh}
      todayLow={props.todayLow}
      hourlyForecast={props.hourlyForecast}
    />
  );
}

export default CurrentConditionsCard;
