// station.ts — mock StationMetadata and CapabilityRegistry
// Types match OpenAPI v1 StationMetadata / CapabilityRegistry schemas.

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

export const mockStation: StationMetadata = {
  stationId: 'clearskies-main',
  name: 'Clear Skies Weather',
  latitude: 40.7128,
  longitude: -74.006,
  altitude: 33,
  timezone: 'America/New_York',
  timezoneOffsetMinutes: -240,
  unitSystem: 'US',
  firstRecord: '2020-01-01T00:00:00Z',
  lastRecord: '2026-05-18T14:30:00Z',
  hardware: 'Davis Vantage Pro2',
};

export const mockCapabilities: CapabilityRegistry = {
  providers: [
    {
      providerId: 'nws',
      domain: 'forecast',
      suppliedCanonicalFields: [
        'outTemp',
        'windSpeed',
        'precipProbability',
        'weatherText',
      ],
      geographicCoverage: 'US',
      defaultPollIntervalSeconds: 3600,
      operatorNotes: null,
      tileUrlTemplate: null,
      wmsEndpointUrl: null,
      wmsLayerName: null,
      tileContentType: null,
      iframeUrl: null,
    },
  ],
  weewxColumns: [
    { canonicalField: 'outTemp', archiveColumn: 'outTemp' },
    { canonicalField: 'outHumidity', archiveColumn: 'outHumidity' },
    { canonicalField: 'windSpeed', archiveColumn: 'windSpeed' },
    { canonicalField: 'windDir', archiveColumn: 'windDir' },
    { canonicalField: 'barometer', archiveColumn: 'barometer' },
    { canonicalField: 'dewpoint', archiveColumn: 'dewpoint' },
    { canonicalField: 'rain', archiveColumn: 'rain' },
    { canonicalField: 'radiation', archiveColumn: 'radiation' },
    { canonicalField: 'UV', archiveColumn: 'UV' },
    { canonicalField: 'appTemp', archiveColumn: 'appTemp' },
  ],
  canonicalFieldsAvailable: [
    'outTemp',
    'outHumidity',
    'windSpeed',
    'windDir',
    'barometer',
    'dewpoint',
    'rain',
    'radiation',
    'UV',
    'appTemp',
  ],
};
