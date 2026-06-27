// useSmartAlmanac.ts — Wraps useAlmanac with smart period switching.
//
// Shows the NEXT rise/set period for each body. The 2-hour buffer after
// set keeps the previous period visible briefly so it doesn't vanish
// the instant the body sets.
//
// Key insight: today's API data may already contain the next period.
// If moonrise > moonset in today's data, the moon set this morning and
// rises tonight — today's data IS the next period. Only fetch tomorrow
// when today's data doesn't have a future rise after the set.

import { useMemo } from 'react';
import { useAlmanac } from './useWeatherData';
import { getStationDate, addDays, stationTimeMs } from '../utils/station-clock';
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

  // Use station-local time for rise/set comparisons (ADR-075).
  // Falls back to Date.now() only on initial load before stationClock arrives.
  const now = stationClock ? stationTimeMs(stationClock) : Date.now();

  // --- Sun: need tomorrow only if past sunset + 2hr ---
  const sunSetMs = isoMs(today.data?.sun.set ?? null);
  const sunNeedsTomorrow = sunSetMs !== null && now > sunSetMs + TWO_HOURS_MS;

  // --- Moon: need tomorrow only if past moonset + 2hr AND today's data
  // doesn't already contain the next rise (rise > set means tonight's
  // rise is in today's data — don't fetch tomorrow) ---
  const moonSetMs = isoMs(today.data?.moon.set ?? null);
  const moonRiseMs = isoMs(today.data?.moon.rise ?? null);
  const todayHasNextMoonRise = moonRiseMs !== null && moonSetMs !== null && moonRiseMs > moonSetMs;
  const moonNeedsTomorrow = moonSetMs !== null
    && now > moonSetMs + TWO_HOURS_MS
    && !todayHasNextMoonRise;

  const needsTomorrow = sunNeedsTomorrow || moonNeedsTomorrow;

  // Compute tomorrow's date string from the station clock (ADR-075).
  // Undefined until stationClock is available; needsTomorrow is false
  // in that case so useAlmanac will not be called with undefined.
  const tomorrowStr = useMemo(() => {
    if (!today.data || !stationClock) return undefined;
    return addDays(getStationDate({ stationClock }), 1);
  }, [today.data, stationClock]);

  const tomorrow = useAlmanac(needsTomorrow ? tomorrowStr : undefined);

  const merged = useMemo<AlmanacSnapshot | null>(() => {
    if (!today.data) return null;

    const sunData = (sunNeedsTomorrow && tomorrow.data)
      ? tomorrow.data.sun
      : today.data.sun;

    const moonData = (moonNeedsTomorrow && tomorrow.data)
      ? tomorrow.data.moon
      : today.data.moon;

    return { date: today.data.date, sun: sunData, moon: moonData };
  }, [today.data, tomorrow.data, sunNeedsTomorrow, moonNeedsTomorrow]);

  return {
    data: merged,
    loading: today.loading || (needsTomorrow && tomorrow.loading),
    error: today.error ?? tomorrow.error,
    refetch: today.refetch,
  };
}
