import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { WebcamCard } from '../components/webcam-card';
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

export function NowPage() {
  const { t: tRadar } = useTranslation('radar');

  const branding = useBranding();

  const { data: observation, units, loading: obsLoading, error: obsError, refetch: obsRefetch, barometerTrendDirection, windSpeedAvg10m, windGustMax10m, scene } = useRealtimeObservation();
  const { data: forecast, loading: fcLoading, error: fcError } = useForecast();
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
  const [webcamConfig, setWebcamConfig] = useState<WebcamConfig | null>(null);

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

  // Derive a WMO weather code from the BFF scene descriptor when the forecast
  // provider doesn't supply one. The scene has sky (clear/cloudy/overcast) and
  // overlay (rain/snow/null) — enough to pick a representative icon.
  // Derive a WMO weather code for the CC card icon. The forecast provider may
  // return a WMO numeric code, a provider-specific string (e.g. Aeris "::SC"),
  // or null. Only use the forecast code if it's a valid WMO integer (0-99).
  // Otherwise fall back to deriving from the BFF scene descriptor.
  const derivedWeatherCode = (() => {
    const fc = todayForecast?.weatherCode;
    if (fc != null) {
      const n = typeof fc === 'number' ? fc : parseInt(String(fc), 10);
      if (!isNaN(n) && n >= 0 && n <= 99) return n;
    }
    if (!scene) return 0;
    if (scene.overlay === 'snow') return 71;
    if (scene.overlay === 'rain') return 61;
    if (scene.sky === 'storm') return 95;
    if (scene.sky === 'cloudy') return 2;
    return 0;
  })();

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
          weatherCode={derivedWeatherCode}
          todayHigh={todayStats?.high ?? null}
          todayLow={todayStats?.low ?? null}
          todayArchive={todayArchive ?? null}
          hourlyForecast={hourlyForecast ?? null}
          onRetry={obsRefetch}
        />

        {/* ── Wind Compass — 2×2 (wide + rowSpan 2), beside CC per A4 ──── */}
        <WindCompassCard observation={observation} windSpeedAvg10m={windSpeedAvg10m} windGustMax10m={windGustMax10m} />

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

        {/* Row: Precipitation · Barometer · Solar Radiation · UV Index ──── */}

        {/* ── Precipitation — tile ──────────────────────────────────────── */}
        <PrecipitationCard
          observation={observation}
          loading={obsLoading}
          error={obsError?.message ?? null}
          onRetry={obsRefetch}
        />

        {/* ── Barometer — tile ──────────────────────────────────────────── */}
        <BarometerCard
          observation={observation}
          barometerTrendDirection={barometerTrendDirection}
          loading={obsLoading}
          error={obsError?.message ?? null}
          onRetry={obsRefetch}
        />

        {/* ── Solar Radiation — tile ────────────────────────────────────── */}
        <SolarRadiationCard
          observation={observation}
          todayArchive={todayArchive ?? []}
          loading={obsLoading}
          error={obsError?.message ?? null}
          onRetry={obsRefetch}
        />

        {/* ── UV Index — tile ───────────────────────────────────────────── */}
        <UvIndexCard
          observation={observation}
          todayArchive={todayArchive ?? []}
          todayForecast={todayForecast}
          loading={obsLoading}
          error={obsError?.message ?? null}
          onRetry={obsRefetch}
        />

        {/* Row: AQI · Sun & Moon · Lightning · Earthquake ───────────────── */}

        {/* ── AQI — tile ────────────────────────────────────────────────── */}
        <AqiCard
          aqi={aqi}
          loading={aqiLoading}
          error={aqiError?.message ?? null}
          onRetry={aqiRefetch}
        />

        {/* ── Sun & Moon — tile ─────────────────────────────────────────── */}
        <SunMoonCard
          almanac={almanac}
          loading={almLoading}
          error={almError?.message ?? null}
          onRetry={almRefetch}
          stationTz={tz}
        />

        {/* ── Lightning — tile ──────────────────────────────────────────── */}
        <LightningCard
          observation={observation}
          lightning={lightning}
          loading={obsLoading}
          error={obsError?.message ?? null}
        />

        {/* ── Earthquake — tile ─────────────────────────────────────────── */}
        <EarthquakeCard
          earthquakes={earthquakes}
          loading={eqLoading}
          error={eqError?.message ?? null}
          onRetry={eqRefetch}
          stationTz={tz}
        />

        {/* ── Radar — 2×2 (wide + rowSpan 2) ────────────────────────────── */}
        <Card footprint="wide" rowSpan={2}>
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

        {/* ── Webcam — 2×2 (wide + rowSpan 2) ───────────────────────────── */}
        {webcamEnabled && webcamConfig && (
          <WebcamCard
            webcamConfig={webcamConfig}
            refreshTs={refreshTs}
            videoRefreshTs={videoRefreshTs}
          />
        )}

      </Grid>
    </div>
  );
}

export default NowPage;
