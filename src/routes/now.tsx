import { useState, useEffect } from 'react';
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

  const lightning = useLightning(observation);

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
    <div className="flex flex-col">
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

        {/* Row 1-2: Current Conditions (wide 2×2) + Today's Forecast (wide 2×2) ── */}

        {/* ── Current Conditions — wide 2×2 (cols 1-2, rows 1-2) ───────── */}
        <CurrentConditionsCard
          observation={observation}
          loading={obsLoading}
          error={obsError}
          units={units}
          weatherText={observation?.weatherText ?? todayForecast?.weatherText ?? null}
          weatherCode={derivedWeatherCode}
          isNight={scene ? !scene.daytime : false}
          todayHigh={todayForecast?.tempMax ?? null}
          todayLow={todayForecast?.tempMin ?? null}
          hourlyForecast={hourlyForecast ?? null}
          onRetry={obsRefetch}
        />

        {/* ── Today's Forecast — wide 2×2 (cols 3-4, rows 1-2) ─────────── */}
        <NowForecastCard
          forecast={forecast}
          loading={fcLoading}
          error={fcError}
          stationTz={station?.timezone}
        />

        {/* Row 3-4: Wind (tile 1×2) + Highlights (tile 1×2) + Precip/Baro/Solar/UV ── */}

        {/* ── Wind Compass — tile 1×2 (col 1, rows 3-4) ───────────────── */}
        <WindCompassCard observation={observation} windSpeedAvg10m={windSpeedAvg10m} windGustMax10m={windGustMax10m} />

        {/* ── Today's Highlights — tile 1×2 (col 2, rows 3-4) ─────────── */}
        <TodaysHighlightsCard
          observation={observation}
          loading={obsLoading}
        />

        {/* ── Precipitation — tile 1×1 (col 3, row 3) ─────────────────── */}
        <PrecipitationCard
          observation={observation}
          units={units}
          loading={obsLoading}
          error={obsError?.message ?? null}
          onRetry={obsRefetch}
        />

        {/* ── Barometer — tile 1×1 (col 4, row 3) ─────────────────────── */}
        <BarometerCard
          observation={observation}
          barometerTrendDirection={barometerTrendDirection}
          loading={obsLoading}
          error={obsError?.message ?? null}
          onRetry={obsRefetch}
        />

        {/* ── Solar Radiation — tile 1×1 (col 3, row 4) ───────────────── */}
        <SolarRadiationCard
          observation={observation}
          loading={obsLoading}
          error={obsError?.message ?? null}
          onRetry={obsRefetch}
        />

        {/* ── UV Index — tile 1×1 (col 4, row 4) ──────────────────────── */}
        <UvIndexCard
          observation={observation}
          todayForecast={todayForecast}
          sunrise={almanac?.sun?.rise ?? null}
          sunset={almanac?.sun?.set ?? null}
          loading={obsLoading}
          error={obsError?.message ?? null}
          onRetry={obsRefetch}
        />

        {/* Row 5: AQI · Sun & Moon · Lightning · Earthquake (4 tiles) ──── */}

        {/* ── AQI — tile 1×1 (col 1, row 5) ───────────────────────────── */}
        <AqiCard
          aqi={aqi}
          loading={aqiLoading}
          error={aqiError?.message ?? null}
          onRetry={aqiRefetch}
        />

        {/* ── Sun & Moon — tile 1×1 (col 2, row 5) ────────────────────── */}
        <SunMoonCard
          almanac={almanac}
          loading={almLoading}
          error={almError?.message ?? null}
          onRetry={almRefetch}
          stationTz={tz}
        />

        {/* ── Lightning — tile 1×1 (col 3, row 5) ─────────────────────── */}
        <LightningCard
          observation={observation}
          lightning={lightning}
          loading={obsLoading}
          error={obsError?.message ?? null}
        />

        {/* ── Earthquake — tile 1×1 (col 4, row 5) ────────────────────── */}
        <EarthquakeCard
          earthquakes={earthquakes}
          loading={eqLoading}
          error={eqError?.message ?? null}
          onRetry={eqRefetch}
          stationTz={tz}
        />

        {/* Row 6+: Radar (wide 2×2.5) + Webcam (wide 2×2.5) ─────────────── */}

        {/* ── Radar — wide 2×2.5 (cols 1-2, rows 6+) ──────────────────── */}
        {/* relative z-0: creates a stacking context to contain Leaflet's internal z-indices.
            min-h-[37.5rem]: 2.5-row height fallback on mobile where auto-rows:auto makes rowSpan inert.
            md:min-h-0 md:h-auto: on desktop the grid row-span controls height; min-h is removed. */}
        <Card footprint="wide" rowSpan={2.5} className="relative z-0 min-h-[37.5rem] md:min-h-0 md:h-auto">
          <CardHeader>
            <CardTitle as="h2">{tRadar('radarTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
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

        {/* ── Webcam — wide 2×2.5 (cols 3-4, rows 6+) ─────────────────── */}
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
