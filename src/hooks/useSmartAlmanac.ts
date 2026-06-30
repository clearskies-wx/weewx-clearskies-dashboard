// useSmartAlmanac.ts — Wraps useAlmanac with transit-aware period switching.
//
// The API returns rise/set events per calendar date, but those events may
// belong to DIFFERENT transits.  Example for Jun 30:
//   moonset  6:04 AM  — end of yesterday's transit
//   moonrise 9:06 PM  — start of tonight's transit
//
// This hook detects in-progress transits that span date boundaries and
// fetches the adjacent day's data to reconstruct a valid transit pair
// (a rise and the NEXT set that follows it).  The tile card and arc
// visualization receive a coherent snapshot where rise → set always
// represents a single passage across the sky.
//
// Rule: body data does not change until the body sets.

import { useMemo } from 'react';
import { useAlmanac } from './useWeatherData';
import { addDays, stationTimeMs } from '../utils/station-clock';
import type { AlmanacSnapshot } from '../api/types';

interface SmartAlmanacResult {
  data: AlmanacSnapshot | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function isoMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function useSmartAlmanac(): SmartAlmanacResult {
  const today = useAlmanac();
  const stationClock = today.stationClock;

  const now = stationClock ? stationTimeMs(stationClock) : Date.now();

  const todayDate = stationClock?.date ?? '';

  const yesterdayStr = useMemo(
    () => (todayDate ? addDays(todayDate, -1) : undefined),
    [todayDate],
  );
  const tomorrowStr = useMemo(
    () => (todayDate ? addDays(todayDate, 1) : undefined),
    [todayDate],
  );

  // --- Sun timestamps ---
  const sunRiseMs = isoMs(today.data?.sun.rise ?? null);
  const sunSetMs = isoMs(today.data?.sun.set ?? null);

  // --- Moon timestamps ---
  const moonRiseMs = isoMs(today.data?.moon.rise ?? null);
  const moonSetMs = isoMs(today.data?.moon.set ?? null);

  // When rise > set in today's data, today has two events from different
  // transits: set = end of yesterday's transit (morning), rise = start of
  // tonight's transit (evening).
  const moonCrossesDates =
    moonRiseMs !== null && moonSetMs !== null && moonRiseMs > moonSetMs;

  // Moon is still up from yesterday's rise (set hasn't happened yet).
  // Need yesterday's data to get the correct rise time.
  const moonInYesterdayTransit = moonCrossesDates && now < moonSetMs!;

  // Moon has set this morning.  Tonight's transit starts at today's rise
  // and ends at tomorrow's set.  Need tomorrow for the set time.
  const moonNeedsTomorrowForSet =
    moonCrossesDates && now >= moonSetMs!;

  // Standard case: rise < set on same day (rare for moon, common for sun).
  // After set, switch to tomorrow's full data.
  const moonPastSimpleSet =
    !moonCrossesDates &&
    moonSetMs !== null &&
    now > moonSetMs;

  // --- Sun: after sunset + 2h buffer, show tomorrow's sun data ---
  // The buffer keeps today's data visible briefly so the card doesn't
  // snap to tomorrow the instant the sun dips below the horizon.
  const sunNeedsTomorrow =
    sunSetMs !== null && now > sunSetMs + TWO_HOURS_MS;

  const needsYesterday = moonInYesterdayTransit;
  const needsTomorrow =
    sunNeedsTomorrow || moonNeedsTomorrowForSet || moonPastSimpleSet;

  // Hooks are always called (React rules); pass undefined to get today's
  // default data when the adjacent day isn't needed (harmless duplicate).
  const yesterday = useAlmanac(needsYesterday ? yesterdayStr : undefined);
  const tomorrow = useAlmanac(needsTomorrow ? tomorrowStr : undefined);

  const merged = useMemo<AlmanacSnapshot | null>(() => {
    if (!today.data) return null;

    // --- Sun ---
    const sunData =
      sunNeedsTomorrow && tomorrow.data
        ? tomorrow.data.sun
        : today.data.sun;

    // --- Moon: construct a valid transit pair ---
    let moonData = today.data.moon;

    if (moonInYesterdayTransit && yesterday.data) {
      // Active transit from yesterday: yesterday's rise + today's set.
      // Keep today's phase/illumination (they're "now" values).
      moonData = { ...today.data.moon, rise: yesterday.data.moon.rise };
    } else if (moonNeedsTomorrowForSet && tomorrow.data) {
      // Tonight's transit: today's rise + tomorrow's set.
      moonData = { ...today.data.moon, set: tomorrow.data.moon.set };
    } else if (moonPastSimpleSet && tomorrow.data) {
      // Past simple same-day set: switch to tomorrow entirely.
      moonData = tomorrow.data.moon;
    }

    return { date: today.data.date, sun: sunData, moon: moonData };
  }, [
    today.data,
    yesterday.data,
    tomorrow.data,
    sunNeedsTomorrow,
    moonInYesterdayTransit,
    moonNeedsTomorrowForSet,
    moonPastSimpleSet,
  ]);

  return {
    data: merged,
    loading:
      today.loading ||
      (needsYesterday && yesterday.loading) ||
      (needsTomorrow && tomorrow.loading),
    error: today.error ?? yesterday.error ?? tomorrow.error,
    refetch: today.refetch,
  };
}
