import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { WebcamConfig } from '../api/types';
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
  useEarthquakes,
  useAqi,
  useStation,
  useLightning,
  useArchive,
  useTodayStats,
} from '../hooks/useWeatherData';
import { useSmartAlmanac } from '../hooks/useSmartAlmanac';
import { useRealtimeObservation } from '../hooks/useRealtimeObservation';
import { useBranding } from '../lib/branding-provider';
import { toWmoCode } from '../utils/weather-code';

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
  const { data: almanac, loading: almLoading, error: almError, refetch: almRefetch } = useSmartAlmanac();
  const { data: earthquakes, loading: eqLoading, error: eqError, refetch: eqRefetch } = useEarthquakes();
  const { data: aqi, loading: aqiLoading, error: aqiError, refetch: aqiRefetch } = useAqi();
  const { data: station } = useStation();

  // Single 24h rolling archive — covers both SolarRadiationCard (needs full 24h)
  // and useTodayStats (filters to midnight-onward internally).
  // Memoized with [] deps so the ISO string is stable across renders and does
  // not cause useArchive to re-fetch on every render cycle.
  const archiveStart24h = useMemo(
    () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    [],
  );
  const { data: todayArchive, refetch: archiveRefetch } = useArchive({ from: archiveStart24h });

  useEffect(() => {
    const id = setInterval(() => archiveRefetch(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [archiveRefetch]);

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

  // Derive a WMO weather code for the CC card icon.
  // Priority: conditions engine weatherCode (integer, from BFF) > forecast daily
  // code (string, mapped via toWmoCode) > 0 (clear fallback).
  // Scene is NOT used here; it drives background theming only (4d).
  const derivedWeatherCode = observation?.weatherCode ?? toWmoCode(todayForecast?.weatherCode) ?? 0;

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

      {/* ── Hero bar — block-level, naturally full-width outside grid ─────── */}
      <NowHeroCard
        stationName={branding.siteTitle}
        location={station?.name ?? undefined}
        logoUrl={logoUrl}
        logoAlt={logoAlt}
      />

      {/*
        A4 Grid primitive — 4 columns on lg, 2 on md, 1 on mobile.
        Only weather data cards live here; hero and alert are above.
        Row track: --card-row (11rem) at md+.
      */}
      <Grid>

        {/* ── Current Conditions — 2×2 (wide + rowSpan 2) ──────────────── */}
        <CurrentConditionsCard
          observation={observation}
          loading={obsLoading}
          error={obsError}
          units={units}
          weatherText={observation?.weatherText ?? todayForecast?.weatherText ?? null}
          weatherCode={derivedWeatherCode}
          isNight={scene ? !scene.daytime : false}
          todayHigh={todayForecast?.tempMax ?? todayStats?.high ?? null}
          todayLow={todayForecast?.tempMin ?? todayStats?.low ?? null}
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
          units={units}
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
          sunrise={almanac?.sun?.rise ?? null}
          sunset={almanac?.sun?.set ?? null}
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
        {/* relative z-0: creates a stacking context to contain Leaflet's internal z-indices (T1.3).
            min-h-[var(--card-row)]: prevents map canvas collapsing when auto-rows is `auto` on mobile. */}
        <Card footprint="wide" rowSpan={2} className="relative z-0 min-h-[var(--card-row)]">
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
