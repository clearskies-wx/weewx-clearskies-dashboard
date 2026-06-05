// index.ts — useMockData() hook: re-exports all mock domains as a single object.
// No real API calls. This module is the ONLY data source when VITE_USE_MOCK=true.
// All type definitions have moved to src/api/types.ts.

import { mockObservation, mockAqi, mockTodayStats, mockUnits } from './current';
import { mockForecast } from './forecast';
import { mockAlerts } from './alerts';
import { mockAlmanac } from './almanac';
import { mockEarthquakes } from './earthquakes';
import { mockRecords } from './records';
import { mockStation, mockCapabilities } from './station';
import { mockLightning } from './lightning';
import { mockArchiveData } from './archive';
import { mockChartsConfig } from './chartsConfig';

export { mockChartsConfig };

// Re-export types from the canonical location for backward-compatibility.
export type {
  Observation,
  AQIReading,
  TodayStats,
  ForecastBundle,
  HourlyForecastPoint,
  DailyForecastPoint,
  AlertRecord,
  AlmanacSnapshot,
  EarthquakeRecord,
  RecordsBundle,
  RecordEntry,
  StationMetadata,
  CapabilityRegistry,
  CapabilityDeclaration,
  LightningData,
  ArchiveRecord,
  UnitsBlock,
} from '../api/types';

import type {
  Observation,
  AQIReading,
  TodayStats,
  ForecastBundle,
  AlertRecord,
  AlmanacSnapshot,
  EarthquakeRecord,
  RecordsBundle,
  StationMetadata,
  CapabilityRegistry,
  LightningData,
  ArchiveRecord,
} from '../api/types';

export interface MockData {
  observation: Observation;
  units: Record<string, string>;
  aqi: AQIReading;
  todayStats: TodayStats;
  forecast: ForecastBundle;
  alerts: AlertRecord[];
  almanac: AlmanacSnapshot;
  earthquakes: EarthquakeRecord[];
  records: RecordsBundle;
  station: StationMetadata;
  capabilities: CapabilityRegistry;
  lightning: LightningData;
  archiveData: ArchiveRecord[];
}

export function useMockData(): MockData {
  return {
    observation: mockObservation,
    units: mockUnits,
    aqi: mockAqi,
    todayStats: mockTodayStats,
    forecast: mockForecast,
    alerts: mockAlerts,
    almanac: mockAlmanac,
    earthquakes: mockEarthquakes,
    records: mockRecords,
    station: mockStation,
    capabilities: mockCapabilities,
    lightning: mockLightning,
    archiveData: mockArchiveData,
  };
}
