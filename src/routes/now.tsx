import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { asConverted } from '../api/types';
import type { WebcamConfig } from '../api/types';
import { AlertBanner } from '../components/shared/alert-banner';
import { CurrentConditionsCard } from '../components/current-conditions-card';
import { PrecipitationCard } from '../components/precipitation-card';
import { BarometerCard } from '../components/barometer-card';
import { SolarRadiationCard } from '../components/solar-radiation-card';
import { UvIndexCard } from '../components/uv-index-card';
import { AqiCard } from '../components/aqi-card';
import { SunMoonCard } from '../components/sun-moon-card';
import { LightningCard } from '../components/lightning-card';
import { EarthquakeCard } from '../components/earthquake-card';
import { WindCompassCard } from '../components/WindCompassCard';
import { NowForecastCard } from '../components/forecast/NowForecastCard';
import { TodaysHighlightsCard } from '../components/todays-highlights-card';
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
  const { t } = useTranslation('now');
  const { t: tRadar } = useTranslation('radar');

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

      {/*
        A4 Grid primitive — 4 columns on lg, 2 on md, 1 on mobile.
        Cards declare their own footprint; the hero is full-width (col-span-4).
        The "sr-only h1" above is outside the grid; the visible station name
        heading is inside NowHeroCard as a real <h1>.
      */}
      <Grid>

        {/* ── Alert Banner — full-width (4×1); self-hides when no alerts ── */}
        {!alertLoading && alerts && <AlertBanner alerts={alerts} />}

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

        {/* ── Today's Highlights — wide (2×1) ───────────────────────────── */}
        <TodaysHighlightsCard
          todayStats={todayStats}
          observation={observation}
          loading={obsLoading}
        />

        {/* ── Wind Compass — wide (2-col) ────────────────────────────────── */}
        <WindCompassCard observation={observation} />

        {/* Row: Precipitation · Barometer · Solar Radiation · UV Index ──── */}

        {/* ── Precipitation — tile ──────────────────────────────────────── */}
        <PrecipitationCard
          observation={observation}
          loading={obsLoading}
          error={obsError}
          onRetry={obsRefetch}
        />

        {/* ── Barometer — tile ──────────────────────────────────────────── */}
        <BarometerCard
          observation={observation}
          barometerTrendDirection={barometerTrendDirection}
          loading={obsLoading}
          error={obsError}
          onRetry={obsRefetch}
        />

        {/* ── Solar Radiation — tile ────────────────────────────────────── */}
        <SolarRadiationCard
          observation={observation}
          todayArchive={todayArchive ?? []}
          loading={obsLoading}
          error={obsError}
          onRetry={obsRefetch}
        />

        {/* ── UV Index — tile ───────────────────────────────────────────── */}
        <UvIndexCard
          observation={observation}
          todayArchive={todayArchive ?? []}
          todayForecast={todayForecast}
          loading={obsLoading}
          error={obsError}
          onRetry={obsRefetch}
        />

        {/* Row: AQI · Sun & Moon · Lightning · Earthquake ───────────────── */}

        {/* ── AQI — tile ────────────────────────────────────────────────── */}
        <AqiCard
          aqi={aqi}
          loading={aqiLoading}
          error={aqiError}
          onRetry={aqiRefetch}
        />

        {/* ── Sun & Moon — tile ─────────────────────────────────────────── */}
        <SunMoonCard
          almanac={almanac}
          loading={almLoading}
          error={almError}
          onRetry={almRefetch}
          stationTz={tz}
        />

        {/* ── Lightning — tile ──────────────────────────────────────────── */}
        <LightningCard
          observation={observation}
          lightning={lightning}
          loading={obsLoading}
          error={obsError}
        />

        {/* ── Earthquake — tile ─────────────────────────────────────────── */}
        <EarthquakeCard
          earthquakes={earthquakes}
          loading={eqLoading}
          error={eqError}
          onRetry={eqRefetch}
          stationTz={tz}
        />

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
