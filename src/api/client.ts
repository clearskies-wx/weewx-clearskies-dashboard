// client.ts — Base fetch wrapper and per-endpoint typed functions.
// Uses native fetch only — no axios, ky, or TanStack Query.

import type {
  ApiResponse,
  CurrentResponse,
  PaginatedResponse,
  ArchiveRecord,
  ForecastBundle,
  AlertList,
  AlmanacSnapshot,
  EarthquakeRecord,
  EarthquakeConfig,
  FaultFeatureCollection,
  AQIReading,
  RecordsBundle,
  StationMetadata,
  CapabilityRegistry,
  ChartGroup,
  ReportEntry,
  NOAAReport,
  NOAAYearlyReport,
  ContentBlock,
  PageMetadata,
  MarkdownContentResponse,
  ProblemDetail,
  RadarFramesResponse,
  GroupedArchiveData,
  PlanetsVisible,
  ApiMoonNamesCalendar,
  LunarEclipseData,
  SolarEclipseData,
  MeteorShowerData,
  PositionsSnapshot,
  ChartsConfigData,
} from './types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

export function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK === 'true';
}

// ---------------------------------------------------------------------------
// Base fetch helper
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  detail: ProblemDetail | null;

  constructor(status: number, message: string, detail: ProblemDetail | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Fetch a typed API response. Throws ApiError on non-2xx. Handles
 * Content-Type: application/problem+json for structured errors.
 */
export async function fetchApi<T>(
  path: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(
    `${API_BASE_URL}${path}`,
    // Use location.origin so relative URLs resolve correctly in all environments.
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  );

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType.includes('problem+json') || contentType.includes('application/json')) {
      try {
        const problem = (await response.json()) as ProblemDetail;
        throw new ApiError(response.status, problem.detail ?? problem.title, problem);
      } catch (parseError) {
        if (parseError instanceof ApiError) throw parseError;
      }
    }
    throw new ApiError(response.status, `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Per-endpoint functions
// Each returns the full envelope so callers can access .data, .units, .source, .generatedAt.
// ---------------------------------------------------------------------------

export function getCurrent(signal?: AbortSignal): Promise<CurrentResponse> {
  return fetchApi<CurrentResponse>('/current', undefined, signal);
}

export interface ArchiveParams {
  from?: string;
  to?: string;
  limit?: string;
  fields?: string;
  interval?: string;
  aggregate_interval?: string;
  agg_map?: string;
  /** Aggregate function to apply server-side: "max" | "min" | "avg" | "sum" */
  agg?: string;
}

export function getArchive(
  params?: ArchiveParams,
  signal?: AbortSignal,
): Promise<PaginatedResponse<ArchiveRecord[]>> {
  const p: Record<string, string> = {};
  if (params?.from) p['from'] = params.from;
  if (params?.to) p['to'] = params.to;
  if (params?.limit) p['limit'] = params.limit;
  if (params?.fields) p['fields'] = params.fields;
  if (params?.interval) p['interval'] = params.interval;
  if (params?.aggregate_interval) p['aggregate_interval'] = params.aggregate_interval;
  if (params?.agg_map) p['agg_map'] = params.agg_map;
  if (params?.agg) p['agg'] = params.agg;
  return fetchApi<PaginatedResponse<ArchiveRecord[]>>('/archive', p, signal);
}

export function getForecast(
  hours?: number,
  signal?: AbortSignal,
): Promise<ApiResponse<ForecastBundle>> {
  const p: Record<string, string> = {};
  if (hours !== undefined) p['hours'] = String(hours);
  return fetchApi<ApiResponse<ForecastBundle>>('/forecast', Object.keys(p).length ? p : undefined, signal);
}

export function getAlerts(signal?: AbortSignal): Promise<ApiResponse<AlertList>> {
  return fetchApi<ApiResponse<AlertList>>('/alerts', undefined, signal);
}

export function getAlmanac(
  date?: string,
  signal?: AbortSignal,
): Promise<ApiResponse<AlmanacSnapshot>> {
  const p: Record<string, string> = {};
  if (date) p['date'] = date;
  return fetchApi<ApiResponse<AlmanacSnapshot>>('/almanac', p, signal);
}

export function getEarthquakes(signal?: AbortSignal): Promise<ApiResponse<EarthquakeRecord[]>> {
  return fetchApi<ApiResponse<EarthquakeRecord[]>>('/earthquakes', undefined, signal);
}

export function getEarthquakeConfig(signal?: AbortSignal): Promise<ApiResponse<EarthquakeConfig>> {
  return fetchApi<ApiResponse<EarthquakeConfig>>('/earthquakes/config', undefined, signal);
}

export async function getEarthquakeFaults(signal?: AbortSignal): Promise<FaultFeatureCollection> {
  const resp = await fetchApi<{ data: FaultFeatureCollection; attribution?: string }>('/earthquakes/faults', undefined, signal);
  return { ...resp.data, attribution: resp.attribution ?? resp.data.attribution };
}

export function getAqiCurrent(signal?: AbortSignal): Promise<ApiResponse<AQIReading | null>> {
  return fetchApi<ApiResponse<AQIReading | null>>('/aqi/current', undefined, signal);
}

export function getRecords(
  period?: string,
  signal?: AbortSignal,
): Promise<ApiResponse<RecordsBundle>> {
  const p: Record<string, string> = {};
  if (period) p['period'] = period;
  return fetchApi<ApiResponse<RecordsBundle>>('/records', p, signal);
}

export function getStation(signal?: AbortSignal): Promise<ApiResponse<StationMetadata>> {
  return fetchApi<ApiResponse<StationMetadata>>('/station', undefined, signal);
}

export function getCapabilities(signal?: AbortSignal): Promise<ApiResponse<CapabilityRegistry>> {
  return fetchApi<ApiResponse<CapabilityRegistry>>('/capabilities', undefined, signal);
}

export function getChartGroups(signal?: AbortSignal): Promise<ApiResponse<{ groups: ChartGroup[] }>> {
  return fetchApi<ApiResponse<{ groups: ChartGroup[] }>>('/charts/groups', undefined, signal);
}

export function getChartsConfig(signal?: AbortSignal): Promise<ApiResponse<ChartsConfigData>> {
  return fetchApi<ApiResponse<ChartsConfigData>>('/charts/config', undefined, signal);
}

export function getCustomQuery(seriesId: string, signal?: AbortSignal): Promise<ApiResponse<Array<{ x: number | string; y: number | null }>>> {
  return fetchApi<ApiResponse<Array<{ x: number | string; y: number | null }>>>(`/charts/custom-query/${encodeURIComponent(seriesId)}`, undefined, signal);
}

export function getReports(signal?: AbortSignal): Promise<ApiResponse<{ reports: ReportEntry[] }>> {
  return fetchApi<ApiResponse<{ reports: ReportEntry[] }>>('/reports', undefined, signal);
}

export function getReport(
  year: number,
  month: number,
  signal?: AbortSignal,
): Promise<ApiResponse<NOAAReport>> {
  return fetchApi<ApiResponse<NOAAReport>>(`/reports/${year}/${month}`, undefined, signal);
}

export function getYearlyReport(
  year: number,
  signal?: AbortSignal,
): Promise<ApiResponse<NOAAYearlyReport>> {
  return fetchApi<ApiResponse<NOAAYearlyReport>>(`/reports/${year}`, undefined, signal);
}

export function getContent(
  slug: 'about' | 'legal',
  signal?: AbortSignal,
): Promise<ApiResponse<ContentBlock>> {
  return fetchApi<ApiResponse<ContentBlock>>(`/content/${slug}`, undefined, signal);
}

export function getPages(signal?: AbortSignal): Promise<ApiResponse<{ pages: PageMetadata[] }>> {
  return fetchApi<ApiResponse<{ pages: PageMetadata[] }>>('/pages', undefined, signal);
}

// NOTE: /pages/{slug}/content is not yet in the OpenAPI v1 contract (gap).
// The endpoint shape matches MarkdownResponse (MarkdownContent data + generatedAt).
export function getPageContent(slug: string, signal?: AbortSignal): Promise<MarkdownContentResponse> {
  return fetchApi<MarkdownContentResponse>(`/pages/${slug}/content`, undefined, signal);
}

export function getRadarFrames(
  providerId: string,
  signal?: AbortSignal,
): Promise<RadarFramesResponse> {
  return fetchApi<RadarFramesResponse>(
    `/radar/providers/${encodeURIComponent(providerId)}/frames`,
    undefined,
    signal,
  );
}

// ---------------------------------------------------------------------------
// GET /branding — operator branding configuration (Gap #10)
// Field names match the OpenAPI contract (lightUrl / darkUrl).
// The internal BrandingConfig in branding.ts uses light/dark — mapping is
// done at the provider boundary (branding-provider.tsx).
// ---------------------------------------------------------------------------

export interface ApiBrandingConfig {
  accent: string;
  defaultThemeMode: string;
  logo: {
    lightUrl: string;
    darkUrl?: string;
    alt: string;
  } | null;
  customCssUrl: string | null;
  siteTitle?: string;
  faviconUrl?: string;
  /** Copyright entity name; the API may use camelCase or snake_case. */
  copyrightEntity?: string;
  copyright_entity?: string;
  social?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    youtube?: string;
  };
}

export function getBranding(signal?: AbortSignal): Promise<ApiResponse<ApiBrandingConfig>> {
  return fetchApi<ApiResponse<ApiBrandingConfig>>('/branding', undefined, signal);
}

// ---------------------------------------------------------------------------
// GET /archive/grouped
// ---------------------------------------------------------------------------

export function getGroupedArchive(
  params: {
    group_by: string;
    fields: string;
    from?: number;
    to?: number;
    force_full_period?: boolean;
  },
  signal?: AbortSignal,
): Promise<ApiResponse<GroupedArchiveData>> {
  const p: Record<string, string> = {
    group_by: params.group_by,
    fields: params.fields,
  };
  if (params.from !== undefined) p['from'] = String(params.from);
  if (params.to !== undefined) p['to'] = String(params.to);
  if (params.force_full_period !== undefined) p['force_full_period'] = String(params.force_full_period);
  return fetchApi<ApiResponse<GroupedArchiveData>>('/archive/grouped', p, signal);
}

// ---------------------------------------------------------------------------
// GET /almanac/planets
// ---------------------------------------------------------------------------

export function getAlmanacPlanets(
  signal?: AbortSignal,
): Promise<ApiResponse<PlanetsVisible>> {
  return fetchApi<ApiResponse<PlanetsVisible>>('/almanac/planets', undefined, signal);
}

// ---------------------------------------------------------------------------
// GET /almanac/moon-names
// ---------------------------------------------------------------------------

export function getAlmanacMoonNames(
  signal?: AbortSignal,
): Promise<ApiResponse<ApiMoonNamesCalendar>> {
  return fetchApi<ApiResponse<ApiMoonNamesCalendar>>('/almanac/moon-names', undefined, signal);
}

// ---------------------------------------------------------------------------
// GET /almanac/eclipses/lunar
// ---------------------------------------------------------------------------

export function getAlmanacEclipses(
  signal?: AbortSignal,
): Promise<ApiResponse<LunarEclipseData>> {
  return fetchApi<ApiResponse<LunarEclipseData>>('/almanac/eclipses/lunar', undefined, signal);
}

// ---------------------------------------------------------------------------
// GET /almanac/eclipses/solar
// ---------------------------------------------------------------------------

export function getSolarEclipses(
  signal?: AbortSignal,
): Promise<ApiResponse<SolarEclipseData>> {
  return fetchApi<ApiResponse<SolarEclipseData>>('/almanac/eclipses/solar', undefined, signal);
}

// ---------------------------------------------------------------------------
// GET /almanac/meteor-showers
// ---------------------------------------------------------------------------

export function getAlmanacMeteorShowers(
  signal?: AbortSignal,
): Promise<ApiResponse<MeteorShowerData>> {
  return fetchApi<ApiResponse<MeteorShowerData>>('/almanac/meteor-showers', undefined, signal);
}

// ---------------------------------------------------------------------------
// GET /almanac/positions
// ---------------------------------------------------------------------------

export function getAlmanacPositions(
  signal?: AbortSignal,
): Promise<ApiResponse<PositionsSnapshot>> {
  return fetchApi<ApiResponse<PositionsSnapshot>>('/almanac/positions', {}, signal);
}

