/**
 * station-clock.ts — Station-local date/time utilities (ADR-075 §6).
 *
 * All components that need the station-local date import from here.
 * No component should compute station dates ad-hoc.
 */

// ---------------------------------------------------------------------------
// Re-export canonical interfaces from types.ts (ADR-075)
// ---------------------------------------------------------------------------

import type { StationClock, FreshnessInfo } from '../api/types';
export type { StationClock, FreshnessInfo };

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Extract the station-local date string from an API response envelope.
 *
 * Throws if stationClock is absent — that is a caller bug; cacheable responses
 * always carry stationClock per ADR-075.
 */
export function getStationDate(response: { stationClock?: StationClock }): string {
  if (!response.stationClock) {
    throw new Error('getStationDate: response.stationClock is absent');
  }
  return response.stationClock.date;
}

/**
 * Increment a YYYY-MM-DD date string by n days (n may be negative).
 *
 * Parsed as UTC date-parts to avoid DST / local-offset shifts that would
 * occur if the string were fed directly to `new Date()` without a time
 * component (which defaults to midnight local time in some runtimes).
 */
export function addDays(dateStr: string, n: number): string {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const d = new Date(Date.UTC(year, month - 1, day + n));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Return true when a forecast validDate equals the station's current date.
 */
export function isStationToday(validDate: string, stationDate: string): boolean {
  return validDate === stationDate;
}

/**
 * Convert a StationClock time string (ISO-8601 with UTC offset) to epoch ms.
 * Used for elapsed-time comparisons, e.g. "has sunrise passed?".
 */
export function stationTimeMs(stationClock: StationClock): number {
  return new Date(stationClock.time).getTime();
}
