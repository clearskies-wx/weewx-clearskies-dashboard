// forecast.ts — mock ForecastBundle
// Types are now imported from ../api/types.

export type { HourlyForecastPoint, DailyForecastPoint, ForecastBundle } from '../api/types';
import type { HourlyForecastPoint, DailyForecastPoint, ForecastBundle } from '../api/types';

const HOURLY_TEXTS = [
  'Partly Cloudy',
  'Mostly Sunny',
  'Partly Cloudy',
  'Mostly Cloudy',
  'Partly Sunny',
  'Mostly Sunny',
  'Clear',
  'Partly Cloudy',
  'Mostly Clear',
  'Partly Cloudy',
  'Mostly Sunny',
  'Partly Cloudy',
];

const HOURLY_CODES = [2, 1, 2, 3, 2, 1, 0, 2, 1, 2, 1, 2];

// Base time: 2026-05-18T15:00:00Z, 12 hourly points
const BASE_HOUR = new Date('2026-05-18T15:00:00Z');

const HOURLY_TEMPS = [72, 74, 76, 78, 77, 75, 73, 71, 69, 68, 68, 69];

function buildHourly(): HourlyForecastPoint[] {
  return Array.from({ length: 12 }, (_, i) => {
    const validTime = new Date(BASE_HOUR.getTime() + i * 3600 * 1000).toISOString();
    return {
      validTime,
      outTemp: HOURLY_TEMPS[i],
      outHumidity: 55 + (i % 3) * 5,
      windSpeed: 6 + (i % 4) * 2,
      windDir: 220 + (i % 5) * 10,
      windGust: 12 + (i % 3) * 3,
      precipProbability: [10, 15, 20, 25, 30, 20, 10, 5, 0, 5, 10, 15][i],
      precipAmount: null,
      precipType: null,
      snowAmount: null,
      cloudCover: [30, 40, 35, 60, 45, 30, 20, 25, 15, 30, 40, 35][i],
      weatherCode: String(HOURLY_CODES[i]),
      weatherText: HOURLY_TEXTS[i],
      feelsLike: HOURLY_TEMPS[i] + (i % 2 === 0 ? 2 : -1),
      dewpoint: HOURLY_TEMPS[i] - 12 + (i % 3),
      source: 'nws',
      extras: {},
    };
  });
}

const DAILY_TEXTS = [
  'Partly Cloudy',
  'Mostly Sunny',
  'Chance of Showers',
  'Thunderstorms',
  'Partly Cloudy',
  'Mostly Sunny',
  'Clear',
];
const DAILY_CODES = [2, 1, 80, 95, 2, 1, 0];
const DAILY_PRECIP = [20, 10, 50, 70, 30, 15, 5];
const DAILY_NARRATIVES = [
  'Partly cloudy with a slight chance of afternoon showers. Highs near 82.',
  null,
  null,
  null,
  null,
  null,
  null,
];
const DAILY_FORECAST_TEXTS = [
  'Partly Cloudy. Highs in the lower 80s. S winds 5 to 10 mph.\nPartly Cloudy. Lows in the upper 50s. Light winds.',
  'Mostly Sunny. Highs in the upper 70s. SW winds up to 12 mph.\nMostly Clear. Lows in the lower 60s. Light winds.',
  'Partly Cloudy. Highs in the lower 80s. Chance of showers. S winds 10 to 15 mph.\nMostly Cloudy. Lows in the mid 60s. Chance of thunderstorms.',
  'Mostly Cloudy. Highs in the mid 80s. Thunderstorms likely. SW winds 15 to 20 mph with gusts to around 35 mph.\nPartly Cloudy. Lows in the upper 60s. Chance of thunderstorms.',
  null,
  null,
  null,
];

// Starting 2026-05-19 for 7 days
function buildDaily(): DailyForecastPoint[] {
  const baseDate = new Date('2026-05-19');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    return {
      validDate: dateStr,
      tempMax: 75 + (i % 5) * 2,
      tempMin: 58 + (i % 4),
      precipAmount: null,
      precipProbabilityMax: DAILY_PRECIP[i],
      windSpeedMax: 10 + (i % 3) * 3,
      windGustMax: 18 + (i % 4) * 2,
      sunrise: null,
      sunset: null,
      uvIndexMax: 6 + (i % 3),
      weatherCode: String(DAILY_CODES[i]),
      weatherText: DAILY_TEXTS[i],
      narrative: DAILY_NARRATIVES[i],
      forecastText: DAILY_FORECAST_TEXTS[i],
      dewpointMax: null,
      dewpointMin: null,
      humidityMax: null,
      humidityMin: null,
      visibilityMax: null,
      visibilityMin: null,
      snowAmount: null,
      thunderRisk: null,
      tornadoRisk: null,
      hailRisk: null,
      windRisk: null,
      cloudCover: 40 + (i % 4) * 15,
      source: 'nws',
      extras: {},
    };
  });
}

export const mockForecast: ForecastBundle = {
  hourly: buildHourly(),
  daily: buildDaily(),
  discussion: 'High pressure will continue to dominate through midweek, keeping conditions mostly dry. A weak cold front approaching Thursday may bring scattered showers.',
  source: 'nws',
  generatedAt: '2026-05-18T14:00:00Z',
};
