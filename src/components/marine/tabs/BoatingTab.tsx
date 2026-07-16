// BoatingTab.tsx — Boating activity tab content (DASHBOARD-MANUAL §12, T6.2 redesign).
//
// Unified conditions dashboard pattern: active advisories, current
// conditions (wind, air/water temp, pressure + trend, water level offset,
// storm surge badge), wave stats + 72h wave forecast chart, a standalone
// 72h tide chart, and the NWS marine text forecast as structured columns.
//
// Data sources: useMarineDetail(locationId) (/marine/{id}) and
// useTideDetail(locationId) (/tides/{id}). Rip current probability / total
// water level (NWPS v1.5) are NOT part of either bundle — those fields live
// on BeachSafetyDetailData only — so they are omitted here (nothing to show)
// rather than fabricated.
//
// A11y (rules/coding.md §5):
//   - Every card heading is a real <h3> via CardTitle as="h3" (document
//     order sibling of the tab/accordion header above it, no skipped
//     levels).
//   - Charts: role="img" wrapper (via ChartContainer) + sr-only data table.
//   - Marine forecast periods render as a semantic <ul role="list"> scrolled
//     via HorizontalScrollNav (keyboard-reachable region + arrow-key
//     scrolling) instead of expandable <details>/<summary> text blobs.
//   - Pressure trend and storm surge badge pair every icon/color with a
//     text label — color is never the only signal.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { ArrowUp, ArrowDown, ArrowRight, Wind, Waves, Thermometer, Eye, Drop } from '@phosphor-icons/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { HorizontalScrollNav } from '@/components/ui/horizontal-scroll-nav';
import { useMarineDetail, useTideDetail, useStation } from '../../../hooks/useWeatherData';
import { formatValue } from '../../../utils/format';
import { formatTime } from '../../../utils/format-date';
import { cardinalFromDegrees } from '../../../utils/wind';
import { ChartContainer } from '../../charts/chart-container';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';
import { MarineStatTile } from '../shared/MarineStatTile';
import { buildHourTicks } from './shared/hour-ticks';
import { WeatherIcon } from '../../weather-icon';
import type { MarineForecastPoint, MarineAlertSummary } from '../../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BoatingTabProps {
  locationId: string;
  alerts?: MarineAlertSummary[];
}

// ---------------------------------------------------------------------------
// Alert filtering — DASHBOARD-MANUAL §12 "Activity-relevant alert filtering":
// Boating shows marine zone alerts + coastal flood alerts. `alertType` is a
// closed 3-value server-side bucket (docs/contracts/openapi-v1.yaml
// `MarineLocationSummary.activeAlerts[].alertType` enum: marineZone,
// coastalFlood, beachHazard) — NOT a per-NWS-product-type string — so this
// Set matches the wire values directly, no keyword/headline matching.
// ---------------------------------------------------------------------------

const BOATING_ALERT_TYPES = new Set(['marineZone', 'coastalFlood']);

// ---------------------------------------------------------------------------
// Shared small pieces
// ---------------------------------------------------------------------------

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
              style: { fontFamily: 'var(--font-chart)', fontSize: 'var(--text-label)', fill: 'var(--muted-foreground)' },
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
              style: { fontFamily: 'var(--font-chart)', fontSize: 'var(--text-label)', fill: 'var(--muted-foreground)' },
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
// Storm surge badge — icon + text label + color, never color-only.
// Mirrors the badge pattern in BeachSafetyTab.tsx (tide.stormSurgeLevel).
// ---------------------------------------------------------------------------

type StormSurgeLevel = 'elevated' | 'depressed' | 'significant' | 'storm_surge';

function StormSurgeBadge({ level, t }: { level: StormSurgeLevel; t: (key: string) => string }) {
  const colorClasses =
    level === 'storm_surge'
      ? 'bg-destructive/15 text-destructive'
      : level === 'significant'
        ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
        : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400';

  const labelKey =
    level === 'storm_surge'
      ? 'beachSafety.stormSurgeActive'
      : level === 'significant'
        ? 'beachSafety.stormSurgeSignificant'
        : level === 'depressed'
          ? 'beachSafety.stormSurgeDepressed'
          : 'beachSafety.stormSurgeElevated';

  return (
    <div
      role="status"
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 font-semibold ${colorClasses}`}
      style={{ fontSize: 'var(--text-label)' }}
    >
      <span aria-hidden="true">{level === 'storm_surge' ? '⚠' : '▲'}</span>
      {t(labelKey)}
    </div>
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
  const tempUnit = marineUnits?.temperature ?? '';
  const tideHeightUnit = tideUnits?.height ?? heightUnit;

  const windDirCardinal = cardinalFromDegrees(observation?.windDirection ?? null);
  const windDirLabel = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : null;
  const meanWaveDirCardinal = cardinalFromDegrees(observation?.meanWaveDirection ?? null);
  const meanWaveDirLabel = meanWaveDirCardinal ? tCommon(`directions.${meanWaveDirCardinal}`) : null;

  // Current Conditions self-hides its stat grid (in favor of a retry prompt)
  // only when there is truly nothing to show: no live observation record AND
  // no tide-compositor water-level data. Individual null sub-fields within a
  // present observation still render as '--' per tile, matching the rest of
  // the dashboard's partial-data convention.
  const hasConditionsData = observation !== null || tide?.currentResidual != null || tide?.stormSurgeLevel != null;

  // Waves card self-hides for harbor locations where neither the live
  // observation nor any forecast point carries wave data.
  const hasWaveData = observation?.waveHeight != null || forecast.some((f) => f.waveHeight !== null);

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
      <AlertsPanel alerts={alerts} filterTypes={BOATING_ALERT_TYPES} />

      {/* 2. Current Conditions — weather icon, air/water temp, visibility,
          dewpoint, pressure + trend, water level offset, and storm surge
          badge consolidated into one card per DASHBOARD-MANUAL §12. Wind
          moved to its own card (T7.2) — see below. */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">{t('boating.conditions')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {hasConditionsData ? (
            <>
              {observation?.weatherCode != null && (
                <WeatherIcon code={observation.weatherCode} isNight={observation.isDay === false} size={36} />
              )}
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                <MarineStatTile
                  icon={<Thermometer size={16} aria-hidden="true" focusable="false" />}
                  label={t('airTemp')}
                  value={formatValue(observation?.airTemp ?? null, 'temperature', locale)}
                  unit={tempUnit}
                />
                <MarineStatTile
                  icon={<Thermometer size={16} aria-hidden="true" focusable="false" />}
                  label={t('waterTemp')}
                  value={formatValue(observation?.waterTemp ?? null, 'temperature', locale)}
                  unit={tempUnit}
                />
                <MarineStatTile
                  icon={<Eye size={16} aria-hidden="true" focusable="false" />}
                  label={t('boating.visibility')}
                  value={formatValue(observation?.visibility ?? null, 'default', locale)}
                  unit={marineUnits?.visibility ?? 'mi'}
                />
                <MarineStatTile
                  icon={<Drop size={16} aria-hidden="true" focusable="false" />}
                  label={t('boating.dewpoint')}
                  value={formatValue(observation?.dewpoint ?? null, 'temperature', locale)}
                  unit={tempUnit}
                />
                <MarineStatTile
                  label={t('boating.pressure')}
                  value={formatValue(observation?.pressure ?? null, 'barometer', locale)}
                  unit={pressureUnit}
                />
                {tide?.currentResidual != null && (
                  <MarineStatTile
                    label={t('boating.waterLevelOffset')}
                    value={`${tide.currentResidual.value > 0 ? '+' : ''}${formatValue(tide.currentResidual.value, 'default', locale)}`}
                    unit={tideHeightUnit}
                  />
                )}
              </dl>
              <PressureTrend tendency={observation?.pressureTendency ?? null} t={t} />
              {tide?.stormSurgeLevel != null && <StormSurgeBadge level={tide.stormSurgeLevel} t={t} />}
            </>
          ) : (
            <InlineError message={t('boating.noData')} onRetry={refetchMarine} retryLabel={tCommon('retry')} />
          )}
        </CardContent>
      </Card>

      {/* 2b. Wind — extracted from Current Conditions into its own card
          (T7.2). Speed, gust, and direction as MarineStatTiles. No wind-
          trend stat: MarineObservation carries no wind-trend field, so it is
          omitted rather than rendered as a placeholder "—" (tracked data
          gap, not a bug). */}
      {hasConditionsData && (
        <Card footprint="wide">
          <CardHeader>
            <CardTitle as="h3">{t('boating.windTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <MarineStatTile
                icon={<Wind size={16} aria-hidden="true" focusable="false" />}
                label={t('windSpeed')}
                value={formatValue(observation?.windSpeed ?? null, 'wind', locale)}
                unit={windUnit}
              />
              <MarineStatTile
                icon={<Wind size={16} aria-hidden="true" focusable="false" />}
                label={t('boating.gust')}
                value={formatValue(observation?.windGust ?? null, 'wind', locale)}
                unit={windUnit}
              />
              <MarineStatTile label={t('boating.direction')} value={windDirLabel ?? '—'} />
            </dl>
          </CardContent>
        </Card>
      )}

      {/* 3. Waves — current wave stats + 72h forecast chart. Self-hides for
          harbor locations with no wave data at all. */}
      {hasWaveData && (
        <Card footprint="full">
          <CardHeader>
            <CardTitle as="h3">{t('boating.waveForecastTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <MarineStatTile
                icon={<Waves size={16} aria-hidden="true" focusable="false" />}
                label={t('waveHeight')}
                value={formatValue(observation?.waveHeight ?? null, 'default', locale)}
                unit={heightUnit}
              />
              <MarineStatTile
                label={t('boating.dominantPeriod')}
                value={formatValue(observation?.dominantPeriod ?? null, 'default', locale)}
                unit={t('boating.secondsAbbr')}
              />
              <MarineStatTile label={t('boating.meanWaveDirection')} value={meanWaveDirLabel ?? '—'} />
            </dl>
            <WaveForecastChart
              forecast={forecast}
              locale={locale}
              stationTz={stationTz}
              heightUnit={heightUnit}
              ariaLabel={t('boating.waveForecastAriaLabel', { location: locationName })}
            />
          </CardContent>
        </Card>
      )}

      {/* 4. Tide chart — standalone, 72h */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">{t('boating.tideForecastTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {tideError ? (
            <InlineError message={t('boating.unableToLoadTide')} onRetry={refetchTide} retryLabel={tCommon('retry')} />
          ) : (
            <TideChart
              predictions={tide?.predictions ?? []}
              waterLevels={tide?.waterLevels ?? []}
              totalWaterLevelForecast={tide?.totalWaterLevelForecast ?? undefined}
              locale={locale}
              stationTz={stationTz}
              heightUnit={tideHeightUnit}
              ariaLabel={t('boating.tideForecastAriaLabel', { location: locationName })}
            />
          )}
        </CardContent>
      </Card>

      {/* 5. NWS marine text forecast — structured horizontally-scrolling
          columns (DailyColumns-style), not expandable text blobs. */}
      {textForecast.length > 0 && (
        <Card footprint="full">
          <CardHeader>
            <CardTitle as="h3">{t('boating.textForecastTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalScrollNav ariaLabel={t('boating.textForecastTitle')}>
              <ul role="list" className="flex gap-3 px-1 py-1 m-0 p-0 list-none">
                {textForecast.map((period, i) => (
                  <li
                    key={`${period.periodName}-${i}`}
                    className="flex flex-col gap-2 shrink-0 min-w-[8rem] max-w-[10rem] rounded-lg ring-1 ring-foreground/10 p-2"
                  >
                    <span
                      className="font-semibold text-foreground text-center"
                      style={{ fontSize: 'var(--text-label)' }}
                    >
                      {period.periodName}
                    </span>
                    {period.wind && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>
                          {t('boating.forecastWind')}
                        </span>
                        <span style={{ fontSize: 'var(--text-label)' }}>{period.wind}</span>
                      </div>
                    )}
                    {period.seas && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>
                          {t('boating.forecastSeas')}
                        </span>
                        <span style={{ fontSize: 'var(--text-label)' }}>{period.seas}</span>
                      </div>
                    )}
                    {period.visibility && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>
                          {t('boating.forecastVisibility')}
                        </span>
                        <span style={{ fontSize: 'var(--text-label)' }}>{period.visibility}</span>
                      </div>
                    )}
                    {period.weather && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground" style={{ fontSize: 'var(--text-micro)' }}>
                          {t('boating.forecastWeather')}
                        </span>
                        <span style={{ fontSize: 'var(--text-label)' }}>{period.weather}</span>
                      </div>
                    )}
                    {!period.wind && !period.seas && !period.visibility && !period.weather && (
                      <span style={{ fontSize: 'var(--text-label)' }}>{period.text}</span>
                    )}
                  </li>
                ))}
              </ul>
            </HorizontalScrollNav>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default BoatingTab;
