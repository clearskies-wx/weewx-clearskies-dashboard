// current.ts — mock Observation, AQIReading, units, and today stats
// Types are now imported from ../api/types.

export type { Observation, AQIReading, TodayStats } from '../api/types';
import type { Observation, AQIReading, TodayStats } from '../api/types';

export const mockObservation: Observation = {
  timestamp: '2026-05-18T14:30:00Z',
  outTemp: 72.4,
  outHumidity: 58,
  windSpeed: 8.2,
  windDir: 225,
  windGust: 14.1,
  windGustDir: 230,
  barometer: 30.12,
  pressure: null,
  altimeter: null,
  dewpoint: 55.8,
  windchill: null,
  heatindex: 73.1,
  rainRate: 0,
  rain: 0,
  barometerTrend: -0.02,
  radiation: 842,
  UV: 6.2,
  inTemp: null,
  inHumidity: null,
  appTemp: 71.8,
  snow: null,
  snowRate: null,
  snowDepth: null,
  extras: {},
  source: 'weewx',
};

export const mockAqi: AQIReading = {
  aqi: 42,
  aqiCategory: 'Good',
  aqiMainPollutant: 'PM2.5',
  aqiLocation: null,
  pollutantPM25: null,
  pollutantPM10: null,
  pollutantO3: null,
  pollutantNO2: null,
  pollutantSO2: null,
  pollutantCO: null,
  observedAt: '2026-05-18T14:00:00Z',
  source: 'airnow',
};

export const mockTodayStats: TodayStats = {
  high: 78.2,
  low: 61.5,
  peakGust: 22.3,
  avgWind: 8.5,
  rainSoFar: 0.12,
  peakAQI: 58,
  recordsBrokenToday: [],
};

// Units block per ADR-019 / OpenAPI UnitsBlock schema.
export const mockUnits: Record<string, string> = {
  outTemp: '°F',
  windSpeed: 'mph',
  barometer: 'inHg',
  rain: 'in',
  windGust: 'mph',
};
