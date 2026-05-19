// earthquakes.ts — mock EarthquakeRecord[]
// Type matches OpenAPI v1 EarthquakeRecord schema.

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

export const mockEarthquakes: EarthquakeRecord[] = [
  {
    id: 'us7000abc1',
    magnitude: 2.4,
    place: '8 km NE of Ridgewood, NJ',
    time: '2026-05-17T22:14:00Z',
    latitude: 41.02,
    longitude: -74.08,
    depth: 5.2,
    magnitudeType: 'ml',
    url: null,
    tsunami: false,
    felt: null,
    mmi: null,
    alert: null,
    status: 'reviewed',
    extras: {},
    source: 'usgs',
  },
  {
    id: 'us7000abc2',
    magnitude: 3.1,
    place: '15 km SW of Nyack, NY',
    time: '2026-05-16T08:45:00Z',
    latitude: 41.05,
    longitude: -74.05,
    depth: 8.1,
    magnitudeType: 'ml',
    url: null,
    tsunami: false,
    felt: 12,
    mmi: 2.5,
    alert: 'green',
    status: 'reviewed',
    extras: {},
    source: 'usgs',
  },
];
