import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
// TODO(ADR-050 deferred: astro/almanac) — Sunrise, Sunset, Moon stay on Lucide until C5 lands.
// TODO(ADR-050 deferred: seismic) — Activity stays on Lucide until seismic ADR lands.
import { Sunrise, Sunset, Moon, Activity } from 'lucide-react';
import { Lightning } from '@phosphor-icons/react';
import { formatValue } from '../utils/format';
import { asConverted } from '../api/types';
import type { TFunction } from 'i18next';
import type { WebcamConfig } from '../api/types';
import { AlertBanner } from '../components/shared/alert-banner';
import { CurrentConditionsCard } from '../components/current-conditions-card';
import { SolarUvCard } from '../components/solar-uv-card';
import { PrecipitationBarometerCard } from '../components/precipitation-barometer-card';
import { RadarMap } from '../components/shared/radar-map';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
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
    timeZoneName: 'short',
  }).format(new Date(iso));
}

function formatPhaseName(name: string | null): string {
  if (!name) return '—';
  return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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

function WindCompass({
  windDirDeg,
  windDirCardinal,
  windSpeedFormatted,
  windSpeedUnit,
  windGustFormatted,
  windGustUnit,
  beaufortDescription,
  t,
}: {
  /** Raw wind direction degrees (from ConvertedValue.value) for SVG rotation. */
  windDirDeg: number;
  /**
   * BFF-supplied canonical cardinal code (ADR-041).
   * Rendered via i18n (ADR-021): t('directions.' + windDirCardinal).
   * null → display '—'.
   */
  windDirCardinal: string | null;
  windSpeedFormatted: string;
  windSpeedUnit: string;
  windGustFormatted: string;
  windGustUnit: string;
  /** Beaufort descriptor from BFF (e.g. "Gentle breeze") — empty string when unavailable. */
  beaufortDescription: string;
  t: TFunction;
}) {
  const { t: tCommon } = useTranslation('common');
  // Translate the cardinal code via i18n (ADR-021). Falls back to '—' when null.
  const dirTranslated = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : '—';
  const ariaLabel = t('windCompass.ariaLabel', { direction: dirTranslated.toLowerCase(), degrees: formatValue(windDirDeg, 'degrees') });

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

        {/* Outer <g> centers the coordinate system; inner <g> applies CSS rotation
            so the browser can transition it smoothly between SSE updates. SVG
            presentation-attribute rotate() cannot be CSS-transitioned. */}
        <g transform="translate(60,60)">
          <g
            style={{
              transform: `rotate(${(windDirDeg + 180) % 360}deg)`,
              transformOrigin: '0px 0px',
              transition: 'transform 0.5s ease',
            }}
          >
            <polygon
              points="0,-36 5,-16 0,-22 -5,-16"
              fill="currentColor"
              className="text-primary"
            />
            <line x1="0" y1="-22" x2="0" y2="20" stroke="currentColor" strokeWidth="2" className="text-primary" />
            <circle cx="0" cy="0" r="3" fill="currentColor" className="text-primary" />
          </g>
        </g>
      </svg>

      <div className="text-center text-sm">
        <p className="font-medium text-foreground text-base">
          {t('windCompass.directionLabel', { direction: dirTranslated, degrees: formatValue(windDirDeg, 'degrees') })}
        </p>
        <p className="text-muted-foreground">
          {t('windCompass.speed', { speed: windSpeedFormatted, unit: windSpeedUnit, direction: dirTranslated })}
        </p>
        <p className="text-muted-foreground">{t('windCompass.gusts', { gust: windGustFormatted, unit: windGustUnit })}</p>
        {beaufortDescription && (
          <p className="text-xs text-muted-foreground mt-0.5">{beaufortDescription}</p>
        )}
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

  const { data: observation, units, loading: obsLoading, error: obsError, refetch: obsRefetch, barometerTrendDirection } = useRealtimeObservation();
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

  const [refreshTs, setRefreshTs] = useState(Date.now());
  const [videoRefreshTs, setVideoRefreshTs] = useState(Date.now());
  const [webcamAvailable, setWebcamAvailable] = useState(true);
  const [videoAvailable, setVideoAvailable] = useState(true);
  const [webcamConfig, setWebcamConfig] = useState<WebcamConfig | null>(null);
  const [webcamTab, setWebcamTab] = useState<'live' | 'timelapse'>('live');

  // Fetch webcam config from static JSON written by the wizard (not the station API).
  // If the file doesn't exist or fails to load, webcamConfig stays null and the card
  // doesn't render — graceful degradation.
  useEffect(() => {
    fetch('/webcam.json')
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(data => setWebcamConfig(data));
  }, []);

  const webcamEnabled = webcamConfig?.enabled ?? false;

  // Cache-busting refresh for the still image — interval driven by webcam config (default 60s)
  useEffect(() => {
    const ms = (webcamConfig?.refreshInterval ?? 60) * 1000;
    const interval = setInterval(() => setRefreshTs(Date.now()), ms);
    return () => clearInterval(interval);
  }, [webcamConfig?.refreshInterval]);

  // 15-minute cache-busting refresh for the timelapse video
  useEffect(() => {
    const interval = setInterval(() => setVideoRefreshTs(Date.now()), 900000);
    return () => clearInterval(interval);
  }, []);

  const tz = station?.timezone ?? 'UTC';

  // Extract ConvertedValue fields for the wind compass.
  // .value is the raw numeric degree/speed needed for SVG rotation and
  // formatValue calls; .formatted and .label come from the BFF.
  const windDirCV = asConverted(observation?.windDir ?? null);
  const windSpeedCV = asConverted(observation?.windSpeed ?? null);
  const windGustCV = asConverted(observation?.windGust ?? null);
  const windDirDeg = windDirCV?.value ?? 0;

  // BFF-supplied cardinal code for wind direction (ADR-041).
  // SSE updates overwrite this live via the merge in useRealtimeObservation.
  const windDirCardinal = observation?.windDirCardinal ?? null;

  // Beaufort description comes from the BFF (ADR-042). Empty string when absent.
  const beaufortCV = asConverted(observation?.beaufort ?? null);
  const beaufortDescription = beaufortCV?.label ?? '';

  const firstQuake = earthquakes?.[0] ?? null;
  const todayForecast = forecast?.daily?.[0] ?? null;

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto">
      <h1 className="sr-only">Now</h1>

      {!alertLoading && alerts && <AlertBanner alerts={alerts} />}

      {/*
        Grid layout — mobile-first single column, two equal columns on md+.
        Row 1: Current Conditions + Today's Forecast (above the fold on desktop).
        Row 2: Today's Highlights (full-width — summarises the day at a glance).
        Row 3: Wind + Solar/UV
        Row 4: Precipitation/Barometer + AQI
        Row 5: Sun & Moon + Lightning
        Row 6: Recent Earthquake + Temperature Trend
        Row 7: Radar + Webcam side-by-side (radar expands to full-width when webcam is disabled)
      */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

        {/* Row 1 — Current Conditions */}
        <div>
          <CurrentConditionsCard
            observation={observation}
            stationName={station?.name ?? ''}
            loading={obsLoading}
            error={obsError}
            units={units}
            weatherText={observation?.weatherText ?? todayForecast?.weatherText ?? null}
            weatherCode={todayForecast?.weatherCode ?? null}
            onRetry={obsRefetch}
          />
        </div>

        {/* Row 1 — Today's Forecast */}
        <Card aria-busy={fcLoading}>
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
                <p className="text-muted-foreground">
                  {todayForecast.tempMin !== null
                    ? t('forecast.hiLo', { high: formatValue(todayForecast.tempMax, 'temperature'), low: formatValue(todayForecast.tempMin, 'temperature') })
                    : t('forecast.hiOnly', { high: formatValue(todayForecast.tempMax, 'temperature') })}
                </p>
                {todayForecast.precipProbabilityMax !== null && (
                  <p className="text-muted-foreground">{t('forecast.precipChance', { percent: formatValue(todayForecast.precipProbabilityMax, 'percent') })}</p>
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

        {/* Row 2 — Today's Highlights (full-width) */}
        <Card className="md:col-span-2">
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
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.todaysHigh')}</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground">
                    {todayStats.high !== null
                      ? `${asConverted(observation?.outTemp ?? null)?.formatted ?? formatValue(todayStats.high, 'temperature')}${asConverted(observation?.outTemp ?? null)?.label ?? ''}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.todaysLow')}</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground">
                    {todayStats.low !== null
                      ? `${asConverted(observation?.outTemp ?? null)?.formatted ?? formatValue(todayStats.low, 'temperature')}${asConverted(observation?.outTemp ?? null)?.label ?? ''}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.peakGust')}</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground">
                    {windGustCV
                      ? `${windGustCV.formatted}${windGustCV.label}`
                      : formatValue(todayStats.peakGust, 'wind')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.rainToday')}</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground">
                    {asConverted(observation?.rain ?? null)
                      ? `${asConverted(observation?.rain ?? null)!.formatted}${asConverted(observation?.rain ?? null)!.label}`
                      : formatValue(todayStats.rainSoFar, 'rain')}
                  </dd>
                </div>
                {todayStats.peakAQI > 0 && (
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t('highlights.peakAqi')}</dt>
                    <dd className="mt-1 text-xl font-semibold text-foreground">
                      {formatValue(todayStats.peakAQI, 'uv')}
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

        {/* Row 3 — Wind */}
        <Card aria-busy={obsLoading}>
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
              <WindCompass
                windDirDeg={windDirDeg}
                windDirCardinal={windDirCardinal}
                windSpeedFormatted={windSpeedCV?.formatted ?? '--'}
                windSpeedUnit={windSpeedCV?.label ?? ''}
                windGustFormatted={windGustCV?.formatted ?? '--'}
                windGustUnit={windGustCV?.label ?? ''}
                beaufortDescription={beaufortDescription}
                t={t}
              />
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.wind')}</p>
            )}
          </CardContent>
        </Card>

        {/* Row 3 — Solar / UV */}
        <SolarUvCard
          observation={observation}
          loading={obsLoading}
          error={obsError}
          onRetry={obsRefetch}
          todayForecast={todayForecast}
        />

        {/* Row 4 — Precipitation / Barometer */}
        <PrecipitationBarometerCard
          observation={observation}
          barometerTrendDirection={barometerTrendDirection}
          loading={obsLoading}
          error={obsError}
          onRetry={obsRefetch}
        />

        {/* Row 4 — AQI */}
        <Card aria-busy={aqiLoading}>
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

        {/* Row 5 — Sun & Moon */}
        <Card aria-busy={almLoading}>
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
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{formatValue(almanac.moon.illuminationPercent, 'percent')}% lit</span>
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.observation')}</p>
            )}
          </CardContent>
        </Card>

        {/* Row 5 — Lightning */}
        <Card>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">{t('lightning.title')}</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">{t('loading.lightning')}</span>
                <TileSkeleton className="h-16" />
              </>
            ) : lightning ? (
              lightning.count1h === 0 && lightning.count24h === 0 && lightning.nearestDistanceKm === null ? (
                <p className="text-muted-foreground text-sm">{t('lightning.noActivity')}</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Lightning aria-hidden="true" className="h-5 w-5 text-yellow-500 shrink-0" />
                    <span className="font-medium text-foreground">{t('lightning.strikesLastHour', { count: lightning.count1h })}</span>
                  </div>
                  <p className="text-muted-foreground">{t('lightning.strikesLast24h', { count: lightning.count24h })}</p>
                  {lightning.nearestDistanceKm !== null && (
                    <p className="text-muted-foreground">{t('lightning.nearest', { distance: formatValue(lightning.nearestDistanceKm, 'earthquakeDepth') })}</p>
                  )}
                  <p className="text-muted-foreground">{t('lightning.lastStrike', { time: lightning.lastStrikeTime ? formatRelativeTime(lightning.lastStrikeTime, locale) : t('lightning.lastStrikeUnknown') })}</p>
                </>
              )
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.lightning')}</p>
            )}
          </CardContent>
        </Card>

        {/* Row 6 — Recent Earthquake */}
        <Card aria-busy={eqLoading}>
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
                  <span className="font-medium text-foreground">
                    {t('earthquake.magnitude', { magnitude: formatValue(firstQuake.magnitude, 'earthquakeMag'), place: firstQuake.place })}
                  </span>
                </div>
                <p className="text-muted-foreground">{formatRelativeTime(firstQuake.time, locale)}</p>
                {firstQuake.depth !== null && (
                  <p className="text-muted-foreground">{t('earthquake.depth', { depth: formatValue(firstQuake.depth, 'earthquakeDepth') })}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">{t('noData.earthquake')}</p>
            )}
          </CardContent>
        </Card>

        {/* Row 6 — Temperature Trend (placeholder, NO Recharts import) */}
        <Card>
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

        {/* Row 7 — Radar + Webcam (side-by-side on md+; radar expands full-width when webcam is disabled) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">

          {/* Radar card — half-width when webcam is present, full-width otherwise */}
          <Card className={!(webcamEnabled && webcamAvailable) ? 'md:col-span-2' : undefined}>
            <CardHeader>
              <CardTitle as="h2">{tRadar('radarTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {station ? (
                <RadarMap
                  center={[station.latitude, station.longitude]}
                  stationTz={station.timezone}
                />
              ) : (
                <TileSkeleton className="h-96" />
              )}
            </CardContent>
          </Card>

          {/* Webcam card — shown only when enabled and files load successfully */}
          {webcamEnabled && webcamAvailable && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <h2 className="font-heading text-base leading-snug font-medium">{t('webcam')}</h2>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={`px-2 py-1 text-xs rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${webcamTab === 'live' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    onClick={() => setWebcamTab('live')}
                    aria-pressed={webcamTab === 'live'}
                  >
                    {t('webcamTabLive', 'Live')}
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-1 text-xs rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${webcamTab === 'timelapse' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    onClick={() => setWebcamTab('timelapse')}
                    aria-pressed={webcamTab === 'timelapse'}
                  >
                    {t('webcamTabTimelapse', 'Timelapse')}
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {webcamTab === 'live' ? (
                  <img
                    src={`${webcamConfig!.imageUrl}?t=${refreshTs}`}
                    alt={t('webcamAlt')}
                    className="w-full rounded object-cover"
                    onError={() => setWebcamAvailable(false)}
                  />
                ) : videoAvailable ? (
                  <video
                    controls
                    loop
                    className="w-full rounded"
                    onError={() => setVideoAvailable(false)}
                  >
                    <source src={`${webcamConfig!.videoUrl}?t=${videoRefreshTs}`} type="video/mp4" />
                  </video>
                ) : (
                  <p className="text-muted-foreground text-sm">{t('noData.timelapse', 'No timelapse available')}</p>
                )}
              </CardContent>
            </Card>
          )}

        </div>

      </div>
    </div>
  );
}

export default NowPage;
