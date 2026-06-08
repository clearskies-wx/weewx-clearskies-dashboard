// station.ts — mock StationMetadata and CapabilityRegistry
// Types are now imported from ../api/types.

export type { StationMetadata, CapabilityDeclaration, CapabilityRegistry } from '../api/types';
import type { StationMetadata, CapabilityRegistry } from '../api/types';

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
    {
      // RainViewer — keyless, direct browser fetch.
      // Template placeholders resolved by buildTileUrl() in radar-map.tsx:
      //   {host}    — per-fetch tile server host from RadarFrameList.tileHost
      //   {path}    — per-frame tile path from RadarFrame.path
      //   {size}    — 512 (high-DPI)
      //   {color}   — 2 ("Original" meteorological palette)
      //   {options} — 0_0 (no smoothing, no snow highlight)
      //   {z}/{x}/{y} — Leaflet slippy-map tile coordinates
      providerId: 'rainviewer',
      domain: 'radar',
      suppliedCanonicalFields: [],
      geographicCoverage: 'global',
      defaultPollIntervalSeconds: 300,
      operatorNotes: null,
      tileUrlTemplate: '{host}{path}/{size}/{color}/{options}/{z}/{x}/{y}/1/1.png',
      wmsEndpointUrl: null,
      wmsLayerName: null,
      tileContentType: 'image/png',
      iframeUrl: null,
    },
    {
      providerId: 'seven_timer',
      domain: 'seeing',
      suppliedCanonicalFields: ['seeing', 'transparency', 'cloudCover'],
      geographicCoverage: 'global',
      defaultPollIntervalSeconds: 10800,
      operatorNotes: null,
      tileUrlTemplate: null,
      wmsEndpointUrl: null,
      wmsLayerName: null,
      tileContentType: null,
      iframeUrl: null,
    },
    {
      providerId: 'astronomyapi',
      domain: 'almanac',
      suppliedCanonicalFields: ['sunrise', 'sunset', 'moonPhase', 'planetPositions', 'eclipses'],
      geographicCoverage: 'global',
      defaultPollIntervalSeconds: 86400,
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
