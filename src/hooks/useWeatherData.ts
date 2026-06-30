// useWeatherData.ts — Per-domain React hooks that fetch from the clearskies-api.
// Each hook checks isMockMode() first; if true, returns mock data synchronously.
// Otherwise it delegates to useApiQuery with the appropriate endpoint function.

import { useMemo, useState, useEffect } from 'react';
import { useApiQuery } from './useApiQuery';
import { isMockMode, ApiError } from '../api/client';
import {
  getCurrent,
  getArchive,
  getForecast,
  getAlerts,
  getAlmanac,
  getEarthquakes,
  getAqiCurrent,
  getRecords,
  getStation,
  getCapabilities,
  getRadarFrames,
  getChartGroups,
  getReports,
  getReport,
  getYearlyReport,
  getContent,
  getBranding,
  getGroupedArchive,
  getAlmanacPlanets,
  getAlmanacMoonNames,
  getAlmanacEclipses,
  getSolarEclipses,
  getAlmanacMeteorShowers,
  getEarthquakeConfig,
  getEarthquakeFaults,
  getAlmanacPositions,
  getChartsConfig,
  getCustomQuery,
} from '../api/client';
import type { ArchiveParams, ApiBrandingConfig } from '../api/client';
import { asConverted } from '../api/types';

// Mock data
import { mockCapabilities } from '../mock/station';
import { mockRadarFrameList } from '../mock/radar';
import { mockObservation, mockUnits } from '../mock/current';
import { mockForecast } from '../mock/forecast';
import { mockAlerts } from '../mock/alerts';
import { mockAlmanac } from '../mock/almanac';
import { mockEarthquakes } from '../mock/earthquakes';
import { mockAqi } from '../mock/current';
import { mockRecords } from '../mock/records';
import { mockStation } from '../mock/station';
import { mockArchiveData } from '../mock/archive';
import { mockLightning } from '../mock/lightning';
import { mockScene } from '../mock/scene';
import { mockPlanets } from '../mock/planets';
import { mockMoonNames } from '../mock/moonNames';
import { mockEclipses } from '../mock/eclipses';
import { mockMeteorShowers } from '../mock/meteorShowers';
import { mockChartsConfig } from '../mock/chartsConfig';

import type {
  Observation,
  CurrentResponse,
  SceneDescriptor,
  ForecastBundle,
  AlertRecord,
  AlmanacSnapshot,
  EarthquakeRecord,
  EarthquakeConfig,
  FaultFeatureCollection,
  AQIReading,
  RecordsBundle,
  StationMetadata,
  ArchiveRecord,
  CapabilityRegistry,
  RadarFrameList,
  ChartGroup,
  ReportEntry,
  NOAAReport,
  NOAAYearlyReport,
  ContentBlock,
  UnitsBlock,
  TodayStats,
  LightningData,
  GroupedArchiveData,
  PlanetsVisible,
  ApiMoonNamesCalendar,
  ApiSpecialMoonEntry,
  MoonNameData,
  LunarEclipseData,
  SolarEclipseData,
  MeteorShowerData,
  PositionsSnapshot,
  ChartsConfigData,
  StationClock,
  FreshnessInfo,
} from '../api/types';

// ---------------------------------------------------------------------------
// Shared result shape
// ---------------------------------------------------------------------------

interface HookResult<T> {
  data: T | null;
  units?: UnitsBlock;
  source?: string;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  stationClock?: StationClock;
  freshness?: FreshnessInfo;
}

// ---------------------------------------------------------------------------
// Helper: synchronous mock result
// ---------------------------------------------------------------------------

function mockResult<T>(data: T, units?: UnitsBlock): HookResult<T> {
  return {
    data,
    units,
    loading: false,
    error: null,
    refetch: () => {
      /* no-op in mock mode */
    },
  };
}

// ---------------------------------------------------------------------------
// useObservation — /current
// ---------------------------------------------------------------------------

/** Extended result shape for useObservation, adding BFF-computed envelope fields. */
interface ObservationHookResult extends HookResult<Observation> {
  /**
   * Pressure trend direction from the BFF envelope (ADR-041/ADR-042).
   * Not nested inside `data` — it is a top-level CurrentResponse field.
   */
  barometerTrendDirection: CurrentResponse['barometerTrendDirection'];

  /** 10-minute average wind speed from the BFF envelope (rolling window). */
  windSpeedAvg10m: CurrentResponse['windSpeedAvg10m'];

  /** Maximum gust over the last 10 minutes from the BFF envelope (rolling window). */
  windGustMax10m: CurrentResponse['windGustMax10m'];

  /**
   * ADR-047 background scene descriptor from the realtime service.
   * Falls back to the safe default (clear / night / no overlay) when the
   * server predates D1 or the response is not yet available.
   */
  scene: SceneDescriptor;

  /** True once the first /current response has provided real scene data.
   *  SceneBackground uses this to fade in, preventing a flash of the wrong
   *  default scene before real data arrives. */
  sceneLoaded: boolean;
}

/** Safe fallback scene when the server hasn't sent one yet.
 *  daytime: false prevents a flash of a bright daytime photo before the first
 *  /current response arrives; the dark navy SceneBackground base fills instead. */
const SCENE_DEFAULT: SceneDescriptor = { sky: 'clear', daytime: false, overlay: null };

export function useObservation(): ObservationHookResult {
  // Re-fetch /current every 60 seconds to pick up envelope fields
  // (windSpeedAvg10m, windGustMax10m, barometerTrendDirection, scene)
  // that are not available in SSE packets.
  // pollInterval replaces the previous manual setInterval/pollTick pattern (ADR-075).
  const { data, loading, error, refetch, freshness: apiFreshness } = useApiQuery<CurrentResponse>(
    (signal) => getCurrent(signal),
    { skip: isMockMode(), pollInterval: 60 },
  );

  if (isMockMode()) {
    return {
      ...mockResult<Observation>(mockObservation, mockUnits),
      barometerTrendDirection: 'falling',
      windSpeedAvg10m: null,
      windGustMax10m: null,
      scene: mockScene,
      sceneLoaded: true,
    };
  }

  return {
    data: data?.data ?? null,
    units: data?.units,
    source: data?.source,
    loading,
    error,
    refetch,
    stationClock: data?.stationClock,
    freshness: apiFreshness,
    barometerTrendDirection: data?.barometerTrendDirection ?? null,
    windSpeedAvg10m: data?.windSpeedAvg10m ?? null,
    windGustMax10m: data?.windGustMax10m ?? null,
    scene: data?.scene ?? SCENE_DEFAULT,
    sceneLoaded: data?.scene != null,
  };
}

// ---------------------------------------------------------------------------
// useForecast — /forecast
// ---------------------------------------------------------------------------

export interface UseForecastConfig {
  /** Optional: limit the number of hourly forecast hours returned by the API. */
  hours?: number;
}

export function useForecast(config?: UseForecastConfig): HookResult<ForecastBundle> {
  const hours = config?.hours;
  const { data, loading, error, refetch } = useApiQuery<{ data: ForecastBundle; units?: UnitsBlock; source?: string }>(
    (signal) => getForecast(hours, signal),
    { skip: isMockMode(), deps: [hours] },
  );

  if (isMockMode()) {
    return mockResult<ForecastBundle>(mockForecast);
  }

  return {
    data: data?.data ?? null,
    units: data?.units,
    source: data?.source,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useAlerts — /alerts  (data shape: { alerts, retrievedAt, source })
// ---------------------------------------------------------------------------

export function useAlerts(): HookResult<AlertRecord[]> {
  const { data, loading, error, refetch } = useApiQuery<{ data: { alerts: AlertRecord[]; retrievedAt: string; source: string }; source?: string }>(
    (signal) => getAlerts(signal) as Promise<{ data: { alerts: AlertRecord[]; retrievedAt: string; source: string }; source?: string; generatedAt: string }>,
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<AlertRecord[]>(mockAlerts);
  }

  return {
    data: data?.data?.alerts ?? null,
    source: data?.source,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useAlmanac — /almanac
// ---------------------------------------------------------------------------

export function useAlmanac(date?: string): HookResult<AlmanacSnapshot> {
  const { data, loading, error, refetch } = useApiQuery<{ data: AlmanacSnapshot }>(
    (signal) => getAlmanac(date, signal),
    { skip: isMockMode(), deps: [date] },
  );

  if (isMockMode()) {
    return mockResult<AlmanacSnapshot>(mockAlmanac);
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useEarthquakes — /earthquakes  (data is bare array)
// ---------------------------------------------------------------------------

export function useEarthquakes(): HookResult<EarthquakeRecord[]> {
  const { data, loading, error, refetch } = useApiQuery<{ data: EarthquakeRecord[]; source?: string; units?: UnitsBlock }>(
    (signal) => getEarthquakes(signal) as Promise<{ data: EarthquakeRecord[]; source?: string; units?: UnitsBlock; generatedAt: string }>,
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<EarthquakeRecord[]>(mockEarthquakes);
  }

  return {
    data: data?.data ?? null,
    units: data?.units ?? undefined,
    source: data?.source,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useAqi — /aqi/current  (data may be null)
// ---------------------------------------------------------------------------

export function useAqi(): HookResult<AQIReading | null> {
  const { data, loading, error, refetch } = useApiQuery<{ data: AQIReading | null; units?: UnitsBlock; source?: string }>(
    (signal) => getAqiCurrent(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<AQIReading | null>(mockAqi);
  }

  return {
    data: data?.data ?? null,
    units: data?.units,
    source: data?.source,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useRecords — /records
// ---------------------------------------------------------------------------

export function useRecords(period?: string): HookResult<RecordsBundle> {
  const { data, loading, error, refetch } = useApiQuery<{ data: RecordsBundle; units?: UnitsBlock; source?: string }>(
    (signal) => getRecords(period, signal),
    { skip: isMockMode(), deps: [period] },
  );

  if (isMockMode()) {
    return mockResult<RecordsBundle>(mockRecords, mockUnits);
  }

  return {
    data: data?.data ?? null,
    units: data?.units,
    source: data?.source,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useStation — /station
// ---------------------------------------------------------------------------

export function useStation(): HookResult<StationMetadata> {
  const { data, loading, error, refetch } = useApiQuery<{ data: StationMetadata; units?: UnitsBlock }>(
    (signal) => getStation(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<StationMetadata>(mockStation);
  }

  return {
    data: data?.data ?? null,
    units: data?.units,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useArchive — /archive
// ---------------------------------------------------------------------------

export function useArchive(params?: ArchiveParams, options?: { skip?: boolean }): HookResult<ArchiveRecord[]> {
  const fromStr = params?.from ?? '';
  const toStr = params?.to ?? '';
  const limitStr = params?.limit ?? '';
  const fieldsStr = params?.fields ?? '';
  const intervalStr = params?.interval ?? '';
  const aggIntervalStr = params?.aggregate_interval ?? '';
  const aggMapStr = params?.agg_map ?? '';
  const aggStr = params?.agg ?? '';

  const { data, loading, error, refetch } = useApiQuery<{ data: ArchiveRecord[]; units?: UnitsBlock; source?: string }>(
    (signal) => getArchive(params, signal) as Promise<{ data: ArchiveRecord[]; units?: UnitsBlock; source?: string; generatedAt: string }>,
    { skip: isMockMode() || options?.skip, deps: [fromStr, toStr, limitStr, fieldsStr, intervalStr, aggIntervalStr, aggMapStr, aggStr] },
  );

  if (isMockMode()) {
    return mockResult<ArchiveRecord[]>(mockArchiveData, mockUnits);
  }

  return {
    data: data?.data ?? null,
    units: data?.units,
    source: data?.source,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useChartGroups — /charts/groups
// ---------------------------------------------------------------------------

export function useChartGroups(): HookResult<ChartGroup[]> {
  const { data, loading, error, refetch } = useApiQuery<{ data: { groups: ChartGroup[] } }>(
    (signal) => getChartGroups(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<ChartGroup[]>([]);
  }

  return {
    data: data?.data?.groups ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useReports — /reports
// ---------------------------------------------------------------------------

export function useReports(): HookResult<ReportEntry[]> {
  const { data, loading, error, refetch } = useApiQuery<{ data: { reports: ReportEntry[] } } | null>(
    async (signal) => {
      try {
        return await getReports(signal);
      } catch (err) {
        // 404 means reports_directory is not configured on the API — treat as empty list.
        if (err instanceof ApiError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<ReportEntry[]>([]);
  }

  return {
    // null from the fetcher (404) becomes an empty array so the UI shows the empty-state message.
    data: data === null && !loading && !error ? [] : (data?.data?.reports ?? null),
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useReport — /reports/{year}/{month}
// ---------------------------------------------------------------------------

export function useReport(year: number | null, month: number | null): HookResult<NOAAReport> {
  const skip = isMockMode() || year === null || month === null;

  const { data, loading, error, refetch } = useApiQuery<{ data: NOAAReport }>(
    (signal) => getReport(year as number, month as number, signal),
    { skip, deps: [year, month] },
  );

  if (isMockMode()) {
    return mockResult<NOAAReport | null>(null) as HookResult<NOAAReport>;
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useYearlyReport — /reports/{year}
// ---------------------------------------------------------------------------

export function useYearlyReport(year: number | null): HookResult<NOAAYearlyReport> {
  const skip = isMockMode() || year === null;

  const { data, loading, error, refetch } = useApiQuery<{ data: NOAAYearlyReport }>(
    (signal) => getYearlyReport(year as number, signal),
    { skip, deps: [year] },
  );

  if (isMockMode()) {
    return mockResult<NOAAYearlyReport | null>(null) as HookResult<NOAAYearlyReport>;
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useContent — /content/{slug}  (404 → graceful empty)
// ---------------------------------------------------------------------------

export function useContent(slug: 'about' | 'legal'): HookResult<ContentBlock | null> {
  const { data, loading, error, refetch } = useApiQuery<{ data: ContentBlock } | null>(
    async (signal) => {
      try {
        return await getContent(slug, signal);
      } catch (err) {
        // 404 means no file configured — treat as graceful empty
        if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
          return null;
        }
        throw err;
      }
    },
    { skip: isMockMode(), deps: [slug] },
  );

  if (isMockMode()) {
    return mockResult<ContentBlock | null>(null);
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// Derived hook: useLightning
// Extracts lightning data from the current Observation.
// ---------------------------------------------------------------------------

export function useLightning(observation: Observation | null): LightningData | null {
  return useMemo(() => {
    if (isMockMode()) return mockLightning;
    if (!observation) return null;

    const unwrapNum = (v: unknown): number | null => {
      if (v == null) return null;
      if (typeof v === 'object' && v !== null && 'value' in v) return Number((v as { value: unknown }).value);
      if (typeof v === 'number') return v;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };

    const count1h = unwrapNum(observation.lightning_strike_count_1h ?? observation.lightning_strike_count);
    const count24h = unwrapNum(observation.lightning_strike_count);
    const nearestDistanceKm = unwrapNum(observation.lightning_distance);
    const lastStrikeTime = observation.lightning_last_det_time ?? null;

    // Only return data if at least some lightning fields are present
    if (count1h === null && count24h === null) return null;

    return {
      count1h: count1h ?? 0,
      count24h: count24h ?? 0,
      nearestDistanceKm,
      lastStrikeTime: lastStrikeTime ?? null,
    };
  }, [observation]);
}

// ---------------------------------------------------------------------------
// useBrandingApi — /branding  (Gap #10)
// Internal hook — consumed only by BrandingProvider, not by page components.
// Page components should use useBranding() from branding-provider.tsx instead.
// ---------------------------------------------------------------------------

export function useBrandingApi(): HookResult<ApiBrandingConfig> {
  const { data, loading, error, refetch } = useApiQuery<{ data: ApiBrandingConfig }>(
    (signal) => getBranding(signal),
    // Always skip in mock mode; BrandingProvider falls back to DEFAULT_BRANDING.
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return {
      data: null,
      loading: false,
      error: null,
      refetch: () => { /* no-op */ },
    };
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useCapabilities — /capabilities
// ---------------------------------------------------------------------------

export function useCapabilities(): HookResult<CapabilityRegistry> {
  const { data, loading, error, refetch } = useApiQuery<{ data: CapabilityRegistry }>(
    (signal) => getCapabilities(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<CapabilityRegistry>(mockCapabilities);
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useRadarFrames — /radar/providers/{providerId}/frames
// ---------------------------------------------------------------------------

export function useRadarFrames(
  providerId: string | null,
): HookResult<RadarFrameList> {
  // Skip when no provider is known — avoids a spurious call with the fallback id.
  const skip = isMockMode() || providerId === null;

  const { data, loading, error, refetch } = useApiQuery<{ data: RadarFrameList; generatedAt: string }>(
    (signal) => getRadarFrames(providerId as string, signal),
    { skip, deps: [providerId] },
  );

  if (isMockMode()) {
    return mockResult<RadarFrameList>(mockRadarFrameList);
  }

  return {
    data: data?.data ?? null,
    loading: providerId === null ? false : loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// Derived hook: useTodayStats
// Computes high/low/peakGust/rainSoFar from today's archive records.
// ---------------------------------------------------------------------------

export function useTodayStats(
  observation: Observation | null,
  todayArchive: ArchiveRecord[] | null,
  stationDate?: string,
  stationTz?: string,
): TodayStats | null {
  return useMemo(() => {
    if (isMockMode()) {
      // Return mock stats derived from mock observation to keep things consistent
      return {
        high: 78.2,
        low: 61.5,
        peakGust: 22.3,
        avgWind: 8.4,
        rainSoFar: 0.12,
        peakAQI: 0,
        recordsBrokenToday: [],
      };
    }

    if (!observation && (!todayArchive || todayArchive.length === 0)) return null;

    // Filter to today-only records using the station timezone when available
    // (ADR-075 T3.5). When stationDate + stationTz are provided, compare each
    // record's timestamp formatted in the station timezone against stationDate
    // rather than using browser-local midnight — which would be wrong for visitors
    // in a different timezone from the station.
    const todayRecords = (todayArchive ?? []).filter(rec => {
      if (stationDate && stationTz) {
        // en-CA locale produces YYYY-MM-DD — matches stationDate format exactly.
        // Formatter is created inside the filter for correctness; the archive is
        // typically small (288 records / 24h at 5-min interval), so this is fine.
        const recDate = new Intl.DateTimeFormat('en-CA', { timeZone: stationTz }).format(
          new Date(rec.timestamp),
        );
        return recDate === stationDate;
      }
      // Fallback: browser-local midnight (used when stationClock has not arrived yet).
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      return new Date(rec.timestamp).getTime() >= todayMidnight.getTime();
    });

    const records = todayRecords;

    // Archive records' numeric fields may arrive as ConvertedValue objects when
    // the BFF has applied unit conversion (ADR-042). Use asConverted() to
    // normalise both the raw-number and ConvertedValue cases before computing
    // statistics so that Math.max/min/sum operate on consistent numeric values.
    const temps = records
      .map((r) => {
        const cv = asConverted(r.outTemp as any);
        return cv?.value ?? null;
      })
      .filter((v): v is number => v !== null);

    const gusts = records
      .map((r) => {
        const cv = asConverted(r.windGust as any);
        return cv?.value ?? null;
      })
      .filter((v): v is number => v !== null);

    const winds = records
      .map((r) => {
        const cv = asConverted(r.windSpeed as any);
        return cv?.value ?? null;
      })
      .filter((v): v is number => v !== null);

    const rainValues = records
      .map((r) => {
        const cv = asConverted(r.rain as any);
        return cv?.value ?? null;
      })
      .filter((v): v is number => v !== null);

    // When no archive records exist, fall back to the current observation.
    // observation fields are ConvertedValue | number | null — extract .value.
    const fallbackTemp = asConverted(observation?.outTemp ?? null)?.value ?? null;
    const fallbackGust = asConverted(observation?.windGust ?? null)?.value ?? 0;
    const high = temps.length > 0 ? Math.max(...temps) : fallbackTemp;
    const low = temps.length > 0 ? Math.min(...temps) : fallbackTemp;
    const peakGust = gusts.length > 0 ? Math.max(...gusts) : fallbackGust;
    const avgWind = winds.length > 0 ? winds.reduce((a, b) => a + b, 0) / winds.length : null;
    const rainSoFar = rainValues.reduce((sum, v) => sum + v, 0);

    return {
      high,
      low,
      peakGust,
      avgWind,
      rainSoFar: Math.round(rainSoFar * 100) / 100,
      peakAQI: 0, // not available from archive; AQI hook handles this separately
      recordsBrokenToday: [],
    };
  }, [observation, todayArchive, stationDate, stationTz]);
}

// ---------------------------------------------------------------------------
// useGroupedArchive — /archive/grouped
//
// params=null means "don't fetch" — for call sites that conditionally need
// grouped data (e.g. charts without xAxisGroupby).
// ---------------------------------------------------------------------------

export function useGroupedArchive(params: {
  group_by: string;
  fields: string;
  from?: number;
  to?: number;
  force_full_period?: boolean;
} | null): HookResult<GroupedArchiveData> {
  const groupBy = params?.group_by ?? '';
  const fields = params?.fields ?? '';
  const from = params?.from;
  const to = params?.to;
  const forceFullPeriod = params?.force_full_period;

  const { data, loading, error, refetch } = useApiQuery<{ data: GroupedArchiveData }>(
    (signal) => getGroupedArchive(params!, signal),
    { skip: params === null || isMockMode(), deps: [groupBy, fields, from, to, forceFullPeriod] },
  );

  if (params === null) {
    return { data: null, loading: false, error: null, refetch: () => { /* no-op: params=null */ } };
  }

  if (isMockMode()) {
    // Return empty grouped data in mock mode — no mock fixture needed for this endpoint.
    return { data: { labels: [], series: {} }, loading: false, error: null, refetch: () => { /* no-op: mock mode */ } };
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useAlmanacPlanets — /almanac/planets
// ---------------------------------------------------------------------------

export function useAlmanacPlanets(): HookResult<PlanetsVisible> {
  const { data, loading, error, refetch } = useApiQuery<{ data: PlanetsVisible }>(
    (signal) => getAlmanacPlanets(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<PlanetsVisible>(mockPlanets);
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useAlmanacMoonNames — /almanac/moon-names
// ---------------------------------------------------------------------------

function _toMoonNameData(cal: ApiMoonNamesCalendar): MoonNameData | null {
  const now = Date.now();
  let closest: ApiSpecialMoonEntry | null = null;
  let closestDist = Infinity;
  for (const m of cal.moons) {
    const dist = Math.abs(new Date(m.date).getTime() - now);
    if (dist < closestDist) {
      closestDist = dist;
      closest = m;
    }
  }
  if (!closest) return null;
  const designations: string[] = [];
  if (closest.isHarvestMoon) designations.push('Harvest Moon');
  if (closest.isHuntersMoon) designations.push("Hunter's Moon");
  if (closest.isBlueMoon) designations.push('Blue Moon');
  if (closest.isSupermoon) designations.push('Supermoon');
  return {
    name: `${closest.traditionalName} Moon`,
    specialDesignations: designations,
  };
}

export function useAlmanacMoonNames(): HookResult<MoonNameData> {
  const { data, loading, error, refetch } = useApiQuery<{ data: ApiMoonNamesCalendar }>(
    (signal) => getAlmanacMoonNames(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<MoonNameData>(mockMoonNames);
  }

  const transformed = data?.data ? _toMoonNameData(data.data) : null;

  return {
    data: transformed,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useAlmanacEclipses — /almanac/eclipses/lunar
// ---------------------------------------------------------------------------

export function useAlmanacEclipses(): HookResult<LunarEclipseData> {
  const { data, loading, error, refetch } = useApiQuery<{ data: LunarEclipseData }>(
    (signal) => getAlmanacEclipses(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    // mockEclipses is typed as EclipseData (deprecated looser shape); cast is safe because
    // the runtime value is structurally compatible with LunarEclipseData — the missing
    // from_date/to_date fields simply default to undefined which components tolerate.
    return mockResult<LunarEclipseData>(mockEclipses as unknown as LunarEclipseData);
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useSolarEclipses — /almanac/eclipses/solar
// ---------------------------------------------------------------------------

export function useSolarEclipses(): HookResult<SolarEclipseData> {
  const { data, loading, error, refetch } = useApiQuery<{ data: SolarEclipseData }>(
    (signal) => getSolarEclipses(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<SolarEclipseData>({ from_date: '', to_date: '', eclipses: [] });
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useAlmanacMeteorShowers — /almanac/meteor-showers
// ---------------------------------------------------------------------------

export function useAlmanacMeteorShowers(): HookResult<MeteorShowerData> {
  const { data, loading, error, refetch } = useApiQuery<{ data: MeteorShowerData }>(
    (signal) => getAlmanacMeteorShowers(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<MeteorShowerData>(mockMeteorShowers);
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useEarthquakeConfig — /earthquakes/config
// ---------------------------------------------------------------------------

export function useEarthquakeConfig(): HookResult<EarthquakeConfig> {
  const { data, loading, error, refetch } = useApiQuery<{ data: EarthquakeConfig }>(
    (signal) => getEarthquakeConfig(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    // Reasonable defaults for mock/dev mode — matches ADR-040/ADR-046 field names.
    return mockResult<EarthquakeConfig>({
      provider: 'usgs',
      radiusKm: 100,
      minMagnitude: 2.0,
      defaultDays: 7,
    });
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useEarthquakeFaults — /earthquakes/faults  (bare GeoJSON FeatureCollection)
// ---------------------------------------------------------------------------

export function useEarthquakeFaults(): HookResult<FaultFeatureCollection> {
  const { data, loading, error, refetch } = useApiQuery<FaultFeatureCollection>(
    (signal) => getEarthquakeFaults(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    // Empty feature collection in mock mode — faults are optional geographic context.
    return mockResult<FaultFeatureCollection>({
      type: 'FeatureCollection',
      features: [],
      attribution: 'Active faults: GEM Global Active Faults Database, CC-BY-SA 4.0',
    });
  }

  return {
    data: data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useAlmanacPositions — /almanac/positions (60-second polling)
// ---------------------------------------------------------------------------

export function useAlmanacPositions(): HookResult<PositionsSnapshot> {
  // pollInterval replaces the previous manual setInterval/pollTick pattern (ADR-075).
  const { data, loading, error, refetch, freshness: apiFreshness } = useApiQuery<{ data: PositionsSnapshot }>(
    (signal) => getAlmanacPositions(signal),
    { skip: isMockMode(), pollInterval: 60 },
  );

  if (isMockMode()) {
    return mockResult<PositionsSnapshot>({
      sun: { azimuth: 238.4, altitude: 42.1 },
      moon: { azimuth: 142.7, altitude: 28.3, illuminationPercent: 88, phaseName: 'waxing-gibbous' },
    });
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: apiFreshness,
  };
}

// ---------------------------------------------------------------------------
// useChartsConfig — /charts/config
// ---------------------------------------------------------------------------

export function useChartsConfig(): HookResult<ChartsConfigData> {
  const { data, loading, error, refetch } = useApiQuery<{ data: ChartsConfigData; generatedAt: string }>(
    (signal) => getChartsConfig(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<ChartsConfigData>(mockChartsConfig);
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
    stationClock: (data as any)?.stationClock,
    freshness: (data as any)?.freshness,
  };
}

// ---------------------------------------------------------------------------
// useCustomQueries — /charts/custom-query/{seriesId} for multiple series
// ---------------------------------------------------------------------------

type CustomQueryResults = Record<string, Array<{ x: number | string; y: number | null }>>;

export function useCustomQueries(
  seriesIds: string[],
): { data: CustomQueryResults | null; loading: boolean; error: ApiError | null } {
  const [data, setData] = useState<CustomQueryResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const key = seriesIds.join(',');

  useEffect(() => {
    if (seriesIds.length === 0) {
      setData(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all(
      seriesIds.map((id) =>
        getCustomQuery(id, controller.signal)
          .then((resp) => ({ id, points: resp.data ?? [] }))
          .catch(() => ({ id, points: [] as Array<{ x: number | string; y: number | null }> })),
      ),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        const merged: CustomQueryResults = {};
        for (const r of results) {
          merged[r.id] = r.points;
        }
        setData(merged);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err : new ApiError(500, 'Custom query failed'));
        setLoading(false);
      });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}

