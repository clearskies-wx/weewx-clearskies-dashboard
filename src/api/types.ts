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
  feelsLike?: ConvertedValue | number | null;
  windchillSustained?: ConvertedValue | number | null;
  sustainedWindSpeed?: ConvertedValue | number | null;
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
   * Cloud cover percentage (0-100) from the station's cloudcover field (wview_extended).
   * Absent/null when the station does not report cloud cover.
   */
  cloudcover?: ConvertedValue | number | null;
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
  feelsLike: number | null;
  dewpoint: number | null;
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
  cloudCover: number | null;
  weatherText: string | null;
  narrative: string | null;
  forecastText: string | null;
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
  ends: string | null;
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
  /** Distance from the operator's station, in the operator's preferred unit
   *  (see the response envelope's `units.distance` field — "km" or "mi"). */
  distance: number | null;
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
  defaultLocale?: string;         // operator-chosen locale (ADR-021); one of the 13 supported codes
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

// ---------------------------------------------------------------------------
// Marine Activities (DASHBOARD-MANUAL §12) — Phase 7 T7.1
// Hand-written to match the deployed clearskies-api marine/tides/surf/
// fishing/beach-safety/almanac-solunar endpoints. Not yet reflected in
// docs/contracts/openapi-v1.yaml (Phase 5 doc-code sync gap, tracked for
// reconciliation in Phase 8) — every other type in this file is likewise
// hand-maintained rather than generated, so this follows existing practice.
// ---------------------------------------------------------------------------

export interface SpectralWaveComponent {
  height: number;
  period: number;
  direction: number;
  energy: number;
  frequencyRange: number[];
  classification: string;
}

export interface MarineObservation {
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  waveHeight: number | null;
  dominantPeriod: number | null;
  averagePeriod: number | null;
  meanWaveDirection: number | null;
  pressure: number | null;
  airTemp: number | null;
  waterTemp: number | null;
  dewpoint: number | null;
  visibility: number | null;
  pressureTendency: number | null;
  tideLevel: number | null;
  stationId: string;
  time: string;
  spectralComponents: SpectralWaveComponent[] | null;
  /** WMO weather interpretation code for the hero WeatherIcon on LocationCard (T3.8). Null when unavailable. */
  weatherCode: number | null;
  /** Day/night flag for WeatherIcon's night-glyph selection. Null when unavailable. */
  isDay: boolean | null;
}

export interface TidePrediction {
  time: string;
  height: number;
  type: string | null;
}

export interface WaterLevel {
  time: string;
  height: number;
  datum: string;
  quality: string | null;
}

export interface MarineForecastPoint {
  time: string;
  waveHeight: number | null;
  wavePeriod: number | null;
  waveDirection: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  swellHeight: number | null;
  swellPeriod: number | null;
  swellDirection: number | null;
  windWaveHeight: number | null;
  windWavePeriod: number | null;
  windWaveDirection: number | null;
  /** OFS model forecast water temperature — from ofs.fetch_forecast() via ocean_data_resolver.resolve_forecast() */
  waterTemp: number | null;
}

export interface MarineTextForecast {
  periodName: string;
  text: string;
  wind: string | null;
  seas: string | null;
  visibility: string | null;
  weather: string | null;
}

export interface SurfForecastScoring {
  waveHeight: number;
  wavePeriod: number;
  waveOrganization: number;
  organizationWind: number;
  organizationSwellDominance: number;
  organizationDirectionalSpread: number;
  organizationCrossSwell: number;
  beachAlignment: number;
  directionalExposure: number;
  timeOfDay: number;
}

export interface SurfForecast {
  time: string;
  /**
   * Legacy wave-height-at-break field. Nullable (T4A.4, Phase 4A): the API is
   * making this SwellTrack-derived, going null exactly when breakingFaceHeight
   * does (model failure). Never treat null as 0 — render the existing no-data
   * treatment.
   */
  waveHeightAtBreak: number | null;
  period: number;
  direction: number;
  /**
   * 1-5 star quality rating from surf_scorer.py. Nullable (T4A.4, Phase 4A,
   * coordinator LC-17): when the 1D model fails, score_surf() returns no
   * quality score rather than a confident rating — a "0 stars" render would
   * be a false confident rating, not an absence signal. Null means no
   * rating is available; render the existing no-data treatment, never 0
   * stars or an empty star row (those are visually identical to a genuine
   * 0-star rating).
   */
  qualityStars: number | null;
  /**
   * "Poor"/"Fair"/"Good"/"Very Good"/"Epic" label paired with qualityStars.
   * Nullable for the same reason as qualityStars — null together with it.
   */
  qualityLabel: string | null;
  /**
   * Human-readable conditions summary. Stays a non-null string (API-owned
   * per rules/coding.md §6.2) — when the score is unavailable, the API
   * resolves its OWN locale key ("surf.conditions.unavailable" in the API's
   * locale files) into this field rather than sending null. The dashboard
   * must NOT add a duplicate locale key here; render this field as-is.
   */
  conditionsText: string;
  windQuality: string;
  swellDominance: number;
  multiSwell: SpectralWaveComponent[] | null;
  /** Per-factor scoring breakdown — provided by surf_scorer.py when available.
   *  Null when the API does not yet include scoring (e.g. older server versions). */
  scoring?: SurfForecastScoring | null;
  // SWAN fields (ADR-093, Phase 5 T5.1). Optional — absent on older API
  // versions and on WW3 fallback responses where SWAN has not produced output.
  /** Raw SWAN Hsig (significant wave height) before wave_transform.py supplements. */
  swellHeight?: number | null;
  /**
   * Trough-to-crest breaking wave face height computed via the per-spot breaker
   * formula (Komar-Gaughan or Caldwell). This is the primary surfer-scale height
   * for display when surfHeightDisplay === "face".
   *
   * Nullability (T4A.4, Phase 4A): `null` means the 1D model FAILED to produce
   * a result this timestep (exception, missing profile, pipeline degraded) —
   * see `modelStatus === "unavailable"`. `0.0` means the model ran and found
   * genuinely flat conditions (`modelStatus === "no_breaking"`). Never treat
   * null as 0 — that would silently tell a surfer the ocean is flat when the
   * model actually failed.
   *
   * Semantics updated (BD-7, 2026-08-01, ADR-093 Amendment 7 / API-MANUAL
   * height-fields table): this is now `mainBreakZoneFaceHeight` when `> 0`,
   * else `bestPeakFaceHeight` (falls back only when nothing broke anywhere
   * across the whole spot) — no longer simply "best peak across open
   * transects." See `mainBreakZoneFaceHeight`/`mainBreakZoneStartIndex`/
   * `mainBreakZoneEndIndex`/`mainBreakZoneQualifyingCount`/
   * `representativeTransectIndex` below for the zone this headline is drawn
   * from.
   */
  breakingFaceHeight?: number | null;
  /**
   * Back-of-wave (Hawaiian) scale = breakingFaceHeight × 0.5.
   * Use for display when surfHeightDisplay === "hawaiian".
   * Null when breakingFaceHeight is null (see breakingFaceHeight nullability note).
   */
  breakingHawaiianHeight?: number | null;
  // BD-7/BD-9 (2026-08-01, ADR-093 Amendment 7, marine `9719db1`+`732e87d`).
  // Main-break-zone headline + its representative transect. All five fields
  // are additive/nullable (D4.1/D4.2, MARINE-FORWARD-PLAN) — absent on
  // pre-Round-2 cached responses, which predate this contract; treat
  // undefined the same as null (render nothing, never NaN/undefined text).
  /**
   * THE headline face height — mean of the qualifying (upper-tail, or
   * top-5-fallback) per-transect face heights within the main break zone
   * (the alongshore run of >= 5 contiguous transects with the highest mean
   * face among candidates). `0.0` when nothing broke anywhere (same trigger
   * bestPeakFaceHeight/breakingFaceHeight share). `null` only when no
   * transects were computed at all, or on a pre-Round-2 cache entry (field
   * absent — see comment above).
   */
  mainBreakZoneFaceHeight?: number | null;
  /** Inclusive start transect index of the main break zone. `null` only when no transects were computed at all (or pre-Round-2 cache). */
  mainBreakZoneStartIndex?: number | null;
  /** Inclusive end transect index of the main break zone. Same nullability as mainBreakZoneStartIndex. Not guaranteed every index between start and end is a zone member in the rare scattered-failure fallback case (PROVIDER-MANUAL §14.15). */
  mainBreakZoneEndIndex?: number | null;
  /** Count of in-zone transects that met the qualifying threshold and fed mainBreakZoneFaceHeight. Always `>= 1` when non-null. */
  mainBreakZoneQualifyingCount?: number | null;
  /**
   * The transect index whose cross-section the beach-profile endpoint
   * renders (BD-9) — the in-zone transect whose own face height is closest
   * to mainBreakZoneFaceHeight (deterministic tiebreak: zone-alongshore-
   * center distance, then lower transect index). The beach-profile endpoint's
   * `transect_index=best` default already resolves to this server-side
   * (API-MANUAL §"Beach profile endpoint" query-parameter row) — the
   * dashboard does not need to pass this value back to select the
   * cross-section (D4.3, verify-only).
   */
  representativeTransectIndex?: number | null;
  /**
   * Distinguishes why breakingFaceHeight/breakingHawaiianHeight are zero or
   * null (T4A.4, Phase 4A). Replaces the removed boolean `degraded` flag,
   * which could not distinguish "model ran, no breaking" from "model failed."
   *   "ok"            — full SwellTrack per-partition pipeline ran normally.
   *   "no_breaking"   — model ran; genuinely flat conditions (breakingFaceHeight = 0.0).
   *   "unavailable"   — model failed; breakingFaceHeight is null. Never render
   *                     null as flat/zero — show the existing no-data treatment.
   *   "partial"       — (C4/G7.5, 2026-08-03) a minority (<25%) of transects
   *                     ran on bulk Hs/Tp/Dir instead of measured spectra, and
   *                     none of them feed the headline (main-break-zone
   *                     qualifying set). Data usable; minor-caveat state.
   *   "degraded_bulk" — ≥25% of transects on bulk parameters, OR a headline-
   *                     feeding (qualifying-zone) transect is; the headline's
   *                     trustworthiness is degraded.
   * Optional/nullable — absent on older API versions.
   */
  modelStatus?: 'ok' | 'no_breaking' | 'unavailable' | 'partial' | 'degraded_bulk' | null;
  /**
   * Wind data source used for this timestep's surf scoring.
   * "hrrr" for forecast timesteps; "station" for t=0.
   * Null when the nearshore model is unavailable.
   */
  windSource?: string | null;
  /**
   * QB-peak break locations along the reference transect at this timestep
   * (surf.py per-timestep pipeline scan — distinct from the beach-profile
   * endpoint's per-transect break points, but same cross-shore vocabulary).
   * Unified vocabulary (T4A.1): distance/depth/hs, same shape as
   * BeachProfileBreakPoint. faceHeight/breakerType/iribarren/partitionInfo
   * are not populated by this pipeline (always absent here) — this is why
   * those fields are optional on BeachProfileBreakPoint (T4A.6 item c).
   */
  breakPoints?: BeachProfileBreakPoint[] | null;
  directionalSpread?: number | null;
  setup?: number | null;
  /**
   * Per-partition break info — what each incoming swell component does at
   * the beach. Restored D10.2 (2026-08-03): reuses the EXISTING
   * `BeachProfilePerPartitionBreak` shape (same serializer the beach-profile
   * endpoint's `perPartitionBreaks` uses) instead of the deleted bespoke
   * `PartitionBreakInfo` type (D1, `54b1563`) — one schema for one concept,
   * per D10.2 ruling (1). Served since marine `69d831a`. Null when the 1D
   * model per-partition pipeline is unavailable OR the list would be empty
   * — the server never sends an empty array here.
   */
  perPartitionBreaks?: BeachProfilePerPartitionBreak[] | null;
  // T7.2: Peel angle fields — derived from multi-transect break-point lateral variation.
  /** Peel angle in degrees; null when insufficient transect data. */
  peelAngle?: number | null;
  /**
   * Peel classification. **Re-corrected 2026-08-02 (D8, supersedes the
   * D4.1 audit comment)**: the D4.1 correction over-corrected — that
   * capture was all-closeout hours, and closeout happens to be the ONE
   * class that is always plain. The as-built truth (marine
   * `surf_1d_pipeline.py:750-786`, live-confirmed 2026-08-02): the base
   * quality class (`closeout|fast|good|mellow`) gets a DIRECTION SUFFIX
   * appended whenever direction is determined and the class isn't
   * closeout — e.g. `fast_right`, `good_left`, `mellow_a_frame`. Plain
   * base (`fast`/`good`/`mellow`) when direction is undetermined.
   * `closeout` is ALWAYS plain — never suffixed, because closeouts don't
   * peel in a direction. Direction is ALSO available independently via
   * `peelDirection` below (served even on closeout hours), which is the
   * field to read for "which way does it peel" — do not parse this field
   * for direction.
   */
  peelClassification?: string | null;
  /**
   * Break direction descriptor — computed INDEPENDENTLY of
   * `peelClassification` (re-corrected 2026-08-02, D8, supersedes the
   * D4.1 audit comment: that comment called this "opaque, not a closed
   * enum" before the direction values were confirmed). As-built and
   * live-confirmed 2026-08-02 (marine `surf_1d_pipeline.py:750-786`):
   * `"right" | "left" | "a_frame" | null`. Served even on closeout hours
   * — it is a geometry descriptor, not gated by whether the wave
   * qualifies as peeling quality-wise (confirmed live: 36/36 hours
   * `closeout` + `a_frame` on the same day). A consumer that wants "does
   * this wave peel" must still check `peelClassification !== 'closeout'`
   * separately — this field alone does not encode that.
   */
  peelDirection?: 'right' | 'left' | 'a_frame' | null;
  // T7.3: Best-peak / average face height across open transects.
  /** Best-peak face height (maximum across open transects) in display units. */
  bestPeakFaceHeight?: number | null;
  /** Spot-average face height (mean across open transects) in display units. */
  spotAverageFaceHeight?: number | null;
  /**
   * Face height in the structure shadow zone, in display units. Restored
   * D10.2 (2026-08-03) as a secondary, non-headline readout (D10.2 ruling
   * (2): a legitimate `is_structure_affected` metadata consumer under
   * BD-8's headline-aggregation demotion). Served since marine `69d831a`.
   * Null when no structure shadow is present at this timestep.
   */
  shadowFaceHeight?: number | null;
  // T7.1: Transect counts for heat map display.
  /** Total number of transects (open + structure-affected). */
  transectCount?: number | null;
  /** Number of open (structure-free) transects. */
  openTransectCount?: number | null;
  // T7.2b: Wave shape classification from waveform + Iribarren analysis.
  /** Dominant wave shape: hollow_plunging|steep_crumbly|walled_closeout|mushy_slow */
  waveShapeClassification?: string | null;
  // T4.1/T4.2: SurfBeat IG output fields. Null when SurfBeat disabled or unavailable.
  /** SurfBeat set timing — minutes between wave sets (IG spectral peak). Null when SurfBeat disabled. */
  setTimingMinutes?: number | null;
  /** SurfBeat set amplitude — IG wave height in display units (already unit-converted by API despite name). Null when SurfBeat disabled. */
  setAmplitudeM?: number | null;
  /** SurfBeat infragravity wave height in display units (already unit-converted by API despite name). Null when SurfBeat disabled. */
  igWaveHeightM?: number | null;
}

export interface FishingForecast {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  overallScore: number;
  pressureScore: number;
  tideScore: number;
  solunarScore: number;
  waterTempScore: number;
  timeofdayScore: number;
  speciesScores: Array<Record<string, unknown>> | null;
  conditionsText: string;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  swellHeight: number | null;
  swellPeriod: number | null;
}

export interface SolunarTimes {
  date: string;
  moonPhase: string;
  moonIllumination: number;
  moonrise: string | null;
  moonset: string | null;
  moonTransit: string;
  moonUnderfoot: string;
  majorPeriods: Array<{ start: string; end: string }>;
  minorPeriods: Array<{ start: string; end: string }>;
  intensity: number;
}

export interface SurfZoneForecast {
  date: string;
  countyZone: string;
  ripCurrentRisk: string;
  surfHeightMin: number | null;
  surfHeightMax: number | null;
  uvIndex: number | null;
  waterTemp: number | null;
  windText: string | null;
  hazardsText: string | null;
}

export interface BeachSafetyAssessment {
  safetyLevel: string;
  waveHeight: number | null;
  wavePeriod: number | null;
  ripCurrentRisk: string | null;
  waterTemp: number | null;
  comfortLevel: string | null;
  uvIndex: number | null;
  visibility: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  activeAlerts: string[];
}

/** A single active marine-zone alert headline (MarineLocationSummary.activeAlerts). */
export interface MarineAlertSummary {
  headline: string;
  alertType: string;
}

export interface MarineLocationSummary {
  locationId: string;
  name: string;
  coordinates: { lat: number; lon: number };
  activities: string[];
  currentConditions: MarineObservation | null;
  currentTide: { type: string; time: string; height: number } | null;
  activeAlerts: MarineAlertSummary[] | null;
  surfRating: number | null;
  beachSafetyLevel: string | null;
  /**
   * Operator-uploaded location photo URL. NOT YET in the OpenAPI v1 contract
   * (docs/contracts/openapi-v1.yaml `MarineLocationSummary` has no such
   * field) — the wizard/admin photo-upload flow is a later phase. Declared
   * here, optional and nullable, so the Phase 5 detail-page combo card
   * (DASHBOARD-MANUAL §12) and the landing LocationCard's documented photo
   * treatment can be built against a stable shape now and require no call-
   * site changes once the API starts populating it. Every current response
   * omits this field entirely, which reads as `undefined` — treat the same
   * as `null` (no photo).
   */
  photoUrl?: string | null;
  /**
   * WMO weather interpretation code for the hero WeatherIcon on LocationCard
   * (T3.8, FIX-9). Top-level on this summary shape — NOT nested inside
   * `currentConditions` (models/responses.py `MarineLocationSummary` sets it
   * from marine_weather_cache directly; `currentConditions` itself is always
   * null on the current list-route implementation). NOT YET in the OpenAPI
   * v1 contract (docs/contracts/openapi-v1.yaml `MarineLocationSummary` has
   * no such field) — contract needs a follow-up fix to match responses.py.
   * Null when unavailable.
   */
  weatherCode: number | null;
  /**
   * Day/night flag for WeatherIcon's night-glyph selection. Top-level, same
   * source/contract-gap notes as `weatherCode` above. Null when unavailable.
   */
  isDay: boolean | null;
}

/** Marine bundle — returned by GET /marine/{locationId}. */
export interface MarineBundle {
  locationId: string;
  locationName: string;
  coordinates: { lat: number; lon: number };
  observation: MarineObservation | null;
  forecast: MarineForecastPoint[];
  textForecast: MarineTextForecast[];
  source: string;
  generatedAt: string;
}

/** Tide bundle — returned by GET /tides/{locationId}. */
export interface TideBundle {
  locationId: string;
  locationName: string;
  coordinates: { lat: number; lon: number };
  predictions: TidePrediction[];
  waterLevels: WaterLevel[];
  totalWaterLevelForecast: Array<{ time: string; height: number; residual: number }> | null;
  currentResidual: { value: number; quality: string; source: string; description: string } | null;
  residualForecastSource: string | null;
  stormSurgeLevel: "elevated" | "depressed" | "significant" | "storm_surge" | null;
  source: string;
  generatedAt: string;
}

/** Surf detail — returned by GET /surf/{locationId}. */
export interface SurfDetailData {
  locationId: string;
  locationName: string;
  coordinates: { lat: number; lon: number };
  forecast: SurfForecast[];
  zoneForecast: SurfZoneForecast | null;
  spectralComponents: SpectralWaveComponent[];
  tidePredictions: TidePrediction[];
  source: string;
  generatedAt: string;
  // SWAN top-level fields (ADR-093, Phase 5 T5.1). Optional — absent
  // on older API versions and when SWAN has not produced output.
  /**
   * Identifies the nearshore model in use.
   * "swan" when SWAN is active; absent/null for WW3 fallback.
   */
  nearshoreModel?: string | null;
  /** UTC ISO-8601 timestamp when the last SWAN model run completed. */
  lastRunTime?: string | null;
  /** Seconds elapsed since the last SWAN model run completed. */
  dataAge?: number | null;
  /** Per-spot configured breaker formula used for breakingFaceHeight calculation. */
  breakerFormula?: 'komar_gaughan' | 'caldwell' | null;
  /**
   * Operator-configured surf height display preference for this location.
   * "face"     → display breakingFaceHeight (trough-to-crest, the most common scale).
   * "hawaiian" → display breakingHawaiianHeight (back-of-wave, ~half of face height).
   * Null → default to "face" behavior.
   */
  surfHeightDisplay?: 'face' | 'hawaiian' | null;
}

export interface FishingDay {
  date: string;
  periods: FishingForecast[];
  solunar: SolunarTimes;
}

/** Fishing detail — returned by GET /fishing/{locationId}. */
export interface FishingDetailData {
  locationId: string;
  locationName: string;
  coordinates: { lat: number; lon: number };
  days: FishingDay[];
  species: string[];
  targetCategory: string;
  habitatFeatures: string[];
  tidePredictions: TidePrediction[];
  source: string;
  generatedAt: string;
}

/** Beach safety detail — returned by GET /beach-safety/{locationId}. */
export interface BeachSafetyDetailData {
  locationId: string;
  locationName: string;
  coordinates: { lat: number; lon: number };
  assessment: BeachSafetyAssessment;
  nwpsV15: {
    ripCurrentProbability: number | null;
    totalWaterLevel: number | null;
    waveRunup: number | null;
  } | null;
  tidePredictions: TidePrediction[];
  waterLevels: WaterLevel[];
  // Composite water level fields (ADR-091 Decision 4, T4.2)
  totalWaterLevelForecast: Array<{ time: string; height: number; residual: number }> | null;
  currentResidual: { value: number; quality: string; source: string; description: string } | null;
  residualForecastSource: string | null;
  stormSurgeLevel: "elevated" | "depressed" | "significant" | "storm_surge" | null;
  externalLinks: Array<{ label: string; url: string }>;
  source: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Beach Profile — returned by GET /surf/{locationId}/profile (ADR-097 / T5.2,
// shape reconciled with the real API response in T4A.6 items a-g)
// ---------------------------------------------------------------------------

/**
 * One point of the dominant-partition wave-surface cross-section
 * (Stokes/cnoidal/bore) — T4A.6 item (a).
 *
 * TOP-LEVEL array on the transect result (`waveShapes`), NOT nested inside
 * each {@link BeachProfilePoint} — every point carries its own `distance`/
 * `depth` because the API samples ~30 points spread across the whole
 * transect (services/surf_1d_analytical.py `run_1d_analytical()`), not one
 * entry per transect point.
 */
export interface BeachProfileWaveShapePoint {
  /** Cross-shore distance from shore, in display units. */
  distance: number;
  /** Depth at this point, in display units. */
  depth: number;
  /** Wave regime at this point, e.g. "stokes" | "cnoidal" | "bore". */
  regime: string;
  /**
   * `[phase, elevation]` pairs describing the wave surface cross-section.
   * `phase` is the position within one wave period (0 to ~2π); `elevation`
   * is surface displacement relative to still water level, in display units.
   * Null for regimes the model doesn't produce a surface for (e.g. "bore").
   */
  surface: Array<[number, number]> | null;
}

/**
 * One bar's jacking factor (Hs at bar crest / approach Hs) — T4A.6 item (b).
 *
 * TOP-LEVEL array on the transect result (`jackingFactors`), NOT a scalar on
 * each {@link BeachProfileBreakPoint} — jacking happens at the bar crest,
 * which is a different cross-shore location from where the wave actually
 * breaks, so it is its own annotation layer.
 */
export interface BeachProfileJackingFactor {
  /** Zero-based index of the bar (sandbar crest) this factor was computed at. */
  barIndex: number;
  /** Cross-shore distance of the bar crest, in display units. */
  distance: number;
  /** Hs at bar crest / approach Hs. Values > 1.3 indicate significant focusing. */
  factor: number;
}

/**
 * Per-partition metadata attached to a break point (which incoming swell
 * component broke here) — T4A.6 item (c). Nested inside
 * {@link BeachProfileBreakPoint.partitionInfo}.
 */
export interface BeachProfilePartitionInfo {
  /** Zero-based index into the spectral decomposition output. */
  partitionIndex: number;
  /** Dominant period of this partition, in seconds. */
  periodS: number | null;
  /** Dominant direction of this partition, in degrees (met convention). */
  directionDeg: number | null;
  /** Swell classification: "groundswell" | "swell" | "wind_swell". */
  classification: string | null;
  /**
   * Partition Hs at the handoff point, in display units. NOTE: field name
   * keeps the 'M' (meter) suffix from the internal dataclass despite being
   * unit-converted to the operator's display unit — a pre-existing naming
   * quirk, not introduced here.
   */
  heightM: number;
}

/**
 * One cross-shore transect point — depth, wave height, and breaking metrics.
 *
 * Unified vocabulary (T4A.1, Phase 4A marine separation): `distance`/`depth`/
 * `hs` match the 1D analytical model's own terminology (`Analytical1DResult`)
 * and the beach_profile API response for BOTH the single-transect and
 * `transect_index=all` paths — one shape, no parallel type systems.
 * `BeachProfileTransectPoint` and `HeatMapEnvelopePoint` are aliases of this
 * type (below) — kept so existing imports don't need to change.
 */
export interface BeachProfilePoint {
  /**
   * Cross-shore distance from the shoreline, in display units (0 = shore,
   * larger = further offshore). **Can be negative** (TA-C19, confirmed live
   * 2026-08-02, ADR-093 Amendment 4): since the HAT (highest astronomical
   * tide) landward extension, a point can lie landward of the reference
   * waterline and is reported as a negative distance. Consumers must accept
   * negatives; a display should treat a negative value as "at/onshore of
   * the shoreline," never clamp or `Math.abs()` it (API-MANUAL).
   */
  distance: number;
  /** Depth below the water surface, in display units (positive = deeper). */
  depth: number;
  /** Significant wave height at this point, in display units (may be null if no data). */
  hs: number | null;
  /** Swell height (HSWELL) at this point, in display units (may be null). */
  swellHeight?: number | null;
  /** Breaking fraction QB (0–1): fraction of waves breaking at this point. */
  breakingFraction?: number | null;
  /** Breaking dissipation (DISSURF) in W/m² (may be null). */
  breakingDissipation?: number | null;
}

/**
 * Beach-profile-page consumer alias for {@link BeachProfilePoint} (T4A.1).
 * Kept so `BeachProfileChart.tsx` / `SurfingTab.tsx` imports don't need to
 * change — the underlying type is the single unified shape above.
 */
export type BeachProfileTransectPoint = BeachProfilePoint;

/**
 * A location where waves break along the transect.
 *
 * Unified vocabulary (T4A.1): `distance`/`depth`/`hs`/`faceHeight`/
 * `breakerType` match the 1D model's own terminology and the beach_profile
 * API response for both single-transect and `transect_index=all` paths.
 * `HeatMapBreakPoint` is an alias of this type (below).
 *
 * `iribarren` and `partitionInfo` are optional (T4A.6 item c) because this
 * same type also backs `SurfForecast.breakPoints` (surf.py's per-timestep
 * QB-peak scan), which never populates either field — see the note there.
 */
export interface BeachProfileBreakPoint {
  /**
   * Distance from shore in display units at this break location. **Can be
   * negative** — same TA-C19 / ADR-093 Amendment 4 semantics as
   * {@link BeachProfilePoint.distance} above.
   */
  distance: number;
  /** Depth at the break location in display units. */
  depth: number;
  /** Significant wave height at this break location in display units (may be null). */
  hs: number | null;
  /**
   * Breaker type from the 1D model's Iribarren classification.
   * Optional — present only when 1D model output is available (T5.2).
   */
  breakerType?: 'spilling' | 'plunging' | 'surging' | null;
  /**
   * Face height (K-G/Caldwell H1/10) at this break point, in display units.
   * Optional — present only when 1D model output is available (T5.2).
   */
  faceHeight?: number | null;
  /**
   * Iribarren number (surf similarity parameter) at this break point.
   * Present on every beach_profile.py break point; absent on surf.py's
   * per-timestep breakPoints (T4A.6 item c).
   */
  iribarren?: number | null;
  /**
   * Which incoming swell partition broke here. Present on every
   * beach_profile.py break point; absent on surf.py's per-timestep
   * breakPoints (T4A.6 item c — replaces the old flat `partitionLabel`
   * string, which no endpoint ever populated).
   */
  partitionInfo?: BeachProfilePartitionInfo | null;
}

/** Extent of a surf zone along the cross-shore transect. */
export interface SurfZoneExtent {
  /** Start of the zone, in display units from shore (outer boundary, farther from shore). */
  startDistance: number;
  /** End of the zone, in display units from shore (inner boundary, closer to shore). */
  endDistance: number;
  /** Water depth at the start of the zone, in display units. */
  startDepth?: number | null;
  /** Water depth at the end of the zone, in display units. */
  endDepth?: number | null;
  /**
   * Zone width, in display units. T4A.6 item (d) / LC-R2-12: verified
   * against `services/surf_1d_analytical.py` `_classify_zones()` — this is
   * populated ONLY on `totalSurfZone`. `impactZone`/`foamZone`/
   * `reformTrough` never carry it (the API omits the key entirely for
   * those, so it reads as `undefined`, not `null`).
   */
  widthM?: number | null;
}

/**
 * Classified surf zones along the transect.
 * Returned by the beach profile endpoint when 1D model output is available (T5.2).
 */
export interface BeachProfileSurfZones {
  /**
   * Impact zone: from the outermost break point to 50% energy loss.
   * Where the heaviest whitewater is — wipeout territory.
   */
  impactZone?: SurfZoneExtent | null;
  /**
   * Foam zone: from 50% energy loss to the bore propagation minimum.
   * Manageable whitewater, the reform/whitewash zone.
   */
  foamZone?: SurfZoneExtent | null;
  /**
   * Reform trough: gap between outer and inner break zones on multi-bar beaches.
   * Waves re-form here before breaking again on the inner bar.
   */
  reformTrough?: SurfZoneExtent | null;
  /**
   * Total surf zone: outer break to the swash line.
   */
  totalSurfZone?: SurfZoneExtent | null;
}

/**
 * Metadata for one available transect in the multi-transect array.
 * Used to populate the transect selector dropdown (T5.3 element 9).
 */
export interface BeachProfileTransectInfo {
  /** Transect index (0-based) as accepted by the API's `transect_index` query param. */
  index: number;
  /** Human-readable label, e.g. "Transect 1", "Best Peak". */
  label: string;
  /** True when this transect is clear of OBSTACLE structures. */
  isOpen: boolean;
  /** Meters from the segment center (positive = north/right along the shore). */
  distanceFromCenter?: number | null;
}

/**
 * Per-partition break overlay — what each incoming swell component does at
 * the beach, common to both single-transect and all-transect responses
 * (`perPartitionBreaks`) — T4A.6 item (e).
 */
export interface BeachProfilePerPartitionBreak {
  partitionIndex: number;
  periodS: number | null;
  directionDeg: number | null;
  /** Unit-converted to display units despite the 'M' suffix — see BeachProfilePartitionInfo.heightM note. */
  heightM: number;
  classification: string | null;
  meanBreakDistanceM: number | null;
  meanFaceHeightM: number | null;
  peakFaceHeightM: number | null;
  meanBreakDepthM: number | null;
  dominantBreakerType: 'spilling' | 'plunging' | 'surging' | null;
}

/**
 * Common metadata block, present on both single-transect and all-transect
 * beach profile responses — T4A.6 item (e)/(f)/(g).
 */
export interface BeachProfileMetadata {
  axisUnits: { x: string; y: string };
  /**
   * Vertical datum for depth values (e.g., "NAVD88", "MSL", "MLLW").
   * F3 (reopened 2026-07-25): read from the per-spot profile cache B2's
   * apply-time chain writes. Null when that cache is missing, unreadable,
   * or its own datum resolution failed — never a fabricated default (HB is
   * covered by DEM tiles in two different datums, NAVD88 and MHW).
   * BeachProfileChart's `datum` prop already renders the no-datum axis
   * label correctly for null, same as it always has for `undefined`.
   */
  verticalDatum: string | null;
  /**
   * SURF-PUBLISH-RESULTS-ONLY §3.6: null on the `modelStatus === "unavailable"`
   * response — there is no transect count when the model produced nothing for
   * this hour. Non-null whenever `modelStatus === "ok"`.
   */
  transectCount: number | null;
  /** Same null-when-unavailable rule as transectCount. */
  openTransectCount: number | null;
  /**
   * Per-hour handoff depth (T4A.6 item g / LC-R2-13) for the response's
   * representative (best-peak) transect, in display units. Null until B1's
   * T4A.9/T4A.10 lands `handoff_depth_m` on the pipeline's TransectResult —
   * the API degrades to null rather than erroring in the interim.
   */
  handoffDepthM?: number | null;
  /**
   * Which SWAN level the representative transect's handoff came from. Same
   * null-until-B1-lands caveat as handoffDepthM. **Widened to include
   * `'L4'`** (2026-08-02, D4.1 audit) — confirmed live (E5 ruling D3,
   * first-match-wins L4 → L3 → L2 per transect per hour; API-MANUAL
   * documents all three levels, this type previously only had two).
   */
  handoffSourceLevel?: 'L4' | 'L3' | 'L2' | null;
}

/**
 * One transect's full 1D-model output — the shape `_build_transect_profile()`
 * returns, used both as the spread-in fields of the single-transect response
 * `data` object ({@link BeachProfileData}) and as each item of the
 * all-transect response's `profiles` array ({@link HeatMapTransectData}).
 * One builder, one shape, per T4A.1's "both responses come from the same
 * builder" decision — T4A.6 keeps that true for waveShapes/jackingFactors/
 * handoff fields too, since the API emits them identically in both paths.
 */
export interface BeachProfileTransectResult {
  transectIndex: number;
  isStructureAffected: boolean;
  transectBearingDeg: number | null;
  transect: BeachProfilePoint[];
  breakPoints: BeachProfileBreakPoint[];
  /** T4A.6 item (a) — top-level wave-surface cross-sections along this transect. */
  waveShapes: BeachProfileWaveShapePoint[];
  surfZones?: BeachProfileSurfZones | null;
  /** T4A.6 item (b) — top-level bar-crest jacking factors along this transect. */
  jackingFactors: BeachProfileJackingFactor[];
  /** T4A.6 item (g) / LC-R2-13 — this transect's own per-hour handoff depth, in display units. */
  handoffDepthM?: number | null;
  /**
   * T4A.6 item (g) / LC-R2-13 — which SWAN level this transect's handoff
   * came from. **Widened to include `'L4'`** (2026-08-02, D4.1 audit) — see
   * the identical note on {@link BeachProfileMetadata.handoffSourceLevel}.
   */
  handoffSourceLevel?: 'L4' | 'L3' | 'L2' | null;
}

/**
 * Beach profile data — returned by GET /surf/{locationId}/profile.
 *
 * SURF-PUBLISH-RESULTS-ONLY §3.6: split into a discriminated union on
 * `modelStatus` (2026-07-25). Before this round, a missing profile raised
 * HTTP 404 and this interface's fields were all required/non-null — that
 * was ALREADY WRONG the moment the API started returning HTTP 200 with a
 * null payload for "the model has no answer for this hour" instead. This
 * endpoint only ever emits `"ok"` or `"unavailable"` (never the surf
 * endpoint's `"no_breaking"`/`"degraded_bulk"` — see
 * `_unavailable_profile_response()` / `get_beach_profile()` in
 * endpoints/beach_profile.py) — do not widen this to the 4-value
 * `SurfForecast.modelStatus` union.
 *
 * Consumers MUST branch on `modelStatus`, never infer "unavailable" from a
 * null `transect`/`breakPoints` — a typed client checks the tag, not which
 * keys happen to be null (mirrors the API-side doc comment on
 * `_unavailable_profile_response()`).
 */
export type BeachProfileData = BeachProfileDataOk | BeachProfileDataUnavailable;

/** The 1D model ran successfully for the requested (closest-to-now) timestep. */
export interface BeachProfileDataOk extends BeachProfileTransectResult {
  /** The surf location ID this profile is for. */
  locationId: string;
  /** The forecast timestep this profile was computed for (closest to now). */
  timestep: string;
  modelStatus: 'ok';
  /**
   * Available transects for the selector dropdown.
   * Present when multi-transect architecture is active (T5.2).
   * Null for single-transect spots. NOT currently populated by
   * beach_profile.py (pre-existing gap, not part of T4A.6) — always
   * undefined against the real API today.
   */
  transects?: BeachProfileTransectInfo[] | null;
  /** T4A.6 item (e) — per-partition break overlay, common to single- and all-transect responses. */
  perPartitionBreaks: BeachProfilePerPartitionBreak[];
  /** T4A.6 items (e)/(f)/(g) — read `metadata.verticalDatum` for the vertical datum (item f); the API has no top-level `datum` sibling field. */
  metadata: BeachProfileMetadata;
}

/**
 * SURF-PUBLISH-RESULTS-ONLY §3.6: HTTP 200, the model produced no answer for
 * this hour (no cached SWAN data yet, no forecast timesteps, or the 1D
 * pipeline yielded nothing) — a genuine model gap, NOT a configuration
 * error (those stay HTTP 404 and never reach the dashboard as data at all).
 * Mirrors `_unavailable_profile_response()`'s exact null key set — every
 * per-transect field is null; only `locationId`/`timestep`/`modelStatus`/
 * `metadata.axisUnits` carry real values. `timestep` is null in the two
 * earliest bail-out paths (no cached SWAN data / no forecast timesteps) and
 * a real ISO timestamp in the later one (pipeline ran, produced nothing) —
 * always `string | null`, never assume non-null.
 */
export interface BeachProfileDataUnavailable {
  locationId: string;
  timestep: string | null;
  modelStatus: 'unavailable';
  transectIndex: null;
  isStructureAffected: null;
  transectBearingDeg: null;
  transect: null;
  breakPoints: null;
  waveShapes: null;
  surfZones: null;
  jackingFactors: null;
  handoffDepthM: null;
  handoffSourceLevel: null;
  transects?: null;
  perPartitionBreaks: null;
  metadata: BeachProfileMetadata;
}

// ─── T7.1 Heat Map types ────────────────────────────────────────────────────

/**
 * Heat-map-page consumer alias for {@link BeachProfilePoint} (T4A.1).
 * Field names match the beach_profile API response for transect_index=all —
 * same unified shape used by the single-transect Beach Profile chart.
 */
export type HeatMapEnvelopePoint = BeachProfilePoint;

/**
 * Heat-map-page consumer alias for {@link BeachProfileBreakPoint} (T4A.1).
 * Field names match the beach_profile API response for transect_index=all.
 */
export type HeatMapBreakPoint = BeachProfileBreakPoint;

/**
 * One transect row for the heat map (returned by profile?transect_index=all).
 * Alias of {@link BeachProfileTransectResult} (T4A.6) — `_build_transect_profile()`
 * is the single builder for both the single-transect and all-transect
 * responses (T4A.1 Decision), so `profiles[i]` has exactly the same shape as
 * the single-transect `data` object's spread-in fields, waveShapes/
 * jackingFactors/handoff fields included. HeatMapCard.tsx does not currently
 * render waveShapes/jackingFactors, but the type carries them because the
 * API genuinely emits them here (verified against
 * `endpoints/beach_profile.py`'s `_ti_mode == "all"` branch, which maps
 * `_build_transect_profile()` over every transect — not added for symmetry).
 */
export type HeatMapTransectData = BeachProfileTransectResult;

/**
 * Response for GET /surf/{locationId}/profile?transect_index=all (T7.1).
 *
 * SURF-PUBLISH-RESULTS-ONLY §3.6 (2026-07-25): same discriminated-union
 * treatment as {@link BeachProfileData} — this endpoint only ever emits
 * `modelStatus: "ok" | "unavailable"`. Consumers branch on `modelStatus`,
 * never on whether `profiles` happens to be null.
 */
export type HeatMapProfileData = HeatMapProfileDataOk | HeatMapProfileDataUnavailable;

/** The 1D model ran successfully; one row per transect. */
export interface HeatMapProfileDataOk {
  /** The surf location ID this data is for. */
  locationId: string;
  /** The forecast timestep this profile was computed for (closest to now). */
  timestep: string;
  modelStatus: 'ok';
  /** All transect rows ordered by index, from southernmost to northernmost. */
  profiles: HeatMapTransectData[];
  /**
   * Per-partition break overlay, common to single- and all-transect
   * responses (T4A.6 item e) — verified present on the `_ti_mode == "all"`
   * branch of `get_beach_profile()`, same `metadata`/`per_partition_breaks_out`
   * construction as the single-transect path.
   */
  perPartitionBreaks: BeachProfilePerPartitionBreak[];
  /** T4A.6 items (e)/(f)/(g) — read `metadata.verticalDatum` for the vertical datum; the API has no top-level `datum` sibling field on this response either. */
  metadata: BeachProfileMetadata;
}

/**
 * SURF-PUBLISH-RESULTS-ONLY §3.6: HTTP 200, the model produced no answer for
 * this hour. Same null-key-set mirroring as {@link BeachProfileDataUnavailable}
 * — `_unavailable_profile_response()` sets `data["profiles"] = None` (not an
 * empty array) for `ti_mode == "all"`, and always nulls `perPartitionBreaks`.
 */
export interface HeatMapProfileDataUnavailable {
  locationId: string;
  timestep: string | null;
  modelStatus: 'unavailable';
  profiles: null;
  perPartitionBreaks: null;
  metadata: BeachProfileMetadata;
}

// ─── Imagery (Phase LM, 2026-08-03) ────────────────────────────────────────
// GET /api/v1/imagery/config?lat=&lon= — orthophoto background imagery for
// DISPLAY-ONLY geographic context (PROVIDER-MANUAL §16, API-MANUAL §12a).
// Consumed by HeatMapCard.tsx (LM-2) as a background layer behind the Hs
// heat map. Never feeds SWAN, the 1D model, transect selection, or any
// physics path — display rendering only.

/** Approximate lat/lon bounding rectangle for a provider's coverage area. */
export interface ImageryBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Response for GET /api/v1/imagery/config?lat=&lon=.
 *
 * **Flat shape — NOT the usual `ApiResponse<T>` data+envelope wrapper**
 * (intentional deviation per the plan's pinned contract sketch; API-MANUAL
 * §12a notes the same on the response model's docstring). No `units` block,
 * no `freshness` block, no `stationClock`.
 */
export interface ImageryConfigResponse {
  provider: 'naip' | 'esri';
  /**
   * NAIP (`proxyMode: "api"`): our own proxy path template
   * (`/api/v1/imagery/tiles/{z}/{x}/{y}`) — never the upstream USGS URL.
   * ESRI (`proxyMode: "direct"`): the ESRI XYZ URL template for the browser
   * to fetch directly. Both use `{z}`/`{x}`/`{y}` placeholder tokens, but
   * NOT necessarily in that path order (ESRI's own template places `{y}`
   * before `{x}`) — substitute by token, never assume position.
   */
  tileUrl: string;
  /**
   * ToS-mandated attribution text. Render verbatim — this is NOT translatable
   * (DASHBOARD-MANUAL §7 / API-MANUAL §12: `textTranslatable` is `false` for
   * every imagery provider in v0.1), never pass through `t()`.
   */
  attribution: string;
  proxyMode: 'api' | 'direct';
  /** NAIP: CONUS bounding rectangle. ESRI (global coverage): always null. */
  bounds: ImageryBounds | null;
}
