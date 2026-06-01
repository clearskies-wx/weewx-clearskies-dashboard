// useWeatherData.ts — Per-domain React hooks that fetch from the clearskies-api.
// Each hook checks isMockMode() first; if true, returns mock data synchronously.
// Otherwise it delegates to useApiQuery with the appropriate endpoint function.

import { useMemo } from 'react';
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
  getClimatologyMonthly,
  getAlmanacPlanets,
  getAlmanacMoonNames,
  getAlmanacEclipses,
  getAlmanacMeteorShowers,
  getEarthquakeConfig,
  getEarthquakeFaults,
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
import { mockClimatology } from '../mock/climatology';
import { mockPlanets } from '../mock/planets';
import { mockMoonNames } from '../mock/moonNames';
import { mockEclipses } from '../mock/eclipses';
import { mockMeteorShowers } from '../mock/meteorShowers';

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
  ClimatologyMonthly,
  PlanetsVisible,
  ApiMoonNamesCalendar,
  ApiSpecialMoonEntry,
  MoonNameData,
  EclipseData,
  MeteorShowerData,
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

  /**
   * ADR-047 background scene descriptor from the realtime service.
   * Falls back to the safe default (clear / daytime / no overlay) when the
   * server predates D1 or the response is not yet available.
   */
  scene: SceneDescriptor;
}

/** Safe fallback scene when the server hasn't sent one yet. */
const SCENE_DEFAULT: SceneDescriptor = { sky: 'clear', daytime: true, overlay: null };

export function useObservation(): ObservationHookResult {
  const { data, loading, error, refetch } = useApiQuery<CurrentResponse>(
    (signal) => getCurrent(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return {
      ...mockResult<Observation>(mockObservation, mockUnits),
      barometerTrendDirection: 'falling',
      scene: mockScene,
    };
  }

  return {
    data: data?.data ?? null,
    units: data?.units,
    source: data?.source,
    loading,
    error,
    refetch,
    barometerTrendDirection: data?.barometerTrendDirection ?? null,
    scene: data?.scene ?? SCENE_DEFAULT,
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
  };
}

// ---------------------------------------------------------------------------
// useEarthquakes — /earthquakes  (data is bare array)
// ---------------------------------------------------------------------------

export function useEarthquakes(): HookResult<EarthquakeRecord[]> {
  const { data, loading, error, refetch } = useApiQuery<{ data: EarthquakeRecord[]; source?: string }>(
    (signal) => getEarthquakes(signal) as Promise<{ data: EarthquakeRecord[]; source?: string; generatedAt: string }>,
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<EarthquakeRecord[]>(mockEarthquakes);
  }

  return {
    data: data?.data ?? null,
    source: data?.source,
    loading,
    error,
    refetch,
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
  };
}

// ---------------------------------------------------------------------------
// useArchive — /archive
// ---------------------------------------------------------------------------

export function useArchive(params?: ArchiveParams): HookResult<ArchiveRecord[]> {
  const fromStr = params?.from ?? '';
  const toStr = params?.to ?? '';
  const limitStr = params?.limit ?? '';
  const fieldsStr = params?.fields ?? '';
  const intervalStr = params?.interval ?? '';

  const { data, loading, error, refetch } = useApiQuery<{ data: ArchiveRecord[]; units?: UnitsBlock; source?: string }>(
    (signal) => getArchive(params, signal) as Promise<{ data: ArchiveRecord[]; units?: UnitsBlock; source?: string; generatedAt: string }>,
    { skip: isMockMode(), deps: [fromStr, toStr, limitStr, fieldsStr, intervalStr] },
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

    const count1h = observation.lightning_strike_count_1h ?? observation.lightning_strike_count ?? null;
    const count24h = observation.lightning_strike_count ?? null;
    const nearestDistanceKm = observation.lightning_distance ?? null;
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
  };
}

// ---------------------------------------------------------------------------
// Derived hook: useTodayStats
// Computes high/low/peakGust/rainSoFar from today's archive records.
// ---------------------------------------------------------------------------

export function useTodayStats(
  observation: Observation | null,
  todayArchive: ArchiveRecord[] | null,
): TodayStats | null {
  return useMemo(() => {
    if (isMockMode()) {
      // Return mock stats derived from mock observation to keep things consistent
      return {
        high: 78.2,
        low: 61.5,
        peakGust: 22.3,
        rainSoFar: 0.12,
        peakAQI: 0,
        recordsBrokenToday: [],
      };
    }

    if (!observation && (!todayArchive || todayArchive.length === 0)) return null;

    const records = todayArchive ?? [];

    const temps = records
      .map((r) => r.outTemp)
      .filter((v): v is number => v !== null && v !== undefined);

    const gusts = records
      .map((r) => r.windGust)
      .filter((v): v is number => v !== null && v !== undefined);

    const rainValues = records
      .map((r) => r.rain)
      .filter((v): v is number => v !== null && v !== undefined);

    // When no archive records exist, fall back to the current observation.
    // observation fields are ConvertedValue | number | null — extract .value.
    const fallbackTemp = asConverted(observation?.outTemp ?? null)?.value ?? null;
    const fallbackGust = asConverted(observation?.windGust ?? null)?.value ?? 0;
    const high = temps.length > 0 ? Math.max(...temps) : fallbackTemp;
    const low = temps.length > 0 ? Math.min(...temps) : fallbackTemp;
    const peakGust = gusts.length > 0 ? Math.max(...gusts) : fallbackGust;
    const rainSoFar = rainValues.reduce((sum, v) => sum + v, 0);

    return {
      high,
      low,
      peakGust,
      rainSoFar: Math.round(rainSoFar * 100) / 100,
      peakAQI: 0, // not available from archive; AQI hook handles this separately
      recordsBrokenToday: [],
    };
  }, [observation, todayArchive]);
}

// ---------------------------------------------------------------------------
// useClimatologyMonthly — /climatology/monthly
// ---------------------------------------------------------------------------

export function useClimatologyMonthly(): HookResult<ClimatologyMonthly> {
  const { data, loading, error, refetch } = useApiQuery<{ data: ClimatologyMonthly }>(
    (signal) => getClimatologyMonthly(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<ClimatologyMonthly>(mockClimatology);
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
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
  };
}

// ---------------------------------------------------------------------------
// useAlmanacEclipses — /almanac/eclipses
// ---------------------------------------------------------------------------

export function useAlmanacEclipses(): HookResult<EclipseData> {
  const { data, loading, error, refetch } = useApiQuery<{ data: EclipseData }>(
    (signal) => getAlmanacEclipses(signal),
    { skip: isMockMode() },
  );

  if (isMockMode()) {
    return mockResult<EclipseData>(mockEclipses);
  }

  return {
    data: data?.data ?? null,
    loading,
    error,
    refetch,
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
  };
}
