// current.ts — mock Observation, AQIReading, units, and today stats
// All types match OpenAPI v1 contract schemas.

// TypeScript inline type definitions matching the OpenAPI v1 schemas.
// Typed client generation is deferred; these interfaces are kept minimal
// and exact against the contract shapes used in this mock layer.

export interface Observation {
  timestamp: string;
  outTemp: number | null;
  outHumidity: number | null;
  windSpeed: number | null;
  windDir: number | null;
  windGust: number | null;
  windGustDir: number | null;
  barometer: number | null;
  pressure: number | null;
  altimeter: number | null;
  dewpoint: number | null;
  windchill: number | null;
  heatindex: number | null;
  rainRate: number | null;
  rain: number | null;
  barometerTrend: number | null;
  radiation: number | null;
  UV: number | null;
  inTemp: number | null;
  inHumidity: number | null;
  appTemp: number | null;
  extras: Record<string, number | string | boolean | null>;
  source: string;
}

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

export interface TodayStats {
  high: number;
  low: number;
  peakGust: number;
  rainSoFar: number;
  peakAQI: number;
  recordsBrokenToday: string[];
}

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
