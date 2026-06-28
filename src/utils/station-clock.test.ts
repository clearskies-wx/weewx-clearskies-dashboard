/**
 * station-clock.test.ts — Unit tests for ADR-075 station-clock utilities.
 *
 * Covers: getStationDate(), addDays() (including month/year/leap-year
 * boundaries), isStationToday(), and stationTimeMs() epoch conversion.
 */

import { describe, it, expect } from 'vitest';
import {
  getStationDate,
  addDays,
  isStationToday,
  stationTimeMs,
} from './station-clock';
import type { StationClock } from './station-clock';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid StationClock for testing. */
function makeClock(date: string, time: string, timezone = 'America/New_York'): StationClock {
  return { date, time, timezone };
}

/** Build a response envelope that includes a stationClock. */
function makeResponse(clock: StationClock): { stationClock: StationClock } {
  return { stationClock: clock };
}

// ---------------------------------------------------------------------------
// 1. getStationDate()
// ---------------------------------------------------------------------------

describe('getStationDate', () => {
  it('returns the date string from a response envelope with a stationClock', () => {
    const response = makeResponse(makeClock('2026-06-27', '2026-06-27T22:30:00-04:00'));
    expect(getStationDate(response)).toBe('2026-06-27');
  });

  it('returns the correct date regardless of what the time field contains', () => {
    const response = makeResponse(makeClock('2026-01-15', '2026-01-15T08:00:00-05:00'));
    expect(getStationDate(response)).toBe('2026-01-15');
  });

  it('returns the correct date with a timezone that has a positive UTC offset', () => {
    const response = makeResponse(makeClock('2026-06-28', '2026-06-28T05:30:00+05:30', 'Asia/Kolkata'));
    expect(getStationDate(response)).toBe('2026-06-28');
  });

  it('throws when stationClock is absent from the response', () => {
    const response: { stationClock?: StationClock } = {};
    expect(() => getStationDate(response)).toThrowError(
      'getStationDate: response.stationClock is absent',
    );
  });

  it('throws when stationClock key is explicitly undefined', () => {
    const response: { stationClock?: StationClock } = { stationClock: undefined };
    expect(() => getStationDate(response)).toThrowError(
      'getStationDate: response.stationClock is absent',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. addDays()
// ---------------------------------------------------------------------------

describe('addDays', () => {
  // Normal forward cases
  it('returns the next day for a normal mid-month date', () => {
    expect(addDays('2026-06-27', 1)).toBe('2026-06-28');
  });

  it('returns the same date when n is zero', () => {
    expect(addDays('2026-06-27', 0)).toBe('2026-06-27');
  });

  it('advances by 7 days to cross a partial week', () => {
    expect(addDays('2026-06-27', 7)).toBe('2026-07-04');
  });

  // Month boundary — forward
  it('returns the next day for a month boundary (June → July)', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
  });

  it('returns the next day for a month boundary (January → February)', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('returns the next day for a month boundary (March → April)', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
  });

  // Year boundary — forward
  it('returns the next day for a year boundary (December 31 → January 1)', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  // Leap year — forward
  it('returns February 29 on a leap year when advancing from February 28', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('returns March 1 on a non-leap year when advancing from February 28', () => {
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('advances past February 29 on a leap year (Feb 29 → Mar 1)', () => {
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
  });

  // Negative days (backward)
  it('returns the previous day for a normal mid-month date with n=-1', () => {
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30');
  });

  it('returns the previous day for a year boundary backward (January 1 → December 31)', () => {
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('returns February 28 from March 1 on a non-leap year with n=-1', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('returns February 29 from March 1 on a leap year with n=-1', () => {
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('returns February 28 from March 1 on a non-leap year (2025) with n=-1', () => {
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
  });

  // Large n
  it('advances 365 days from a non-leap year January 1 to the next year January 1', () => {
    expect(addDays('2025-01-01', 365)).toBe('2026-01-01');
  });

  it('advances 366 days from a leap year January 1 to the next year January 1', () => {
    expect(addDays('2024-01-01', 366)).toBe('2025-01-01');
  });
});

// ---------------------------------------------------------------------------
// 3. isStationToday()
// ---------------------------------------------------------------------------

describe('isStationToday', () => {
  it('returns true when validDate matches the station date exactly', () => {
    expect(isStationToday('2026-06-27', '2026-06-27')).toBe(true);
  });

  it('returns false when validDate is the next day', () => {
    expect(isStationToday('2026-06-28', '2026-06-27')).toBe(false);
  });

  it('returns false when validDate is yesterday relative to the station date', () => {
    expect(isStationToday('2026-06-26', '2026-06-27')).toBe(false);
  });

  it('returns false when validDate is in a different month', () => {
    expect(isStationToday('2026-07-01', '2026-06-27')).toBe(false);
  });

  it('returns false when validDate is in a different year', () => {
    expect(isStationToday('2025-06-27', '2026-06-27')).toBe(false);
  });

  it('returns true for year boundary date matching itself (Jan 1)', () => {
    expect(isStationToday('2027-01-01', '2027-01-01')).toBe(true);
  });

  it('returns true for leap day matching itself', () => {
    expect(isStationToday('2024-02-29', '2024-02-29')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. stationTimeMs()
// ---------------------------------------------------------------------------

describe('stationTimeMs', () => {
  it('converts a station time with negative UTC offset to the correct epoch ms', () => {
    const clock = makeClock('2026-06-27', '2026-06-27T22:30:00-04:00');
    const expected = new Date('2026-06-27T22:30:00-04:00').getTime();
    expect(stationTimeMs(clock)).toBe(expected);
  });

  it('converts a station time with positive UTC offset to the correct epoch ms', () => {
    const clock = makeClock('2026-06-28', '2026-06-28T05:30:00+05:30', 'Asia/Kolkata');
    const expected = new Date('2026-06-28T05:30:00+05:30').getTime();
    expect(stationTimeMs(clock)).toBe(expected);
  });

  it('converts a UTC (Z suffix) station time to the correct epoch ms', () => {
    const clock = makeClock('2026-06-27', '2026-06-27T18:00:00Z', 'UTC');
    const expected = new Date('2026-06-27T18:00:00Z').getTime();
    expect(stationTimeMs(clock)).toBe(expected);
  });

  it('returns a larger epoch ms for a later time than an earlier time', () => {
    const earlier = makeClock('2026-06-27', '2026-06-27T10:00:00-04:00');
    const later   = makeClock('2026-06-27', '2026-06-27T22:30:00-04:00');
    expect(stationTimeMs(later)).toBeGreaterThan(stationTimeMs(earlier));
  });

  it('returns a larger epoch ms for a later date than an earlier date', () => {
    const yesterday = makeClock('2026-06-26', '2026-06-26T12:00:00-04:00');
    const today     = makeClock('2026-06-27', '2026-06-27T12:00:00-04:00');
    expect(stationTimeMs(today)).toBeGreaterThan(stationTimeMs(yesterday));
  });

  it('produces the same epoch ms for equal times expressed in different UTC offsets', () => {
    // 22:00 -04:00 and 02:00+00:00 next day are the same instant
    const eastern = makeClock('2026-06-27', '2026-06-27T22:00:00-04:00');
    const utc     = makeClock('2026-06-28', '2026-06-28T02:00:00+00:00', 'UTC');
    expect(stationTimeMs(eastern)).toBe(stationTimeMs(utc));
  });

  it('returns a number (not NaN) for a valid station clock', () => {
    const clock = makeClock('2026-06-27', '2026-06-27T15:45:30-04:00');
    expect(stationTimeMs(clock)).not.toBeNaN();
    expect(typeof stationTimeMs(clock)).toBe('number');
  });
});
