// useSmartAlmanac.ts — Wraps useAlmanac with smart date switching.
//
// After sunset + 2 hours, sun fields switch to tomorrow's data.
// After moonset + 2 hours, moon fields switch to tomorrow's data.
// Re-evaluates every 60 seconds so the switch happens automatically.

import { useState, useEffect, useMemo } from 'react';
import { useAlmanac } from './useWeatherData';
import type { AlmanacSnapshot } from '../api/types';

/**
 * Compatible subset of the non-exported HookResult<T> interface from useWeatherData.
 * Must stay in sync with the shape returned by useAlmanac().
 */
interface SmartAlmanacResult {
  data: AlmanacSnapshot | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Wraps useAlmanac with smart date switching:
 * - Sun fields switch to tomorrow 2 hours after today's sunset
 * - Moon fields switch to tomorrow 2 hours after today's moonset
 * - Re-evaluates every 60 seconds
 */
export function useSmartAlmanac(): SmartAlmanacResult {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = useAlmanac();

  // Determine if we need tomorrow's data
  const now = Date.now();

  const sunNeedsTomorrow = today.data?.sun.set
    ? now > new Date(today.data.sun.set).getTime() + TWO_HOURS_MS
    : false;
  const moonNeedsTomorrow = today.data?.moon.set
    ? now > new Date(today.data.moon.set).getTime() + TWO_HOURS_MS
    : false;

  const needsTomorrow = sunNeedsTomorrow || moonNeedsTomorrow;

  // Compute tomorrow's date string — recalculated on each tick so a day rollover
  // that happens while the page is open is picked up within 60 seconds.
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const tomorrow = useAlmanac(needsTomorrow ? tomorrowStr : undefined);

  // Merge: use tomorrow's sun if sunNeedsTomorrow, tomorrow's moon if moonNeedsTomorrow
  const merged = useMemo<AlmanacSnapshot | null>(() => {
    if (!today.data) return null;

    const sunData = (sunNeedsTomorrow && tomorrow.data) ? tomorrow.data.sun : today.data.sun;
    const moonData = (moonNeedsTomorrow && tomorrow.data) ? tomorrow.data.moon : today.data.moon;

    return {
      date: today.data.date,
      sun: sunData,
      moon: moonData,
    };
  }, [today.data, tomorrow.data, sunNeedsTomorrow, moonNeedsTomorrow]);

  return {
    data: merged,
    loading: today.loading || (needsTomorrow && tomorrow.loading),
    error: today.error ?? tomorrow.error,
    refetch: today.refetch,
  };
}
