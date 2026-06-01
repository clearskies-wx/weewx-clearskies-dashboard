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

/** Standard API envelope for most endpoints. */
export interface ApiResponse<T> {
  data: T;
  units?: UnitsBlock;
  source?: string;
  generatedAt: string;
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
  barometerTrend: ConvertedValue | number | null;
  radiation: ConvertedValue | number | null;
  UV: ConvertedValue | number | null;
  inTemp: ConvertedValue | number | null;
  inHumidity: ConvertedValue | number | null;
  appTemp: ConvertedValue | number | null;
  /** Lightning fields — present only when lightning sensor configured. */
  lightning_strike_count?: number | null;
  lightning_strike_count_1h?: number | null;
  lightning_distance?: number | null;
  lightning_last_det_time?: string | null;
  /** Weather description text — present when observation includes a text summary (Phase 0B). */
  weatherText?: string | null;
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
  severity: 'advisory' | 'watch' | 'warning';
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

export interface AQIReading {
  aqi: number | null;
  aqiCategory: string | null;
  aqiMainPollutant: string | null;
  aqiLocation: string | null;
  pollutantPM25: number | null;
  pollutantPM10: number | null;
  pollutantO3: number | null;
  pollutantNO2: number | null;
  pollutantSO2: number | null;
  pollutantCO: number | null;
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
}

export interface CapabilityDeclaration {
  providerId: string;
  domain: 'forecast' | 'alerts' | 'aqi' | 'earthquakes' | 'radar';
  suppliedCanonicalFields: string[];
  geographicCoverage: string;
  defaultPollIntervalSeconds?: number;
  operatorNotes: string | null;
  tileUrlTemplate: string | null;
  wmsEndpointUrl: string | null;
  wmsLayerName: string | null;
  tileContentType: string | null;
  iframeUrl: string | null;
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
}

export interface RadarFramesResponse {
  data: RadarFrameList;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// /climatology/monthly
// ---------------------------------------------------------------------------

export interface ClimatologyMonthly {
  /** 12-element arrays, one entry per month (index 0 = January). */
  months: string[];
  avgHighTemp: (number | null)[];
  avgLowTemp: (number | null)[];
  avgDewpoint: (number | null)[];
  avgRainfall: (number | null)[];
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

export interface EclipseEntry {
  /** UTC ISO-8601 date of the eclipse. */
  date: string;
  type: 'penumbral' | 'partial' | 'total';
}

export interface EclipseData {
  eclipses: EclipseEntry[];
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
}

export interface MeteorShowerData {
  showers: MeteorShowerEntry[];
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
