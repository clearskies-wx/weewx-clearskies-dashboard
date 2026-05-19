// almanac.ts — mock AlmanacSnapshot
// Types are now imported from ../api/types.

export type { AlmanacSnapshot } from '../api/types';
import type { AlmanacSnapshot } from '../api/types';

export const mockAlmanac: AlmanacSnapshot = {
  date: '2026-05-18',
  sun: {
    // UTC times for eastern US (UTC-4 in EDT):
    // 5:55 AM ET = 09:55 UTC, 8:17 PM ET = 00:17 UTC next day
    rise: '2026-05-18T09:55:00Z',
    set: '2026-05-19T00:17:00Z',
    transit: '2026-05-18T17:06:00Z',
    civilTwilightDawn: '2026-05-18T09:24:00Z',
    civilTwilightDusk: '2026-05-19T00:48:00Z',
    azimuth: null,
    altitude: null,
    rightAscension: null,
    declination: null,
    daylightMinutes: 862,
    daylightDeltaVsYesterdayMinutes: 2,
    nextEquinox: '2026-09-22T22:05:00Z',
    nextSolstice: '2026-06-21T06:24:00Z',
  },
  moon: {
    rise: '2026-05-18T20:30:00Z',
    set: '2026-05-18T08:15:00Z',
    transit: null,
    azimuth: null,
    altitude: null,
    rightAscension: null,
    declination: null,
    phaseName: 'waxing-gibbous',
    illuminationPercent: 72,
    nextFullMoon: '2026-05-25T03:30:00Z',
    nextNewMoon: '2026-06-08T11:00:00Z',
  },
};
