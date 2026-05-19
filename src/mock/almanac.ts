// almanac.ts — mock AlmanacSnapshot
// Type matches OpenAPI v1 AlmanacSnapshot schema.

export interface AlmanacSnapshot {
  date: string;
  sun: {
    rise: string | null;
    set: string | null;
    transit: string | null;
    civilTwilightDawn: string | null;
    civilTwilightDusk: string | null;
    azimuth: number | null;
    altitude: number | null;
    rightAscension: number | null;
    declination: number | null;
    daylightMinutes: number | null;
    daylightDeltaVsYesterdayMinutes: number | null;
    nextEquinox: string | null;
    nextSolstice: string | null;
  };
  moon: {
    rise: string | null;
    set: string | null;
    transit: string | null;
    azimuth: number | null;
    altitude: number | null;
    rightAscension: number | null;
    declination: number | null;
    phaseName:
      | 'new'
      | 'waxing-crescent'
      | 'first-quarter'
      | 'waxing-gibbous'
      | 'full'
      | 'waning-gibbous'
      | 'last-quarter'
      | 'waning-crescent'
      | null;
    illuminationPercent: number | null;
    nextFullMoon: string | null;
    nextNewMoon: string | null;
  };
}

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
