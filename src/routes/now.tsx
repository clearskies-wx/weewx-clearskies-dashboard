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
import { WindCompassCard } from '../components/WindCompassCard';
import { NowForecastCard } from '../components/forecast/NowForecastCard';
import { RadarMap } from '../components/shared/radar-map';
import { Grid } from '../components/layout/grid';
import { NowHeroCard } from '../components/layout/now-hero-card';
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
import { useBranding } from '../lib/branding-provider';

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

  const branding = useBranding();

  const { data: observation, units, loading: obsLoading, error: obsError, refetch: obsRefetch, barometerTrendDirection } = useRealtimeObservation();
  const { data: forecast, loading: fcLoading, error: fcError, refetch: fcRefetch } = useForecast();
  const { data: alerts, loading: alertLoading } = useAlerts();
  const { data: almanac, loading: almLoading, error: almError, refetch: almRefetch } = useAlmanac();
  const { data: earthquakes, loading: eqLoading, error: eqError, refetch: eqRefetch } = useEarthquakes();
  const { data: aqi, loading: aqiLoading, error: aqiError, refetch: aqiRefetch } = useAqi();
  const { data: station } = useStation();

  // Today's archive — used for high/low stats AND the temp curve past leg
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

  useEffect(() => {
    fetch('/webcam.json')
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(data => setWebcamConfig(data));
  }, []);

  const webcamEnabled = webcamConfig?.enabled ?? false;

  useEffect(() => {
    const ms = (webcamConfig?.refreshInterval ?? 60) * 1000;
    const interval = setInterval(() => setRefreshTs(Date.now()), ms);
    return () => clearInterval(interval);
  }, [webcamConfig?.refreshInterval]);

  useEffect(() => {
    const interval = setInterval(() => setVideoRefreshTs(Date.now()), 900000);
    return () => clearInterval(interval);
  }, []);

  const tz = station?.timezone ?? 'UTC';

  // windGustCV still used by Today's Highlights peak-gust readout.
  const windGustCV = asConverted(observation?.windGust ?? null);

  const firstQuake = earthquakes?.[0] ?? null;
  const todayForecast = forecast?.daily?.[0] ?? null;
  const hourlyForecast = forecast?.hourly ?? null;

  // Determine logo URL based on current theme
  // The theme toggle sets data-theme on <html>; detect it from the DOM
  const isDark = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme') === 'dark'
    : false;
  const logoUrl = isDark
    ? (branding.logo?.dark ?? branding.logo?.light)
    : branding.logo?.light;
  const logoAlt = branding.logo?.alt;

  return (
    <div className="flex flex-col gap-4">
      {/* sr-only h1 for this page (the NowHeroCard renders an h1 that's visible) */}
      <h1 className="sr-only">Now</h1>

      {!alertLoading && alerts && <AlertBanner alerts={alerts} />}

      {/*
        A4 Grid primitive — 4 columns on lg, 2 on md, 1 on mobile.
        Cards declare their own footprint; the hero is full-width (col-span-4).
        The "sr-only h1" above is outside the grid; the visible station name
        heading is inside NowHeroCard as a real <h1>.
      */}
      <Grid>

        {/* ── Hero bar — full-width × half-row ──────────────────────────── */}
        <NowHeroCard
          stationName={branding.siteTitle}
          location={station?.name ?? undefined}
          logoUrl={logoUrl}
          logoAlt={logoAlt}
        />

        {/* ── Current Conditions — 2×2 (wide + rowSpan 2) ──────────────── */}
        <CurrentConditionsCard
          observation={observation}
          loading={obsLoading}
          error={obsError}
          units={units}
          weatherText={observation?.weatherText ?? todayForecast?.weatherText ?? null}
          weatherCode={todayForecast?.weatherCode ?? null}
          todayHigh={todayStats?.high ?? null}
          todayLow={todayStats?.low ?? null}
          todayArchive={todayArchive ?? null}
          hourlyForecast={hourlyForecast ?? null}
          onRetry={obsRefetch}
        />

        {/* ── Today's Forecast — wide (2×1) ─────────────────────────────── */}
        <NowForecastCard
          forecast={forecast}
          loading={fcLoading}
          error={fcError}
          stationTz={station?.timezone}
        />

        {/* ── Today's Highlights — full-width ───────────────────────────── */}
        <Card footprint="full" aria-busy={obsLoading}>
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

        {/* ── Wind Compass — wide (2-col) ────────────────────────────────── */}
        <WindCompassCard observation={observation} />

        {/* ── Solar / UV — tile ─────────────────────────────────────────── */}
        <SolarUvCard
          observation={observation}
          loading={obsLoading}
          error={obsError}
          onRetry={obsRefetch}
          todayForecast={todayForecast}
        />

        {/* ── Precipitation / Barometer — tile ──────────────────────────── */}
        <PrecipitationBarometerCard
          observation={observation}
          barometerTrendDirection={barometerTrendDirection}
          loading={obsLoading}
          error={obsError}
          onRetry={obsRefetch}
        />

        {/* ── AQI — tile ────────────────────────────────────────────────── */}
        <Card footprint="tile" aria-busy={aqiLoading}>
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

        {/* ── Sun & Moon — tile ─────────────────────────────────────────── */}
        <Card footprint="tile" aria-busy={almLoading}>
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

        {/* ── Lightning — tile ──────────────────────────────────────────── */}
        <Card footprint="tile">
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

        {/* ── Recent Earthquake — tile ───────────────────────────────────── */}
        <Card footprint="tile" aria-busy={eqLoading}>
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

        {/* ── Radar + Webcam ─────────────────────────────────────────────── */}
        {/* Radar: wide (2-col) when webcam absent, tile (1-col) when present */}
        <Card
          footprint={!(webcamEnabled && webcamAvailable) ? 'wide' : 'tile'}
        >
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

        {webcamEnabled && webcamAvailable && (
          <Card footprint="tile">
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

      </Grid>
    </div>
  );
}

export default NowPage;
