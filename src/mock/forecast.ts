// forecast.ts — mock ForecastBundle
// Types match OpenAPI v1 ForecastBundle / HourlyForecastPoint / DailyForecastPoint.

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

export interface ForecastBundle {
  hourly: HourlyForecastPoint[];
  daily: DailyForecastPoint[];
  discussion: null;
  source: string;
  generatedAt: string;
}

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
      cloudCover: [30, 40, 35, 60, 45, 30, 20, 25, 15, 30, 40, 35][i],
      weatherCode: null,
      weatherText: HOURLY_TEXTS[i],
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
const DAILY_PRECIP = [20, 10, 50, 70, 30, 15, 5];

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
      weatherCode: null,
      weatherText: DAILY_TEXTS[i],
      narrative: null,
      source: 'nws',
      extras: {},
    };
  });
}


export const mockForecast: ForecastBundle = {
  hourly: buildHourly(),
  daily: buildDaily(),
  discussion: null,
  source: 'nws',
  generatedAt: '2026-05-18T14:00:00Z',
};
