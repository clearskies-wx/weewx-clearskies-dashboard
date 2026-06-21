import { useState, useEffect, useMemo, Suspense } from 'react';
import type { WebcamConfig } from '../api/types';
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
import { getCard } from '../lib/card-registry';
import { fetchNowLayout, DEFAULT_NOW_LAYOUT } from '../lib/now-layout';
import type { NowLayoutConfig } from '../lib/now-layout';

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

  // ── Layout config (loaded from /now-layout.json; falls back to DEFAULT_NOW_LAYOUT) ──

  const [layoutConfig, setLayoutConfig] = useState<NowLayoutConfig>(DEFAULT_NOW_LAYOUT);

  useEffect(() => {
    fetchNowLayout().then(setLayoutConfig);
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
        Cards are rendered dynamically from the layout config loaded via
        fetchNowLayout(). Falls back to DEFAULT_NOW_LAYOUT when /now-layout.json
        is absent, producing the same 14-card arrangement as the previous
        hardcoded layout.
      */}
      <Grid>
        <Suspense fallback={null}>
          {layoutConfig.cards.map((entry) => {
            const reg = getCard(entry.type);
            if (!reg) return null;

            // Webcam special case: skip rendering when webcam is not configured/enabled
            if (entry.type === 'webcam' && !webcamEnabled) return null;

            const CardComponent = reg.component;
            return (
              <CardComponent
                key={entry.type}
                dataBag={dataBag}
                layout={{ footprint: entry.footprint, rowSpan: entry.rowSpan }}
                stationTz={tz}
              />
            );
          })}
        </Suspense>
      </Grid>
    </div>
  );
}

export default NowPage;
