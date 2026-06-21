import { useState, useEffect, useMemo } from 'react';
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
import { RadarCard } from '../components/shared/radar-card';
import { WebcamCard } from '../components/webcam-card';
import { Grid } from '../components/layout/grid';
import { NowHeroCard } from '../components/layout/now-hero-card';
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
import type { DataBag } from '../lib/card-registry';
import { CARD_METADATA } from '../lib/card-metadata';

export function NowPage() {
  const branding = useBranding();

  // ── Data hooks ─────────────────────────────────────────────────────────────

  const { data: observation, units, loading: obsLoading, error: obsError, barometerTrendDirection, windSpeedAvg10m, windGustMax10m, scene } = useRealtimeObservation();
  const { data: forecast, loading: fcLoading, error: fcError } = useForecast();
  const { data: almanac, loading: almLoading, error: almError } = useSmartAlmanac();
  const { data: earthquakes, loading: eqLoading, error: eqError } = useEarthquakes();
  const { data: aqi, loading: aqiLoading, error: aqiError } = useAqi();
  const { data: station, loading: stationLoading } = useStation();

  const lightning = useLightning(observation);

  // ── Webcam config (loaded from static /webcam.json) ───────────────────────

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

  // ── DataBag construction ───────────────────────────────────────────────────
  //
  // A single DataBag is built once per render from all hook results and passed
  // to every card. Cards self-extract the fields they need from the bag.
  // The bag is stable across re-renders via useMemo to prevent unnecessary
  // re-renders of pure card components.

  const dataBag: DataBag = useMemo(() => ({
    // /api/v1/current — observation + envelope fields from useRealtimeObservation
    '/api/v1/current': {
      data: observation,
      units,
      loading: obsLoading,
      error: obsError,
      barometerTrendDirection,
      windSpeedAvg10m,
      windGustMax10m,
      scene,
    },
    // /api/v1/forecast — forecast bundle
    '/api/v1/forecast': {
      data: forecast,
      loading: fcLoading,
      error: fcError,
    },
    // /api/v1/almanac — almanac snapshot (smart today/tomorrow)
    '/api/v1/almanac': {
      data: almanac,
      loading: almLoading,
      error: almError,
    },
    // /api/v1/earthquakes — earthquake records
    '/api/v1/earthquakes': {
      data: earthquakes,
      loading: eqLoading,
      error: eqError,
    },
    // /api/v1/aqi/current — AQI reading
    '/api/v1/aqi/current': {
      data: aqi,
      loading: aqiLoading,
      error: aqiError,
    },
    // /api/v1/station — station metadata (lat/lon for radar map center)
    '/api/v1/station': {
      data: station,
      loading: stationLoading,
    },
    // lightning — derived from observation via useLightning (not an API endpoint)
    'lightning': {
      data: lightning,
    },
    // webcam — from /webcam.json static file + refresh timestamps
    'webcam': {
      config: webcamConfig,
      refreshTs,
      videoRefreshTs,
    },
  }), [
    observation, units, obsLoading, obsError,
    barometerTrendDirection, windSpeedAvg10m, windGustMax10m, scene,
    forecast, fcLoading, fcError,
    almanac, almLoading, almError,
    earthquakes, eqLoading, eqError,
    aqi, aqiLoading, aqiError,
    station, stationLoading,
    lightning,
    webcamConfig, refreshTs, videoRefreshTs,
  ]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const tz = station?.timezone ?? 'UTC';

  // Determine logo URL based on current theme
  const isDark = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme') === 'dark'
    : false;
  const logoUrl = isDark
    ? (branding.logo?.dark ?? branding.logo?.light)
    : branding.logo?.light;
  const logoAlt = branding.logo?.alt;

  // ── Layout helpers ─────────────────────────────────────────────────────────
  // Each card receives its default layout from CARD_METADATA.allowedLayouts[0].
  // Cards ignore the layout prop (they set their own footprint/rowSpan internally)
  // but the prop is required by CardComponentProps for the admin page contract.

  const layout = (type: keyof typeof CARD_METADATA) =>
    CARD_METADATA[type].allowedLayouts[0];

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
          dataBag={dataBag}
          layout={layout('current-conditions')}
          stationTz={tz}
        />

        {/* ── Today's Forecast — wide 2×2 (cols 3-4, rows 1-2) ─────────── */}
        <NowForecastCard
          dataBag={dataBag}
          layout={layout('now-forecast')}
          stationTz={tz}
        />

        {/* Row 3-4: Wind (tile 1×2) + Highlights (tile 1×2) + Precip/Baro/Solar/UV ── */}

        {/* ── Wind Compass — tile 1×2 (col 1, rows 3-4) ───────────────── */}
        <WindCompassCard
          dataBag={dataBag}
          layout={layout('wind-compass')}
          stationTz={tz}
        />

        {/* ── Today's Highlights — tile 1×2 (col 2, rows 3-4) ─────────── */}
        <TodaysHighlightsCard
          dataBag={dataBag}
          layout={layout('todays-highlights')}
          stationTz={tz}
        />

        {/* ── Precipitation — tile 1×1 (col 3, row 3) ─────────────────── */}
        <PrecipitationCard
          dataBag={dataBag}
          layout={layout('precipitation')}
          stationTz={tz}
        />

        {/* ── Barometer — tile 1×1 (col 4, row 3) ─────────────────────── */}
        <BarometerCard
          dataBag={dataBag}
          layout={layout('barometer')}
          stationTz={tz}
        />

        {/* ── Solar Radiation — tile 1×1 (col 3, row 4) ───────────────── */}
        <SolarRadiationCard
          dataBag={dataBag}
          layout={layout('solar-radiation')}
          stationTz={tz}
        />

        {/* ── UV Index — tile 1×1 (col 4, row 4) ──────────────────────── */}
        <UvIndexCard
          dataBag={dataBag}
          layout={layout('uv-index')}
          stationTz={tz}
        />

        {/* Row 5: AQI · Sun & Moon · Lightning · Earthquake (4 tiles) ──── */}

        {/* ── AQI — tile 1×1 (col 1, row 5) ───────────────────────────── */}
        <AqiCard
          dataBag={dataBag}
          layout={layout('aqi')}
          stationTz={tz}
        />

        {/* ── Sun & Moon — tile 1×1 (col 2, row 5) ────────────────────── */}
        <SunMoonCard
          dataBag={dataBag}
          layout={layout('sun-moon')}
          stationTz={tz}
        />

        {/* ── Lightning — tile 1×1 (col 3, row 5) ─────────────────────── */}
        <LightningCard
          dataBag={dataBag}
          layout={layout('lightning')}
          stationTz={tz}
        />

        {/* ── Earthquake — tile 1×1 (col 4, row 5) ────────────────────── */}
        <EarthquakeCard
          dataBag={dataBag}
          layout={layout('earthquake')}
          stationTz={tz}
        />

        {/* Row 6+: Radar (wide 2×2.5) + Webcam (wide 2×2.5) ─────────────── */}

        {/* ── Radar — wide 2×2.5 (cols 1-2, rows 6+) ──────────────────── */}
        <RadarCard
          dataBag={dataBag}
          layout={layout('radar')}
          stationTz={tz}
        />

        {/* ── Webcam — wide 2×2.5 (cols 3-4, rows 6+) ─────────────────── */}
        {webcamEnabled && (
          <WebcamCard
            dataBag={dataBag}
            layout={layout('webcam')}
            stationTz={tz}
          />
        )}

      </Grid>
    </div>
  );
}

export default NowPage;
