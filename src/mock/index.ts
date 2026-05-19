// index.ts — useMockData() hook: re-exports all mock domains as a single object.
// No real API calls. This module is the ONLY data source during Phase 3 mock wiring.

import { mockObservation, mockAqi, mockTodayStats, mockUnits } from './current';
import type { Observation, AQIReading, TodayStats } from './current';
import { mockForecast } from './forecast';
import type { ForecastBundle } from './forecast';
import { mockAlerts } from './alerts';
import type { AlertRecord } from './alerts';
import { mockAlmanac } from './almanac';
import type { AlmanacSnapshot } from './almanac';
import { mockEarthquakes } from './earthquakes';
import type { EarthquakeRecord } from './earthquakes';
import { mockRecords } from './records';
import type { RecordsBundle } from './records';
import { mockStation, mockCapabilities } from './station';
import type { StationMetadata, CapabilityRegistry } from './station';

export type {
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
};

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
  };
}
