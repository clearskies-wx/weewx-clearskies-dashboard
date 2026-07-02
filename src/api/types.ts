// types.ts — All TypeScript interfaces for the clearskies-api v1.
// Matches the OpenAPI v1 contract shapes exactly.
// Dashboard-derived types (not from a single endpoint) are marked with a comment.

// ---------------------------------------------------------------------------
// BFF unit-converted value (ADR-042)
// ---------------------------------------------------------------------------

/**
 * ConvertedValue — the shape the BFF emits for every observation field.
 *
 * The BFF (ADR-041) converts all observation values to operator display units
 * and attaches a label and pre-formatted string.  Components must render
 * `.formatted` for display and use `.label` for the unit string.
 *
 * Some fields (e.g. UV, radiation) may arrive as raw numbers when the BFF
 * has no configured conversion for that group.  Use asConverted() to
 * normalise both cases.
 */
export interface ConvertedValue {
  value: number | null;
  label: string;
  formatted: string;
}

/**
 * asConverted — normalise a BFF field to ConvertedValue.
 *
 * Handles three cases:
 *   - Already a ConvertedValue object: returned as-is.
 *   - Raw number (BFF without unit config for that group): wrapped with
 *     empty label and String(val) formatted.
 *   - null / undefined: returns null.
 *
 * Components should call asConverted() on every Observation field before
 * accessing .value / .label / .formatted so they don't need to branch on
 * the ConvertedValue | number | null union.
 */
export function asConverted(
  val: ConvertedValue | number | null | undefined,
): ConvertedValue | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && 'value' in val) return val as ConvertedValue;
  if (typeof val === 'number') return { value: val, label: '', formatted: String(val) };
  return null;
}

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export interface UnitsBlock {
  [canonicalField: string]: string;
}

export interface PageInfo {
  from: string | null;
  to: string | null;
  limit: number;
  count: number;
}

/** ADR-075: Station clock — the station's current local date and time. */
export interface StationClock {
  /** Station-local date as YYYY-MM-DD. Canonical answer to "what day is it?" */
  date: string;
  /** Station-local time as ISO-8601 with UTC offset (e.g. "2026-06-27T22:30:00-04:00"). */
  time: string;
  /** IANA timezone identifier (e.g. "America/New_York"). */
  timezone: string;
}

/** ADR-075: Freshness envelope — tells the dashboard when to refetch. */
export interface FreshnessInfo {
  /** UTC ISO-8601 Z timestamp when the API produced this response. */
  generatedAt: string;
  /** UTC ISO-8601 Z timestamp after which data should be considered stale. */
  validUntil: string;
  /** How often this data type typically updates at the source, in seconds. */
  refreshInterval: number;
}

/** Standard API envelope for most endpoints. */
export interface ApiResponse<T> {
  data: T;
  units?: UnitsBlock;
  source?: string;
  generatedAt: string;
  stationClock?: StationClock;    // ADR-075 — present on all API responses
  freshness?: FreshnessInfo;      // ADR-075 — present on cacheable responses only
}

/**
 * SceneDescriptor — ADR-047 background system scene tag emitted by the realtime
 * service on GET /current and the SSE stream.
 *
 * The dashboard maps this descriptor to asset paths via SCENE_ASSET_MAP
 * (src/components/background/scene-background.tsx) — no weather logic runs here.
 *
 * Field values match scene.py build_scene() exactly:
 *   sky:     "clear" | "cloudy" | "storm"
 *   daytime: true when current UTC time is between almanac sunrise and sunset
 *   overlay: "rain" | "snow" | null (null when no precip or linger expired)
 *
 * NOTE: The openapi-v1.yaml contract does not yet include this field (D1
 * delivered it server-side; the contract update is pending).  This type is
 * hand-maintained here to match the actual build_scene() return shape.
 */
export interface SceneDescriptor {
  sky: 'clear' | 'cloudy' | 'storm';
  daytime: boolean;
  overlay: 'rain' | 'snow' | null;
}

/**
 * CurrentResponse — envelope returned by GET /current.
 *
 * Extends the standard ApiResponse with BFF-computed top-level fields.
 * `barometerTrendDirection` is emitted at the envelope level (alongside `data`,
 * not nested inside `data`), because it is derived by the BFF from the last
 * N loop packets and is not a direct weewx observation field (ADR-041/ADR-042).
 *
 * `scene` is the ADR-047 background-system descriptor computed server-side.
 * It is optional here so callers can handle the case where the realtime service
 * is an older version that predates D1 (fall back to clear/day/no-overlay).
 */
export interface CurrentResponse extends ApiResponse<Observation> {
  /**
   * Pressure trend direction computed by the BFF from the last N loop packets.
   * "rising" | "falling" | "steady" — or null when insufficient data.
   * Do NOT apply client-side numeric thresholds (ADR-042).
   */
  barometerTrendDirection: 'rising' | 'falling' | 'steady' | null;

  /** 10-minute average wind speed from BFF rolling window (envelope-level field). */
  windSpeedAvg10m?: ConvertedValue | number | null;

  /** Maximum gust over the last 10 minutes from BFF rolling window (envelope-level field). */
  windGustMax10m?: ConvertedValue | number | null;

  /**
   * ADR-047 background scene descriptor.  Optional: absent on older realtime
   * service versions that predate D1.  Dashboard falls back to the safe default
   * (clear / daytime / no overlay) when absent.
   */
  scene?: SceneDescriptor;
}

/** Paginated variant — used by /archive. */
export interface PaginatedResponse<T> extends ApiResponse<T> {
  page: PageInfo;
}

/** RFC 9457 problem+json error shape. */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

// ---------------------------------------------------------------------------
// /current
// ---------------------------------------------------------------------------

export interface Observation {
  timestamp: string;
  // Numeric observation fields are ConvertedValue when the BFF has applied unit
  // conversion (ADR-042), or a raw number when the BFF has no conversion config
  // for that group.  Use asConverted() to normalise before reading .value /
  // .label / .formatted.
  outTemp: ConvertedValue | number | null;
  outHumidity: ConvertedValue | number | null;
  windSpeed: ConvertedValue | number | null;
  windDir: ConvertedValue | number | null;
  windGust: ConvertedValue | number | null;
  windGustDir: ConvertedValue | number | null;
  /**
   * 10-minute average wind speed — computed by BFF (ADR-042).
   * Absent before BFF rolling-window has sufficient data.
   */
  windSpeedAvg10m?: ConvertedValue | number | null;
  /**
   * Maximum wind gust over the last 10 minutes — computed by BFF (ADR-042).
   * Absent before BFF rolling-window has sufficient data.
   */
  windGustMax10m?: ConvertedValue | number | null;
  barometer: ConvertedValue | number | null;
  pressure: ConvertedValue | number | null;
  altimeter: ConvertedValue | number | null;
  dewpoint: ConvertedValue | number | null;
  windchill: ConvertedValue | number | null;
  heatindex: ConvertedValue | number | null;
  rainRate: ConvertedValue | number | null;
  rain: ConvertedValue | number | null;
  snow: ConvertedValue | number | null;
  snowRate: ConvertedValue | number | null;
  snowDepth: ConvertedValue | number | null;
  barometerTrend: ConvertedValue | number | null;
  radiation: ConvertedValue | number | null;
  UV: ConvertedValue | number | null;
  inTemp: ConvertedValue | number | null;
  inHumidity: ConvertedValue | number | null;
  appTemp: ConvertedValue | number | null;
  /** Lightning fields — present only when lightning sensor configured. */
  lightning_strike_count?: number | null;
  lightning_strike_count_1h?: number | null;
  lightning_distance?: ConvertedValue | number | null;
  lightning_last_det_time?: string | null;
  /** Rolling 24h window of detected lightning strikes (time + distance pairs). Null when lightning detection is unavailable. Empty array when no strikes in the window. */
  lightningStrikeHistory?: Array<{ time: string; distance: number }> | null;
  /** Weather description text — present when observation includes a text summary (Phase 0B). */
  weatherText?: string | null;
  /**
   * WMO weather code from the conditions engine — integer (e.g. 0 = clear, 61 = rain,
   * 71 = snow, 95 = thunderstorm).  Present when the BFF conditions engine is active.
   * Use this in preference to scene-derived codes for the weather icon.
   */
  weatherCode?: number | null;
  /**
   * Beaufort scale — computed by BFF (ADR-042).
   * .value: Beaufort number (0–12).
   * .label: localised descriptor (e.g. "Gentle breeze").
   * .formatted: Beaufort number as string.
   */
  beaufort?: ConvertedValue | null;
  /**
   * Comfort index selection — computed by BFF (ADR-042).
   * "windChill" when temperature is in the cold range.
   * "heatIndex" when temperature is in the heat range.
   * "none" when neither applies.
   */
  comfortIndex?: 'windChill' | 'heatIndex' | 'none';
  /**
   * Canonical 16-point cardinal code for wind direction — computed by BFF (ADR-041).
   * One of: N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW
   * null when windDir is null.
   * Use with i18n: t('directions.' + windDirCardinal) (ADR-021).
   * Do NOT compute this client-side from windDir degrees for /current; use this value.
   */
  windDirCardinal?: string | null;
  /**
   * Canonical 16-point cardinal code for wind gust direction — computed by BFF (ADR-041).
   * Same code set as windDirCardinal. null when windGustDir is null.
   */
  windGustDirCardinal?: string | null;
  extras: Record<string, number | string | boolean | null>;
  source: string;
}

// ---------------------------------------------------------------------------
// /archive
// ---------------------------------------------------------------------------

export interface ArchiveRecord {
  timestamp: string;
  outTemp: number | null;
  windSpeed: number | null;
  windDir: number | null;
  windGust: number | null;
  barometer: number | null;
  rain: number | null;
  radiation: number | null;
  UV: number | null;
  [field: string]: number | string | null | undefined;
}

// ---------------------------------------------------------------------------
// /forecast
// ---------------------------------------------------------------------------

export interface HourlyForecastPoint {
  validTime: string;
  outTemp: number | null;
  outHumidity: number | null;
  windSpeed: number | null;
  windDir: number | null;
  windGust: number | null;
  precipProbability: number | null;
  precipAmount: number | null;
  precipType: string | null;
  snowAmount: number | null;
  cloudCover: number | null;
  weatherCode: string | null;
  weatherText: string | null;
  source: string;
  extras: Record<string, number | string | boolean | null>;
}

export interface DailyForecastPoint {
  validDate: string;
  tempMax: number | null;
  tempMin: number | null;
  precipAmount: number | null;
  precipProbabilityMax: number | null;
  windSpeedMax: number | null;
  windGustMax: number | null;
  sunrise: string | null;
  sunset: string | null;
  uvIndexMax: number | null;
  weatherCode: string | null;
  weatherText: string | null;
  narrative: string | null;
  dewpointMax: number | null;
  dewpointMin: number | null;
  humidityMax: number | null;
  humidityMin: number | null;
  visibilityMax: number | null;
  visibilityMin: number | null;
  snowAmount: number | null;
  thunderRisk: number | null;
  tornadoRisk: number | null;
  hailRisk: number | null;
  windRisk: number | null;
  source: string;
  extras: Record<string, number | string | boolean | null>;
}

export interface ForecastDiscussion {
  text: string | null;
  issuedAt: string | null;
}

export interface ForecastBundle {
  hourly: HourlyForecastPoint[];
  daily: DailyForecastPoint[];
  /** discussion may be a string, an object, or null depending on provider */
  discussion: string | ForecastDiscussion | null;
  source: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// /alerts
// ---------------------------------------------------------------------------

export interface AlertRecord {
  id: string;
  headline: string;
  description?: string;
  severityLevel: number | null;
  severityLabel: string | null;
  alertSystem: string | null;
  hazardType: string | null;
  nativeName: string | null;
  color: string | null;
  urgency: string | null;
  certainty: string | null;
  event: string;
  effective: string;
  expires: string | null;
  senderName: string | null;
  areaDesc: string | null;
  category: string | null;
  source: string;
}

export interface AlertList {
  alerts: AlertRecord[];
  retrievedAt: string;
  source: string;
}

// ---------------------------------------------------------------------------
// /almanac
// ---------------------------------------------------------------------------

export interface AlmanacSnapshot {
  date: string;
  sun: {
    rise: string | null;
    set: string | null;
    transit: string | null;
    civilTwilightDawn: string | null;
    civilTwilightDusk: string | null;
    azimuth: number | null;
    altitude: number | null;
    rightAscension: number | null;
    declination: number | null;
    daylightMinutes: number | null;
    daylightDeltaVsYesterdayMinutes: number | null;
    nextEquinox: string | null;
    nextSolstice: string | null;
  };
  moon: {
    rise: string | null;
    set: string | null;
    transit: string | null;
    azimuth: number | null;
    altitude: number | null;
    rightAscension: number | null;
    declination: number | null;
    phaseName:
      | 'new'
      | 'waxing-crescent'
      | 'first-quarter'
      | 'waxing-gibbous'
      | 'full'
      | 'waning-gibbous'
      | 'last-quarter'
      | 'waning-crescent'
      | null;
    illuminationPercent: number | null;
    nextFullMoon: string | null;
    nextNewMoon: string | null;
  };
}

// ---------------------------------------------------------------------------
// /earthquakes
// ---------------------------------------------------------------------------

export interface EarthquakeRecord {
  id: string;
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  magnitudeType: string | null;
  depth: number | null;
  place: string | null;
  url: string | null;
  tsunami: boolean | null;
  felt: number | null;
  mmi: number | null;
  alert: 'green' | 'yellow' | 'orange' | 'red' | null;
  status: string | null;
  extras: Record<string, number | string | boolean | null>;
  source: string;
}

export interface EarthquakeConfig {
  provider: string;
  radiusKm: number;
  minMagnitude: number;
  defaultDays: number;
}

/** GeoJSON FeatureCollection returned by /earthquakes/faults.
 * Extends GeoJSON types with the attribution field bundled by the API. */
export interface FaultFeatureProperties {
  /** Fault name, if present in GEM GAF-DB data. */
  name?: string | null;
  /** Slip type (e.g. "Normal", "Thrust", "Strike-Slip"), if present. */
  slip_type?: string | null;
  [key: string]: unknown;
}

export interface FaultFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: FaultFeatureProperties;
}

export interface FaultFeatureCollection {
  type: 'FeatureCollection';
  features: FaultFeature[];
  /** Attribution text — must be displayed on the map (ADR-046 / CC-BY-SA 4.0). */
  attribution?: string;
}

// ---------------------------------------------------------------------------
// /aqi/current
// ---------------------------------------------------------------------------

/**
 * AQI scale identifier — the provider's native scale, passed through by the API
 * (ADR-059: multi-jurisdiction AQI, pass-through architecture).
 *
 * Scale semantics:
 *   epa / airnow: US EPA 0-500 index. Category names: Good / Moderate / USG / Unhealthy / Very Unhealthy / Hazardous.
 *   eaqi:         EU Air Quality Index. Qualitative scale (0-100+). Category: Good / Fair / Moderate / Poor / Very Poor.
 *   caqi:         Common Air Quality Index (EU). 0-100+ numeric range. Category: Very Low / Low / Medium / High / Very High.
 *   india:        Indian National AQI (NAQI). 0-500 range. Category: Good / Satisfactory / Moderate / Poor / Very Poor / Severe.
 *   china / mep:  China MEP (AQI). 0-500 range. Category names in Chinese or transliterated.
 *   owm:          OpenWeatherMap 1-5 ordinal. Category: Good / Fair / Moderate / Poor / Very Poor.
 *   uk:           UK DAQI 1-10 range. Category: Low / Moderate / High / Very High.
 *   de:           German LQI qualitative scale. Category names from German provider.
 *   cai:          Canadian Air Quality Index.
 */
export type AQIScale =
  | 'epa'
  | 'airnow'
  | 'eaqi'
  | 'caqi'
  | 'india'
  | 'china'
  | 'mep'
  | 'owm'
  | 'uk'
  | 'de'
  | 'cai'
  | string; // fallback for future/unknown scales

export interface AQIReading {
  aqi: number | null;
  /** Provider's actual scale identifier (ADR-059). Governs rendering range and color bands. */
  aqiScale: AQIScale;
  /** Provider's category name — passed through directly (e.g. "Good", "Moderate", "Fair"). */
  aqiCategory: string | null;
  aqiMainPollutant: string | null;
  aqiLocation: string | null;
  pollutantPM25: number | null;
  pollutantPM10: number | null;
  pollutantO3: number | null;
  pollutantNO2: number | null;
  pollutantSO2: number | null;
  pollutantCO: number | null;
  /** Nitric oxide (NO) concentration in µg/m³. Returned by OWM and some other providers (ADR-059). */
  pollutantNO: number | null;
  /** Ammonia (NH3) concentration in µg/m³. Returned by OWM; used in Indian NAQI NH3 bands (ADR-059). */
  pollutantNH3: number | null;
  /**
   * Per-pollutant source indicator (ADR-059).
   * Keys are canonical field names (e.g. "pollutantPM25", "aqi").
   * Value "weewx" means the value came from the local weather station sensors.
   * Absent (null) when all values come from the configured AQI provider.
   */
  pollutantSources: Record<string, string> | null;
  /**
   * Per-pollutant AQI sub-index values on the same scale as the main `aqi` field.
   * Keys: canonical pollutant ids ("PM2.5", "PM10", "O3", "NO2", "SO2", "CO").
   * Values: numeric sub-AQI value, or null if the provider didn't supply it.
   * Null when the provider doesn't supply per-pollutant sub-indices (e.g. IQAir free tier, weewx Path A).
   */
  pollutantSubIndices: Record<string, number | null> | null;
  observedAt: string;
  source: string;
}

// ---------------------------------------------------------------------------
// /records
// ---------------------------------------------------------------------------

export interface RecordEntry {
  label: string;
  canonicalField: string;
  value: number | null;
  observedAt: string | null;
  brokenInLast30Days?: boolean;
}

export interface RecordsBundle {
  period: string;
  sections: Record<string, RecordEntry[]>;
}

// ---------------------------------------------------------------------------
// /station  /capabilities
// ---------------------------------------------------------------------------

export interface WebcamConfig {
  enabled: boolean;
  imageUrl: string;
  videoUrl: string;
  refreshInterval: number;
}

export interface StationMetadata {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  timezone: string;
  timezoneOffsetMinutes: number;
  unitSystem: 'US' | 'METRIC' | 'METRICWX';
  firstRecord: string | null;
  lastRecord: string | null;
  hardware: string | null;
  archiveIntervalSeconds: number;
  weekStartDay: number;
  idleTimeout?: number;           // minutes, default 30. 0 = disabled (kiosk mode)
  idleRefreshFactor?: number;     // divisor for poll interval when idle, default 10
}

export interface ProviderAttributionData {
  attributionRequired: boolean;
  displayName: string;
  attributionText: string;
  textPrefix: string;
  textProviderName: string;
  url: string;
  textTranslatable: boolean;
  textLanguage: string;
  logoRequired: boolean;
  doNotUseLogo: boolean;
}

export interface CapabilityDeclaration {
  providerId: string;
  domain: 'forecast' | 'alerts' | 'aqi' | 'earthquakes' | 'radar' | 'seeing' | 'almanac';
  suppliedCanonicalFields: string[];
  geographicCoverage: string;
  defaultPollIntervalSeconds?: number;
  operatorNotes: string | null;
  tileUrlTemplate: string | null;
  wmsEndpointUrl: string | null;
  wmsLayerName: string | null;
  tileContentType: string | null;
  iframeUrl: string | null;
  caddyPrefix?: string | null;
  alertUrl?: string | null;
  bounds?: { south: number; west: number; north: number; east: number } | null;
  refreshInterval?: number | null;
  nowcastAvailable?: boolean | null;
  alertsAvailable?: boolean | null;
  satelliteAvailable?: boolean | null;
  satelliteTileUrlTemplate?: string | null;
  isObservedSource?: boolean;
  attribution?: ProviderAttributionData | null;
}

export interface CapabilityRegistry {
  providers: CapabilityDeclaration[];
  weewxColumns: Array<{ canonicalField: string; archiveColumn: string }>;
  canonicalFieldsAvailable: string[];
}

// ---------------------------------------------------------------------------
// /pages  /pages/{slug}/content  /charts/groups
// ---------------------------------------------------------------------------

export interface PageMetadata {
  slug: string;
  name: string;
  icon: string;
  navPosition: number;
  builtIn: boolean;
  hidden: boolean;
}

export interface MarkdownContent {
  markdown: string;
  updatedAt: string | null;
}

export interface MarkdownContentResponse {
  data: MarkdownContent;
  generatedAt: string;
}

export interface ChartGroup {
  id: string;
  label: string;
  charts: ChartDefinition[];
}

export interface ChartDefinition {
  id: string;
  label: string;
  fields: string[];
  chartType: string;
}

// ---------------------------------------------------------------------------
// Wind rose chart types — used by wind-rose-binning.ts (client-side)
// ---------------------------------------------------------------------------

export interface BeaufortCategory {
  beaufort: number;
  label: string;
}

export interface WindRoseData {
  directions: string[];
  categories: BeaufortCategory[];
  bins: number[][];
  totalRecords: number;
  calmPercentage: number;
}

// ---------------------------------------------------------------------------
// /charts/config  (Phase 2 configurable charts)
// ---------------------------------------------------------------------------

export interface SeriesConfig {
  seriesId: string;
  observationType: string | null;
  name: string | null;
  color: string | null;
  type: string | null;
  zIndex: number | null;
  yAxis: number | null;
  yAxisMin: number | null;
  yAxisMax: number | null;
  yAxisLabel: string | null;
  yAxisTickInterval: number | null;
  lineWidth: number | null;
  connectNulls: boolean | null;
  visible: boolean | null;
  opacity: number | null;
  stacking: string | null;
  aggregateType: string | null;
  averageType: string | null;
  markerEnabled: boolean | null;
  markerRadius: number | null;
  beaufortColors: Record<string, string>;
  rangeType: string | null;
  areaDisplay: number | null;
  useCustomSql: boolean;
  customSqlQuery: string | null;
  xColumn: string | null;
  yColumn: string | null;
  yAxisSoftMin: number | null;
  yAxisSoftMax: number | null;
  yAxisMinorTicks: boolean | null;
  dashStyle: string | null;
  fillColor: string | null;
  fillOpacity: number | null;
  borderWidth: number | null;
  mirroredValue: boolean | null;
  states: Record<string, unknown> | null;
  numberFormat: Record<string, unknown> | null;
  polar: boolean | null;
  connectEnds: boolean | null;
  colorsEnabled: boolean;
  colorZones: Array<{ color: string; position?: number; label?: string }> | null;
  /** Number of decimal places for Y-axis tick labels on this series' axis (Phase D). */
  yAxisTickDecimals?: number | null;
}

export interface ChartConfig {
  chartId: string;
  title: string | null;
  type: string | null;
  connectNulls: boolean | null;
  yAxisMin: number | null;
  aggregateType: string | null;
  aggregateInterval: number | null;
  xAxisGroupby: string | null;
  xAxisCategories: string[];
  forceFullYear: boolean | null;
  timeLength: number | string | null;
  subtitle: string | null;
  polar: boolean | null;
  series: SeriesConfig[];
}

export interface ChartGroupConfig {
  groupId: string;
  title: string | null;
  showButton: boolean;
  buttonText: string | null;
  type: string | null;
  enableDateRanges: boolean;
  rollingRanges: string[];
  availableYears: number[];
  enableMonthlyBreakdown: boolean;
  timeLength: number | string | null;
  timespanStart: number | null;
  timespanStop: number | null;
  tooltipDateFormat: string | null;
  gapsize: number | null;
  aggregateInterval: number | null;
  aggregateType: string | null;
  forceFullYear: boolean;
  startAtBeginningOfMonth: boolean;
  pageContent: string | null;
  generate: string | null;
  legend: boolean;
  exporting: boolean;
  credits: string | null;
  creditsUrl: string | null;
  creditsPosition: Record<string, unknown> | null;
  cssClass: string | null;
  cssHeight: string | null;
  cssWidth: string | null;
  charts: ChartConfig[];
}

export interface ChartsConfigData {
  aggregateType: string | null;
  timeLength: number | string | null;
  type: string;
  colors: string[];
  tooltipDateFormat: string | null;
  groups: ChartGroupConfig[];
}

// ---------------------------------------------------------------------------
// /reports  /reports/{year}/{month}  /reports/{year}
// ---------------------------------------------------------------------------

export interface ReportEntry {
  kind: 'monthly' | 'yearly';
  year: number;
  month?: number;
  filename: string;
  modifiedAt: string;
}

export interface NOAAReport {
  year: number;
  month?: number;
  filename: string;
  rawText: string;
  modifiedAt: string;
}

/** Shape returned by GET /reports/{year} (yearly NOAA report). */
export interface NOAAYearlyReport {
  year: number;
  filename: string;
  rawText: string;
  modifiedAt: string;
}

// ---------------------------------------------------------------------------
// /content/about  /content/legal
// ---------------------------------------------------------------------------

export interface ContentBlock {
  markdown: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Radar (ADR-015, wired in Phase 3 / Gap #6)
// ---------------------------------------------------------------------------

export interface RadarFrame {
  time: string;       // UTC ISO-8601 with Z
  kind: 'past' | 'current' | 'nowcast';
  path: string | null; // RainViewer per-frame tile path; null for WMS-T providers
}

export interface RadarFrameList {
  providerId: string;
  frames: RadarFrame[];
  attribution: string | null;
  tileHost: string | null; // RainViewer per-fetch tile host; null for WMS-T
  colorSchemes?: Array<{ id: number; name: string }> | null;
  satelliteFrames?: RadarFrame[] | null;
}

export interface RadarFramesResponse {
  data: RadarFrameList;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// /archive/grouped
// ---------------------------------------------------------------------------

/**
 * GroupedArchiveData — response shape for GET /archive/grouped.
 *
 * labels: one entry per group bucket (e.g. "01"–"12" for month grouping).
 * series: keyed by "<field>:<aggregateType>[:<averageType>]" spec strings.
 *         Each value array is parallel to labels.
 */
export interface GroupedArchiveData {
  labels: string[];
  series: Record<string, (number | null)[]>;
}

// ---------------------------------------------------------------------------
// /almanac/planets
// ---------------------------------------------------------------------------

export interface PlanetEntry {
  name: string;
  /** Altitude in degrees above the horizon at the reference viewing time. */
  altitude: number | null;
  /** 16-point compass direction at the reference viewing time (e.g. "Southwest"). */
  direction: string | null;
  /** UTC ISO-8601 rise time, or null if the planet doesn't rise today. */
  rise: string | null;
  /** UTC ISO-8601 set time, or null if the planet doesn't set today. */
  set: string | null;
  /** Constellation the planet is currently in. */
  constellation: string | null;
  // API-computed fields (Task 2b)
  /** Visual magnitude (lower = brighter; negative values are very bright). */
  magnitude: number | null;
  /** UTC time when planet crosses the meridian (highest altitude). */
  transitTime: string | null;
  /** Right Ascension in degrees (0-360). */
  rightAscension: number | null;
  /** Declination in degrees (-90 to +90). */
  declination: number | null;
  /** Angular distance from the Sun in degrees. */
  elongation: number | null;
  // BFF-enriched fields (Task 3 — planet viewing quality)
  /** Computed per-planet viewing quality based on seeing forecast, altitude, and atmospheric conditions. */
  viewingQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'not_visible' | null;
  /** Composite viewing quality score (0-1). Seeing 80%, altitude 15%, transparency 5%. */
  viewingScore: number | null;
  /** Best time to observe this planet tonight (typically transit or nearest clear period). */
  bestViewingTime: string | null;
  /** Start of the clear viewing window (altitude > 0° AND cloudcover ≤ 6/9). */
  clearWindowStart: string | null;
  /** End of the clear viewing window. */
  clearWindowEnd: string | null;
  /** Conjunction label when planet is within 5° of Moon (e.g., "Close Conjunction with Moon Tonight"). */
  conjunction: string | null;
  /** Explanatory note (e.g., "In Sun's Glare" for Mercury, "Bright moon nearby" for faint planets). */
  viewingNote: string | null;
}

export interface PlanetsVisible {
  evening: PlanetEntry[];
  morning: PlanetEntry[];
  allNight: PlanetEntry[];
}

// ---------------------------------------------------------------------------
// /almanac/moon-names
// ---------------------------------------------------------------------------

export interface ApiSpecialMoonEntry {
  date: string;
  traditionalName: string;
  isHarvestMoon: boolean;
  isBlueMoon: boolean;
  isHuntersMoon: boolean;
  isSupermoon: boolean;
}

export interface ApiMoonNamesCalendar {
  year: number;
  moons: ApiSpecialMoonEntry[];
}

export interface MoonNameData {
  /** Traditional name for the full moon in the current month, e.g. "Flower Moon". */
  name: string | null;
  /** Special designations that apply, e.g. ["Supermoon", "Blue Moon"]. */
  specialDesignations: string[];
}

// ---------------------------------------------------------------------------
// /almanac/eclipses
// ---------------------------------------------------------------------------

/** One eclipse contact-time event with body altitude at that moment. */
export interface EclipseContactPoint {
  /** UTC ISO-8601 datetime of the contact event. */
  date: string;
  /** Altitude of the Sun or Moon above the horizon at that moment (degrees). */
  altitude: number;
}

export interface LunarEclipseEntry {
  /** UTC ISO-8601 date of the eclipse. */
  date: string;
  type: 'penumbral' | 'partial' | 'total';
  /**
   * Contact-time events for the eclipse. Each key maps to an EclipseContactPoint or
   * null when that phase does not occur (e.g. penumbral-only eclipses have null
   * partialStart/fullStart etc.). Absent when AstronomyAPI enrichment is not configured.
   */
  contactTimes?: {
    penumbralStart: EclipseContactPoint | null;
    partialStart: EclipseContactPoint | null;
    fullStart: EclipseContactPoint | null;
    peak: EclipseContactPoint | null;
    fullEnd: EclipseContactPoint | null;
    partialEnd: EclipseContactPoint | null;
    penumbralEnd: EclipseContactPoint | null;
  } | null;
  /** Fraction of the Moon's disk obscured at peak (0.0–1.0). Absent when not enriched. */
  obscuration?: number | null;
  /** Visibility classification at the observer's station location. Absent when not enriched. */
  visibility?: 'Visible All Night' | 'Mostly Visible' | 'Low in Sky' | 'Barely Visible' | 'Not Visible' | null;
}

export interface LunarEclipseData {
  from_date: string;
  to_date: string;
  eclipses: LunarEclipseEntry[];
}

export interface SolarEclipseEntry {
  /** UTC ISO-8601 date of the eclipse. */
  date: string;
  type: 'total' | 'annular' | 'partial';
  /**
   * Contact-time events for the eclipse. Each key maps to an EclipseContactPoint or
   * null when that phase does not occur (e.g. partial eclipses have null
   * totalStart/totalEnd). Absent when AstronomyAPI enrichment is not configured.
   */
  contactTimes?: {
    partialStart: EclipseContactPoint | null;
    totalStart: EclipseContactPoint | null;
    peak: EclipseContactPoint | null;
    totalEnd: EclipseContactPoint | null;
    partialEnd: EclipseContactPoint | null;
  } | null;
  /** Fraction of the Sun's disk obscured at peak (0.0–1.0). Absent when not enriched. */
  obscuration?: number | null;
  /** Visibility classification at the observer's station location. Absent when not enriched. */
  visibility?: 'Fully Visible' | 'Mostly Visible' | 'Partially Visible' | 'Barely Visible' | 'Not Visible' | null;
}

export interface SolarEclipseData {
  from_date: string;
  to_date: string;
  eclipses: SolarEclipseEntry[];
}

// Backward-compat aliases — kept so that client.ts / useWeatherData.ts / mock files
// continue to compile while their own updates are deferred to a subsequent task.
/** @deprecated Use LunarEclipseEntry. */
export type EclipseEntry = LunarEclipseEntry;
/**
 * @deprecated Use LunarEclipseData.
 * Looser variant without from_date/to_date for backward compat with existing callers.
 */
export interface EclipseData {
  from_date?: string;
  to_date?: string;
  eclipses: LunarEclipseEntry[];
}

// ---------------------------------------------------------------------------
// /almanac/positions
// ---------------------------------------------------------------------------

export interface SunPosition {
  azimuth: number;
  altitude: number;
}

export interface MoonPosition {
  azimuth: number;
  altitude: number;
  illuminationPercent: number;
  phaseName: string;
}

export interface PositionsSnapshot {
  sun: SunPosition;
  moon: MoonPosition;
}

// ---------------------------------------------------------------------------
// /almanac/meteor-showers
// ---------------------------------------------------------------------------

export interface MeteorShowerEntry {
  name: string;
  /** UTC ISO-8601 date of peak activity. */
  peakDate: string;
  /** Zenithal Hourly Rate — expected meteors per hour under ideal conditions. */
  zhr: number | null;
  /** Radiant altitude in degrees at peak. */
  radiantAltitudeDeg: number | null;
  /** Moon illumination percentage at peak (0–100). */
  moonIlluminationPercent: number | null;
  /** Moon phase name at peak, e.g. "waxing-crescent". */
  moonPhase: string | null;
  /** Parent body (comet or asteroid), e.g. "109P/Swift-Tuttle". */
  parentBody: string | null;
  /** ISO date when the shower activity begins. */
  activeStart?: string | null;
  /** ISO date when the shower activity ends. */
  activeEnd?: string | null;
  /** Human-readable description of the shower from the catalog. */
  description?: string | null;
  /** Human-readable viewing quality label (ADR-053 unified 5-tier scale). */
  viewingQuality?: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Not Visible' | null;
  /** Meteoroid entry velocity in km/s. */
  velocityKms?: number | null;
  /** Catalog image filename for the shower (used by dashboard for imagery display). */
  image?: string | null;
}

export interface MeteorShowerData {
  showers: MeteorShowerEntry[];
}

// ---------------------------------------------------------------------------
// /almanac/seeing-forecast
// ---------------------------------------------------------------------------

export interface SeeingForecastPoint {
  /** UTC ISO-8601 datetime for the start of this 3-hour forecast step. */
  validTime: string;
  /** Astronomical seeing index (1=best, 8=worst). */
  seeingIndex: number;
  /** Atmospheric transparency index (1=best, 8=worst). */
  transparencyIndex: number;
  /** Cloud cover in oktas (1=clear, 9=overcast). */
  cloudCoverOctet: number;
  /** Lifted index — measure of atmospheric instability. */
  liftedIndex: number;
  /** Wind speed class (1=calm, 8=storm). */
  windSpeedClass: number;
  /** Wind direction as 8-point compass. */
  windDirection: string;
  /** Temperature at 2m in Celsius. */
  temp2mC: number;
  /** Relative humidity class. */
  humidityClass: number;
  /** Precipitation type. */
  precType: string;
}

export interface SeeingForecastData {
  /** 7Timer model initialization time (UTC ISO-8601). */
  initTime: string;
  /** Array of 3-hour forecast steps covering up to 72 hours. */
  points: SeeingForecastPoint[];
}

export interface SeeingForecastResponse {
  data: SeeingForecastData;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Dashboard-derived types (computed, not from a single API endpoint)
// ---------------------------------------------------------------------------

/**
 * TodayStats — computed from today's /archive records.
 * Not returned directly by any API endpoint.
 */
export interface TodayStats {
  high: number | null;
  low: number | null;
  peakGust: number;
  avgWind: number | null;
  rainSoFar: number;
  peakAQI: number;
  recordsBrokenToday: string[];
}

/**
 * LightningData — extracted from the current Observation's lightning_* fields.
 * Not returned directly by any API endpoint.
 */
export interface LightningData {
  count1h: number;
  count24h: number;
  nearestDistanceKm: number | null;
  lastStrikeTime: string | null;
}
