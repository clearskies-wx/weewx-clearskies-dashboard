// earthquakes.ts — mock EarthquakeRecord[]
// Types are now imported from ../api/types.

export type { EarthquakeRecord } from '../api/types';
import type { EarthquakeRecord } from '../api/types';

export const mockEarthquakes: EarthquakeRecord[] = [
  {
    id: 'us7000abc1',
    magnitude: 2.4,
    place: '8 km NE of Ridgewood, NJ',
    time: '2026-05-17T22:14:00Z',
    latitude: 41.02,
    longitude: -74.08,
    depth: 5.2,
    distance: 8,
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
    distance: 15,
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
