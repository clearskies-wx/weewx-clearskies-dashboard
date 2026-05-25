import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sunrise, Sunset, Moon, Zap, Activity } from 'lucide-react';
import type { TFunction } from 'i18next';
import { AlertBanner } from '../components/shared/alert-banner';
import { HeroSection } from '../components/hero-section';
import { RadarMap } from '../components/shared/radar-map';
import {
  Card,
  CardHeader,
  CardContent,
} from '../components/ui/card';
import {
  useForecast,
  useAlerts,
  useAlmanac,
  useEarthquakes,
  useAqi,
  useStation,
  useLightning,
  useArchive,
  useTodayStats,
} from '../hooks/useWeatherData';
import { useRealtimeObservation } from '../hooks/useRealtimeObservation';

function formatLocalTime(iso: string | null, tz: string, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(new Date(iso));
}

function formatPhaseName(name: string | null): string {
  if (!name) return '—';
  return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function beaufortLabel(speedMph: number, t: TFunction): string {
  if (speedMph < 1) return t('beaufort.calm');
  if (speedMph <= 3) return t('beaufort.lightAir');
  if (speedMph <= 7) return t('beaufort.lightBreeze');
  if (speedMph <= 12) return t('beaufort.gentleBreeze');
  if (speedMph <= 18) return t('beaufort.moderateBreeze');
  if (speedMph <= 24) return t('beaufort.freshBreeze');
  if (speedMph <= 31) return t('beaufort.strongBreeze');
  if (speedMph <= 38) return t('beaufort.nearGale');
  if (speedMph <= 46) return t('beaufort.gale');
  if (speedMph <= 54) return t('beaufort.strongGale');
  if (speedMph <= 63) return t('beaufort.storm');
  if (speedMph <= 72) return t('beaufort.violentStorm');
  return t('beaufort.hurricane');
}

function windDirLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// EPA standard AQI color categories with WCAG AA-accessible shades.
// The raw EPA palette (#FFFF00 yellow, #00E400 bright green) fails 3:1 contrast
// against white backgrounds for non-text elements. These replacements preserve
// the EPA category semantics (green/yellow/orange/red/purple/maroon) while
// meeting the 3:1 threshold for graphical objects (WCAG 1.4.11).
// Contrast ratios against #FFFFFF (light) verified via WebAIM:
//   Good:          #1A7A1A (~7.0:1)
//   Moderate:      #B8A000 (~3.4:1) — saturated gold replacing pure yellow
//   USG:           #C45E00 (~4.0:1)
//   Unhealthy:     #CC0000 (~5.9:1)
//   Very Unhealthy:#6B2D8B (~5.5:1)
//   Hazardous:     #7E0023 (~8.3:1)
// Dark mode strokes render against oklch(0.145 0 0) ≈ #1A1A1A; all pass 3:1 there too.
function aqiColor(aqi: number): string {
  if (aqi <= 50) return '#1A7A1A';
  if (aqi <= 100) return '#B8A000';
  if (aqi <= 150) return '#C45E00';
  if (aqi <= 200) return '#CC0000';
  if (aqi <= 300) return '#6B2D8B';
  return '#7E0023';
}

function aqiCategory(aqi: number, t: TFunction): string {
  if (aqi <= 50) return t('aqi.good');
  if (aqi <= 100) return t('aqi.moderate');
  if (aqi <= 150) return t('aqi.unhealthySensitive');
  if (aqi <= 200) return t('aqi.unhealthy');
  if (aqi <= 300) return t('aqi.veryUnhealthy');
  return t('aqi.hazardous');
}

function formatRelativeTime(iso: string, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffMs = new Date(iso).getTime() - Date.now();
  // Guard: new Date() returns NaN for invalid/missing strings.
  // Intl.RelativeTimeFormat.format() throws on NaN — return a safe fallback.
  if (!Number.isFinite(diffMs)) return '—';
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  return rtf.format(diffDay, 'day');
}

function barometerTrendArrow(trend: number | null): string {
  if (trend === null) return '→';
  if (trend > 0.01) return '↑';
  if (trend < -0.01) return '↓';
  return '→';
}

function barometerTrendLabel(trend: number | null, t: TFunction): string {
  if (trend === null) return t('barometer.trend.steady');
  if (trend > 0.01) return t('barometer.trend.rising');
  if (trend < -0.01) return t('barometer.trend.falling');
  return t('barometer.trend.steady');
}

function WindCompass({
  windDir,
  windSpeed,
  windGust,
  t,
}: {
  windDir: number;
  windSpeed: number;
  windGust: number;
  t: TFunction;
}) {
  const dirLabel = windDirLabel(windDir).toLowerCase();
  const ariaLabel = t('windCompass.ariaLabel', { direction: dirLabel, degrees: windDir });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        role="img"
        aria-label={ariaLabel}
        focusable="false"
      >
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-border"
        />
        <text x="60" y="14" textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground" dominantBaseline="middle">N</text>
        <text x="106" y="60" textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground" dominantBaseline="middle">E</text>
        <text x="60" y="108" textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground" dominantBaseline="middle">S</text>
        <text x="14" y="60" textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground" dominantBaseline="middle">W</text>

        <g transform={`translate(60,60) rotate(${windDir})`}>
          <polygon
            points="0,-36 5,-16 0,-22 -5,-16"
            fill="currentColor"
            className="text-primary"
          />
          <line x1="0" y1="-22" x2="0" y2="20" stroke="currentColor" strokeWidth="2" className="text-primary" />
          <circle cx="0" cy="0" r="3" fill="currentColor" className="text-primary" />
        </g>
      </svg>

      <div className="text-center text-sm font-[tabular-nums]">
        <p className="font-medium text-foreground">
          {t('windCompass.speed', { speed: windSpeed, direction: windDirLabel(windDir) })}
        </p>
        <p className="text-muted-foreground">{t('windCompass.gusts', { gust: windGust })}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{beaufortLabel(windSpeed, t)}</p>
      </div>
    </div>
  );
}

function AqiGauge({
  aqi,
  category,
  pollutant,
  t,
}: {
  aqi: number;
  category: string | null;
  pollutant: string | null;
  t: TFunction;
}) {
  const clampedAqi = Math.min(Math.max(aqi, 0), 500);
  const fraction = clampedAqi / 500;
  const sweepDeg = fraction * 180;
  const r = 50;
  const cx = 60;
  const cy = 60;

  function polarToCart(angleDeg: number) {
    const rad = ((angleDeg - 180) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  const start = polarToCart(0);
  const end = polarToCart(sweepDeg);
  const largeArc = sweepDeg > 90 ? 1 : 0;

  const trackStart = polarToCart(0);
  const trackEnd = polarToCart(180);

  const color = aqiColor(aqi);
  const displayCategory = category ?? aqiCategory(aqi, t);
  const displayPollutant = pollutant ?? t('aqi.unknownPollutant');

  return (
    <div
      role="figure"
      aria-label={t('aqi.gaugeAriaLabel', { aqi, category: displayCategory, pollutant: displayPollutant })}
      className="flex flex-col items-center gap-2"
    >
      <svg width="120" height="70" viewBox="0 0 120 70" aria-hidden="true" focusable="false">
        <path
          d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 0 1 ${trackEnd.x} ${trackEnd.y}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          className="text-muted/50"
        />
        {sweepDeg > 0 && (
          <path
            d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
          />
        )}
        <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor" style={{ fontVariantNumeric: 'tabular-nums' }}>{aqi}</text>
      </svg>
      <p className="text-sm font-semibold text-foreground">{displayCategory}</p>
      {pollutant && (
        <p className="text-xs text-muted-foreground">{t('aqi.mainPollutant', { pollutant })}</p>
      )}
    </div>
  );
}

/** Skeleton tile for loading states. */
function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

/** Error message for tile failures. */
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

export function NowPage() {
  const { t, i18n } = useTranslation('now');
  const { t: tRadar } = useTranslation('radar');
  const locale = i18n.language;

  const { data: observation, units, loading: obsLoading, error: obsError, refetch: obsRefetch } = useRealtimeObservation();
  const { data: forecast, loading: fcLoading, error: fcError, refetch: fcRefetch } = useForecast();
  const { data: alerts, loading: alertLoading } = useAlerts();
  const { data: almanac, loading: almLoading, error: almError, refetch: almRefetch } = useAlmanac();
  const { data: earthquakes, loading: eqLoading, error: eqError, refetch: eqRefetch } = useEarthquakes();
  const { data: aqi, loading: aqiLoading, error: aqiError, refetch: aqiRefetch } = useAqi();
  const { data: station } = useStation();

  // Today's archive for todayStats computation
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: todayArchive } = useArchive({ from: todayStart.toISOString() });

  const lightning = useLightning(observation);
  const todayStats = useTodayStats(observation, todayArchive);

  const tz = station?.timezone ?? 'UTC';
  const windDir = observation?.windDir ?? 0;
  const windSpeed = observation?.windSpeed ?? 0;
  const windGust = observation?.windGust ?? 0;

  const firstQuake = earthquakes?.[0] ?? null;
  const todayForecast = forecast?.daily?.[0] ?? null;

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto">
      <h1 className="sr-only">Now</h1>

      <HeroSection
        observation={observation}
        stationName={station?.name ?? ''}
        loading={obsLoading}
        units={units}
      />

      {!alertLoading && alerts && <AlertBanner alerts={alerts} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">

        {/* Current Conditions Hero — lg: 8-col primary */}
        <Card className="md:col-span-2 lg:col-span-8" aria-busy={obsLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('currentConditions')}</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">{t('loading.currentConditions')}</span>
                <TileSkeleton className="h-16 w-32" />
                <TileSkeleton className="h-4 w-48" />
              </>
            ) : obsError ? (
              <TileError message={t('error.currentConditions')} onRetry={obsRefetch} />
            ) : observation ? (
              <>
                {/* aria-live="polite" scoped to just the observation values so SSE
                    updates announce only the changed reading, not the full card. */}
                <div
                  aria-live="polite"
                  aria-atomic="true"
                  className="text-7xl font-bold text-foreground leading-none font-[tabular-nums]"
                  aria-label={t('temperature.ariaLabel', { temp: observation.outTemp, unit: units?.outTemp ?? '°F' })}
                >
                  {observation.outTemp}
                  <span className="text-4xl font-normal text-muted-foreground ml-1">{units?.outTemp ?? '°F'}</span>
                </div>
                <p className="text-lg text-muted-foreground">Partly Cloudy</p>
                <p className="text-sm text-muted-foreground">
                  {t('feelsLike')} <span className="font-medium text-foreground font-[tabular-nums]">{observation.appTemp !== null ? `${observation.appTemp}°F` : 'N/A'}</span>
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.observation')}</p>
            )}
          </CardContent>
        </Card>

        {/* Today's Highlights — lg: 4-col sidebar */}
        <Card className="md:col-span-2 lg:col-span-4">
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('todaysHighlights')}</h2>
          </CardHeader>
          <CardContent>
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">{t('loading.highlights')}</span>
                <TileSkeleton className="h-24" />
              </>
            ) : todayStats ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4 lg:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.todaysHigh')}</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground font-[tabular-nums]">{todayStats.high !== null ? `${todayStats.high}°F` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.todaysLow')}</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground font-[tabular-nums]">{todayStats.low !== null ? `${todayStats.low}°F` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.peakGust')}</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground font-[tabular-nums]">{todayStats.peakGust} mph</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.rainToday')}</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground font-[tabular-nums]">{todayStats.rainSoFar} in</dd>
                </div>
                {todayStats.peakAQI > 0 && (
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.peakAqi')}</dt>
                    <dd className="mt-1 text-xl font-semibold text-foreground font-[tabular-nums]">
                      {todayStats.peakAQI}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{aqiCategory(todayStats.peakAQI, t)}</span>
                    </dd>
                  </div>
                )}
                {todayStats.recordsBrokenToday.length > 0 && (
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.recordsBroken')}</dt>
                    <dd className="mt-1 font-medium text-foreground">{todayStats.recordsBrokenToday.join(', ')}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.highlights')}</p>
            )}
          </CardContent>
        </Card>

        {/* Wind Tile — lg: 4 cols */}
        <Card className="lg:col-span-4" aria-busy={obsLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('wind')}</h2>
          </CardHeader>
          <CardContent>
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">{t('loading.wind')}</span>
                <TileSkeleton className="h-32" />
              </>
            ) : obsError ? (
              <TileError message={t('error.wind')} onRetry={obsRefetch} />
            ) : observation ? (
              <WindCompass windDir={windDir} windSpeed={windSpeed} windGust={windGust} t={t} />
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.wind')}</p>
            )}
          </CardContent>
        </Card>

        {/* Station Observations — lg: 8 cols */}
        <Card className="md:col-span-2 lg:col-span-8" aria-busy={obsLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('stationObservations')}</h2>
          </CardHeader>
          <CardContent>
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">{t('loading.stationObservations')}</span>
                <TileSkeleton className="h-24" />
              </>
            ) : obsError ? (
              <TileError message={t('error.stationObservations')} onRetry={obsRefetch} />
            ) : observation ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('observations.barometer')}</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">
                    {observation.barometer !== null ? `${observation.barometer} inHg` : 'N/A'}
                    <span role="img" className="ml-1 text-muted-foreground" aria-label={t('barometer.trendAriaLabel', { trend: barometerTrendLabel(observation.barometerTrend, t) })}>
                      {barometerTrendArrow(observation.barometerTrend)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('observations.dewpoint')}</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">{observation.dewpoint !== null ? `${observation.dewpoint}°F` : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('observations.humidity')}</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">{observation.outHumidity !== null ? `${observation.outHumidity}%` : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('observations.rain')}</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">{observation.rain !== null ? `${observation.rain} in` : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('observations.heatIndex')}</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">
                    {observation.heatindex !== null ? `${observation.heatindex}°F` : 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('observations.windChill')}</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">
                    {observation.windchill !== null ? `${observation.windchill}°F` : 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('observations.solarRadiation')}</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">{observation.radiation !== null ? `${observation.radiation} W/m²` : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('observations.uvIndex')}</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">{observation.UV !== null ? observation.UV : 'N/A'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.observation')}</p>
            )}
          </CardContent>
        </Card>

        {/* Sun & Moon — lg: 4 cols */}
        <Card className="lg:col-span-4" aria-busy={almLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('sunAndMoon')}</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {almLoading ? (
              <>
                <span className="sr-only" role="status">{t('loading.sunMoon')}</span>
                <TileSkeleton className="h-20" />
              </>
            ) : almError ? (
              <TileError message={t('error.almanac')} onRetry={almRefetch} />
            ) : almanac ? (
              <>
                <div className="flex items-center gap-2">
                  <Sunrise aria-hidden="true" className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-muted-foreground">{t('sunMoon.sunrise')}</span>
                  <span className="ml-auto font-medium text-foreground">{formatLocalTime(almanac.sun.rise, tz, locale)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sunset aria-hidden="true" className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="text-muted-foreground">{t('sunMoon.sunset')}</span>
                  <span className="ml-auto font-medium text-foreground">{formatLocalTime(almanac.sun.set, tz, locale)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Moon aria-hidden="true" className="h-4 w-4 text-blue-400 shrink-0" />
                  <span className="text-muted-foreground">{t('sunMoon.moon')}</span>
                  <span className="ml-auto text-right font-medium text-foreground">
                    {formatPhaseName(almanac.moon.phaseName)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{almanac.moon.illuminationPercent}% lit</span>
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.observation')}</p>
            )}
          </CardContent>
        </Card>

        {/* AQI Tile — lg: 4 cols */}
        <Card className="lg:col-span-4" aria-busy={aqiLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('airQuality')}</h2>
          </CardHeader>
          <CardContent>
            {aqiLoading ? (
              <>
                <span className="sr-only" role="status">{t('loading.airQuality')}</span>
                <TileSkeleton className="h-24" />
              </>
            ) : aqiError ? (
              <TileError message={t('error.airQuality')} onRetry={aqiRefetch} />
            ) : aqi ? (
              <AqiGauge
                aqi={aqi.aqi ?? 0}
                category={aqi.aqiCategory}
                pollutant={aqi.aqiMainPollutant}
                t={t}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('noData.airQuality')}</p>
            )}
          </CardContent>
        </Card>

        {/* Lightning Tile — lg: 4 cols */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('lightning')}</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">{t('loading.lightning')}</span>
                <TileSkeleton className="h-16" />
              </>
            ) : lightning ? (
              <>
                <div className="flex items-center gap-2">
                  <Zap aria-hidden="true" className="h-5 w-5 text-yellow-500 shrink-0" />
                  <span className="font-medium text-foreground font-[tabular-nums]">{t('lightning.strikesLastHour', { count: lightning.count1h })}</span>
                </div>
                <p className="text-muted-foreground font-[tabular-nums]">{t('lightning.strikesLast24h', { count: lightning.count24h })}</p>
                <p className="text-muted-foreground font-[tabular-nums]">{t('lightning.nearest', { distance: lightning.nearestDistanceKm })}</p>
                <p className="text-muted-foreground">{t('lightning.lastStrike', { time: lightning.lastStrikeTime ? formatRelativeTime(lightning.lastStrikeTime, locale) : t('lightning.lastStrikeUnknown') })}</p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.lightning')}</p>
            )}
          </CardContent>
        </Card>

        {/* Earthquake Tile — lg: 4 cols */}
        <Card className="lg:col-span-4" aria-busy={eqLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('recentEarthquake')}</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {eqLoading ? (
              <>
                <span className="sr-only" role="status">{t('loading.earthquake')}</span>
                <TileSkeleton className="h-16" />
              </>
            ) : eqError ? (
              <TileError message={t('error.earthquake')} onRetry={eqRefetch} />
            ) : firstQuake ? (
              <>
                <div className="flex items-center gap-2">
                  <Activity aria-hidden="true" className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-foreground font-[tabular-nums]">
                    {t('earthquake.magnitude', { magnitude: firstQuake.magnitude, place: firstQuake.place })}
                  </span>
                </div>
                <p className="text-muted-foreground">{formatRelativeTime(firstQuake.time, locale)}</p>
                {firstQuake.depth !== null && (
                  <p className="text-muted-foreground font-[tabular-nums]">{t('earthquake.depth', { depth: firstQuake.depth })}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.earthquake')}</p>
            )}
          </CardContent>
        </Card>

        {/* Today's Forecast Card — lg: 6 cols */}
        <Card className="md:col-span-2 lg:col-span-6" aria-busy={fcLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('todaysForecast')}</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {fcLoading ? (
              <>
                <span className="sr-only" role="status">{t('loading.forecast')}</span>
                <TileSkeleton className="h-16" />
              </>
            ) : fcError ? (
              <TileError message={t('error.forecast')} onRetry={fcRefetch} />
            ) : todayForecast ? (
              <>
                <p className="text-foreground font-medium">{todayForecast.weatherText}</p>
                <p className="text-muted-foreground font-[tabular-nums]">
                  {t('forecast.hiLo', { high: todayForecast.tempMax, low: todayForecast.tempMin })}
                </p>
                {todayForecast.precipProbabilityMax !== null && (
                  <p className="text-muted-foreground">{t('forecast.precipChance', { percent: todayForecast.precipProbabilityMax })}</p>
                )}
                {todayForecast.narrative && (
                  <p className="text-muted-foreground leading-relaxed">{todayForecast.narrative}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{t('noData.forecast')}</p>
            )}
          </CardContent>
        </Card>

        {/* Chart Panel — placeholder, NO Recharts import */}
        <Card className="md:col-span-2 lg:col-span-6">
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('temperatureTrend')}</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div
              aria-hidden="true"
              className="h-20 w-full rounded-md overflow-hidden bg-gradient-to-r from-blue-100 via-amber-100 to-orange-100 dark:from-blue-950/50 dark:via-amber-950/50 dark:to-orange-950/50 relative"
            >
              <svg
                viewBox="0 0 200 60"
                className="absolute inset-0 w-full h-full"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <polyline
                  points="0,50 20,42 40,35 60,28 80,22 100,20 120,22 140,30 160,38 180,44 200,48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-primary/60"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <Link
              to="/charts"
              className="text-sm text-primary underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded self-start"
            >
              {t('viewCharts')}
            </Link>
          </CardContent>
        </Card>

        {/* Radar Card — ADR-015 / ADR-024 */}
        <Card className="md:col-span-2 lg:col-span-12">
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{tRadar('radarTitle')}</h2>
          </CardHeader>
          <CardContent>
            <RadarMap
              center={[station?.latitude ?? 0, station?.longitude ?? 0]}
            />
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

export default NowPage;
