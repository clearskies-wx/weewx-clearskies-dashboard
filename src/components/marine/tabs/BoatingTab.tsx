// BoatingTab.tsx — Boating activity tab content (T7.2 DASHBOARD-MANUAL §12).
//
// Full boating data ensemble for a marine location: active advisories, wind
// (current + 72h forecast), wave forecast (height + period), live buoy
// observations, barometric pressure trend, visibility, a standalone 72h tide
// chart, the NWS marine text forecast, and a general weather panel.
//
// Data sources: useMarineDetail(locationId) (/marine/{id}) and
// useTideDetail(locationId) (/tides/{id}). Rip current probability / total
// water level (NWPS v1.5) are NOT part of either bundle — those fields live
// on BeachSafetyDetailData only — so they are omitted here (nothing to show)
// rather than fabricated.
//
// A11y (rules/coding.md §5):
//   - Every panel heading is a real <h3> (the tab/accordion header above it
//     is already h3, so these are document-order siblings, not skipped
//     levels).
//   - Charts: role="img" wrapper (via ChartContainer) + sr-only data table.
//   - Text forecast sections use native <details>/<summary> — keyboard and
//     screen-reader accessible with no extra ARIA wiring needed.
//   - Pressure trend and buoy stat tiles pair every icon with a text label
//     (color is never the only signal).

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { ArrowUp, ArrowDown, ArrowRight, CaretDown } from '@phosphor-icons/react';
import { useMarineDetail, useTideDetail, useStation } from '../../../hooks/useWeatherData';
import { formatValue } from '../../../utils/format';
import { formatTime } from '../../../utils/format-date';
import { cardinalFromDegrees } from '../../../utils/wind';
import { ChartContainer } from '../../charts/chart-container';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';
import { buildHourTicks } from './shared/hour-ticks';
import type { MarineForecastPoint } from '../../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BoatingTabProps {
  locationId: string;
  /** Active marine-zone alert headlines for this location (from MarineLocationSummary.activeAlerts). */
  alerts?: string[];
}

// ---------------------------------------------------------------------------
// Shared small pieces
// ---------------------------------------------------------------------------

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card-glass rounded-xl ring-1 ring-foreground/10 p-[var(--card-pad)] flex flex-col gap-3">
      <h3 className="font-semibold text-foreground" style={{ fontSize: 'var(--text-card-title)' }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
        {label}
      </dt>
      <dd
        className="text-foreground font-semibold"
        style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
      >
        {value}
        {unit && (
          <span className="text-muted-foreground font-normal ml-1" style={{ fontSize: 'var(--text-label)' }}>
            {unit}
          </span>
        )}
      </dd>
    </div>
  );
}

function TileSkeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`} aria-hidden="true" />;
}

function InlineError({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) {
  return (
    <div role="alert" className="flex flex-col gap-2 items-start" style={{ fontSize: 'var(--text-body)' }}>
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        style={{ fontSize: 'var(--text-label)' }}
      >
        {retryLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wind forecast chart (single series, 72h)
// ---------------------------------------------------------------------------

interface WindChartProps {
  forecast: MarineForecastPoint[];
  locale: string;
  stationTz: string;
  ariaLabel: string;
  windUnit: string;
}

function WindForecastChart({ forecast, locale, stationTz, ariaLabel, windUnit }: WindChartProps) {
  const { t } = useTranslation('marine');

  const points = useMemo(
    () =>
      forecast.map((f) => ({
        ts: new Date(f.time).getTime(),
        windSpeed: f.windSpeed,
      })),
    [forecast],
  );

  if (points.length === 0) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('boating.noForecastData')}
      </p>
    );
  }

  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const ticks = buildHourTicks(minTs, maxTs);
  const tickFormatter = (ts: number) => formatTime(new Date(ts), locale, stationTz);

  return (
    <>
      <ChartContainer height={180} ariaLabel={ariaLabel}>
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
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
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--muted-foreground)' }}
            width={32}
          />
          <Area
            type="monotone"
            dataKey="windSpeed"
            stroke="var(--chart-2)"
            fill="var(--chart-2)"
            fillOpacity={0.25}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls
          />
        </AreaChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{t('boating.srTimeColumn')}</th>
            <th scope="col">{t('boating.srWindSpeedColumn', { unit: windUnit })}</th>
          </tr>
        </thead>
        <tbody>
          {forecast.map((f, i) => (
            <tr key={`${f.time}-${i}`}>
              <td>{formatTime(new Date(f.time), locale, stationTz)}</td>
              <td>{formatValue(f.windSpeed, 'wind', locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------
// Wave forecast chart (dual-axis: height area + period line, 72h)
// ---------------------------------------------------------------------------

interface WaveChartProps {
  forecast: MarineForecastPoint[];
  locale: string;
  stationTz: string;
  ariaLabel: string;
  heightUnit: string;
}

function WaveForecastChart({ forecast, locale, stationTz, ariaLabel, heightUnit }: WaveChartProps) {
  const { t } = useTranslation('marine');

  const points = useMemo(
    () =>
      forecast.map((f) => ({
        ts: new Date(f.time).getTime(),
        waveHeight: f.waveHeight,
        wavePeriod: f.wavePeriod,
      })),
    [forecast],
  );

  if (points.length === 0) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('boating.noForecastData')}
      </p>
    );
  }

  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const ticks = buildHourTicks(minTs, maxTs);
  const tickFormatter = (ts: number) => formatTime(new Date(ts), locale, stationTz);

  return (
    <>
      <ChartContainer height={220} ariaLabel={ariaLabel}>
        <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
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
            yAxisId="height"
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--muted-foreground)' }}
            width={36}
            label={{
              value: heightUnit,
              angle: -90,
              position: 'insideLeft',
              style: { fontFamily: 'var(--font-chart)', fontSize: 12, fill: 'var(--muted-foreground)' },
            }}
          />
          <YAxis
            yAxisId="period"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--muted-foreground)' }}
            width={36}
            label={{
              value: t('boating.secondsAbbr'),
              angle: 90,
              position: 'insideRight',
              style: { fontFamily: 'var(--font-chart)', fontSize: 12, fill: 'var(--muted-foreground)' },
            }}
          />
          <Area
            yAxisId="height"
            type="monotone"
            dataKey="waveHeight"
            name={t('waveHeight')}
            stroke="var(--chart-1)"
            fill="var(--chart-1)"
            fillOpacity={0.25}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            yAxisId="period"
            type="monotone"
            dataKey="wavePeriod"
            name={t('boating.wavePeriod')}
            stroke="var(--chart-2)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Legend
            verticalAlign="bottom"
            height={24}
            iconType="plainline"
            wrapperStyle={{ fontFamily: 'var(--font-chart)', fontSize: 'var(--text-label)', color: 'var(--muted-foreground)' }}
          />
        </ComposedChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{t('boating.srTimeColumn')}</th>
            <th scope="col">{t('boating.srWaveHeightColumn', { unit: heightUnit })}</th>
            <th scope="col">{t('boating.srWavePeriodColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {forecast.map((f, i) => (
            <tr key={`${f.time}-${i}`}>
              <td>{formatTime(new Date(f.time), locale, stationTz)}</td>
              <td>{formatValue(f.waveHeight, 'default', locale)}</td>
              <td>{formatValue(f.wavePeriod, 'default', locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pressure trend indicator — icon + text label, never color-only.
// ---------------------------------------------------------------------------

function PressureTrend({ tendency, t }: { tendency: number | null; t: (key: string) => string }) {
  if (tendency === null || tendency === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
        <ArrowRight aria-hidden="true" focusable="false" className="size-4" />
        {t('boating.pressureSteady')}
      </span>
    );
  }
  if (tendency > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-foreground" style={{ fontSize: 'var(--text-label)' }}>
        <ArrowUp aria-hidden="true" focusable="false" className="size-4" />
        {t('boating.pressureRising')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-foreground" style={{ fontSize: 'var(--text-label)' }}>
      <ArrowDown aria-hidden="true" focusable="false" className="size-4" />
      {t('boating.pressureFalling')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// BoatingTab
// ---------------------------------------------------------------------------

export function BoatingTab({ locationId, alerts = [] }: BoatingTabProps) {
  const { t, i18n } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const locale = i18n.language;

  const { data: marine, units: marineUnits, loading: marineLoading, error: marineError, refetch: refetchMarine } =
    useMarineDetail(locationId);
  const { data: tide, units: tideUnits, loading: tideLoading, error: tideError, refetch: refetchTide } =
    useTideDetail(locationId);
  const { data: station } = useStation();

  const stationTz = station?.timezone ?? 'UTC';

  const observation = marine?.observation ?? null;
  const forecast = marine?.forecast ?? [];
  const textForecast = marine?.textForecast ?? [];
  const locationName = marine?.locationName ?? '';

  const windUnit = marineUnits?.windSpeed ?? 'kn';
  const heightUnit = marineUnits?.waveHeight ?? 'ft';
  const pressureUnit = marineUnits?.pressure ?? 'mb';
  const visibilityUnit = marineUnits?.visibility ?? 'nm';
  const tempUnit = marineUnits?.temperature ?? '';
  const tideHeightUnit = tideUnits?.height ?? heightUnit;

  const windDirCardinal = cardinalFromDegrees(observation?.windDirection ?? null);
  const windDirLabel = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : null;
  const meanWaveDirCardinal = cardinalFromDegrees(observation?.meanWaveDirection ?? null);
  const meanWaveDirLabel = meanWaveDirCardinal ? tCommon(`directions.${meanWaveDirCardinal}`) : null;

  const updatedLabel = observation?.time ? formatTime(new Date(observation.time), locale, stationTz) : null;

  // At least one forecast point must carry a real wind speed for the 72h
  // wind chart to be worth rendering — otherwise it's an empty axis.
  const hasWindForecast = forecast.some((f) => f.windSpeed !== null);

  // General weather panel self-hides when none of its three fields have
  // data (no weatherCode field exists on MarineObservation yet — omitted
  // rather than fabricated).
  const hasWeatherData =
    observation !== null &&
    (observation.airTemp !== null || observation.windSpeed !== null || observation.windDirection !== null);

  // Whole-tab loading state — both bundles are foundational to every panel below.
  if (marineLoading || tideLoading) {
    return (
      <div className="flex flex-col gap-[var(--gap-grid)]">
        <span className="sr-only" role="status">
          {t('boating.loading')}
        </span>
        <TileSkeleton className="h-24" />
        <TileSkeleton className="h-48" />
        <TileSkeleton className="h-48" />
        <TileSkeleton className="h-32" />
      </div>
    );
  }

  if (marineError) {
    return <InlineError message={t('boating.unableToLoad')} onRetry={refetchMarine} retryLabel={tCommon('retry')} />;
  }

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
      {/* 1. Active advisories — top, prominent */}
      <AlertsPanel alerts={alerts} />

      {/* 2. Wind panel — current stats only. The 72h forecast chart lives in
          its own Panel below (title lives in the Panel's h3, not a nested
          h4) and self-hides when the forecast bundle carries no wind data —
          when hidden, these current-condition tiles are the wind info. */}
      <Panel title={t('windSpeed')}>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          <StatTile
            label={t('windSpeed')}
            value={formatValue(observation?.windSpeed ?? null, 'wind', locale)}
            unit={windUnit}
          />
          <StatTile
            label={t('boating.gust')}
            value={formatValue(observation?.windGust ?? null, 'wind', locale)}
            unit={windUnit}
          />
          <StatTile label={t('boating.direction')} value={windDirLabel ?? '—'} />
        </dl>
      </Panel>

      {/* 2b. Wind forecast chart — own Panel, own h3 title. Hidden entirely
          when every forecast point has a null windSpeed (nothing to plot);
          the Wind panel above already covers current wind in that case. */}
      {hasWindForecast && (
        <Panel title={t('boating.windForecastTitle')}>
          <WindForecastChart
            forecast={forecast}
            locale={locale}
            stationTz={stationTz}
            windUnit={windUnit}
            ariaLabel={t('boating.windForecastAriaLabel', { location: locationName })}
          />
        </Panel>
      )}

      {/* 3. Wave forecast chart */}
      <Panel title={t('boating.waveForecastTitle')}>
        <WaveForecastChart
          forecast={forecast}
          locale={locale}
          stationTz={stationTz}
          heightUnit={heightUnit}
          ariaLabel={t('boating.waveForecastAriaLabel', { location: locationName })}
        />
      </Panel>

      {/* 4. Live buoy observations — only the fields this buoy network
          actually reports (wave height/period/direction, water temp).
          Wind/pressure/air temp/visibility are NDBC fields many offshore
          buoys (e.g. station 46253) never populate — they already have
          dedicated panels above (Wind) and below (Conditions) sourced from
          the same observation, so omitting them here isn't a data loss. */}
      <Panel
        title={
          observation
            ? t('boating.buoyObservationsTitled', { id: observation.stationId })
            : t('boating.buoyObservations')
        }
      >
        {observation ? (
          <>
            {updatedLabel && (
              <p className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
                {t('lastUpdated', { time: updatedLabel })}
              </p>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <StatTile
                label={t('waveHeight')}
                value={formatValue(observation.waveHeight, 'default', locale)}
                unit={heightUnit}
              />
              <StatTile
                label={t('boating.dominantPeriod')}
                value={formatValue(observation.dominantPeriod, 'default', locale)}
                unit={t('boating.secondsAbbr')}
              />
              <StatTile
                label={t('boating.averagePeriod')}
                value={formatValue(observation.averagePeriod, 'default', locale)}
                unit={t('boating.secondsAbbr')}
              />
              <StatTile label={t('boating.meanWaveDirection')} value={meanWaveDirLabel ?? '—'} />
              <StatTile
                label={t('waterTemp')}
                value={formatValue(observation.waterTemp, 'temperature', locale)}
                unit={tempUnit}
              />
            </dl>
          </>
        ) : (
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
            {t('boating.noData')}
          </p>
        )}
      </Panel>

      {/* 5. Conditions panel — barometric pressure (+ trend), visibility,
          air temp consolidated into one panel instead of three single-stat
          panels. */}
      <Panel title={t('boating.conditions')}>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          <StatTile
            label={t('boating.pressure')}
            value={formatValue(observation?.pressure ?? null, 'barometer', locale)}
            unit={pressureUnit}
          />
          <StatTile
            label={t('boating.visibility')}
            value={formatValue(observation?.visibility ?? null, 'default', locale)}
            unit={visibilityUnit}
          />
          <StatTile
            label={t('airTemp')}
            value={formatValue(observation?.airTemp ?? null, 'temperature', locale)}
            unit={tempUnit}
          />
        </dl>
        <PressureTrend tendency={observation?.pressureTendency ?? null} t={t} />
        {textForecast[0]?.visibility && (
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
            {textForecast[0].visibility}
          </p>
        )}
      </Panel>

      {/* 6. Tide chart — standalone, 72h */}
      <Panel title={t('boating.tideForecastTitle')}>
        {tideError ? (
          <InlineError message={t('boating.unableToLoadTide')} onRetry={refetchTide} retryLabel={tCommon('retry')} />
        ) : (
          <TideChart
            predictions={tide?.predictions ?? []}
            waterLevels={tide?.waterLevels ?? []}
            locale={locale}
            stationTz={stationTz}
            heightUnit={tideHeightUnit}
            ariaLabel={t('boating.tideForecastAriaLabel', { location: locationName })}
          />
        )}
      </Panel>

      {/* 7. NWS marine text forecast — expandable sections */}
      {textForecast.length > 0 && (
        <Panel title={t('boating.textForecastTitle')}>
          <div className="flex flex-col divide-y divide-border">
            {textForecast.map((period, i) => (
              <details key={`${period.periodName}-${i}`} className="py-2 group">
                <summary
                  className={[
                    'cursor-pointer font-semibold text-foreground list-none',
                    'flex items-center justify-between gap-2 min-h-[44px]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded',
                  ].join(' ')}
                  style={{ fontSize: 'var(--text-body)' }}
                >
                  {period.periodName}
                  <CaretDown
                    aria-hidden="true"
                    focusable="false"
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <div className="flex flex-col gap-1 pb-2" style={{ fontSize: 'var(--text-body)' }}>
                  {period.wind && (
                    <p>
                      <span className="text-muted-foreground">{t('boating.forecastWind')}: </span>
                      {period.wind}
                    </p>
                  )}
                  {period.seas && (
                    <p>
                      <span className="text-muted-foreground">{t('boating.forecastSeas')}: </span>
                      {period.seas}
                    </p>
                  )}
                  {period.visibility && (
                    <p>
                      <span className="text-muted-foreground">{t('boating.forecastVisibility')}: </span>
                      {period.visibility}
                    </p>
                  )}
                  {period.weather && (
                    <p>
                      <span className="text-muted-foreground">{t('boating.forecastWeather')}: </span>
                      {period.weather}
                    </p>
                  )}
                  {!period.wind && !period.seas && !period.visibility && !period.weather && (
                    <p>{period.text}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </Panel>
      )}

      {/* 8. General weather panel — airTemp + wind speed/direction from the
          same observation used above. No weatherCode field exists on
          MarineObservation yet, so it's omitted rather than fabricated
          (tracked for T1.1 provider work). Self-hides when none of the
          three fields have data. */}
      {hasWeatherData && (
        <Panel title={t('boating.weatherAt', { name: locationName })}>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            <StatTile
              label={t('airTemp')}
              value={formatValue(observation?.airTemp ?? null, 'temperature', locale)}
              unit={tempUnit}
            />
            <StatTile
              label={t('windSpeed')}
              value={formatValue(observation?.windSpeed ?? null, 'wind', locale)}
              unit={windUnit}
            />
            <StatTile label={t('boating.direction')} value={windDirLabel ?? '—'} />
          </dl>
        </Panel>
      )}
    </div>
  );
}

export default BoatingTab;
