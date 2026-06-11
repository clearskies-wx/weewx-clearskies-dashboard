// theme-provider.tsx — React context + provider for three-state theme per ADR-023.
// Preference: 'light' | 'dark' | 'system'  (stored in localStorage)
// Resolved:   'light' | 'dark'             (what CSS actually sees via data-theme)
//
// Priority: user preference > operator default > auto-os fallback.
// When preference is absent, default is 'system' (follow operator default).
// Operator default comes from BrandingProvider (BrandingContext) when present.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrandingContext } from './branding-provider';
import { getAlmanac } from '../api/client';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type OperatorDefault = 'light' | 'dark' | 'auto-os' | 'auto-sunrise-sunset';

const STORAGE_KEY = 'clearskies.theme.user-override';
const DAYTIME_CACHE_KEY = 'clearskies.scene.daytime';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
  setDaytime: (d: boolean | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Resolve preference → concrete light/dark given the operator default.
// 'system' defers to operatorDefault:
//   'light' → 'light'
//   'dark'  → 'dark'
//   'auto-os' → matchMedia
//   'auto-sunrise-sunset' → matchMedia as the synchronous starting value;
//     the useEffect below replaces it with almanac-derived times once the
//     fetch resolves (ADR-023).
function resolveTheme(
  preference: ThemePreference,
  operatorDefault: OperatorDefault,
  daytime: boolean | null,
): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';

  // preference === 'system': use BFF scene.daytime when available (ADR-047).
  // This keeps UI theme in sync with the background scene.
  if (daytime !== null) return daytime ? 'light' : 'dark';

  // Fallback before BFF responds: operator default or OS preference.
  if (operatorDefault === 'light') return 'light';
  if (operatorDefault === 'dark') return 'dark';

  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

// Read the stored preference; fall back to 'system' (not 'light') so new visitors
// automatically follow their OS. The old two-state toggle used 'light' as default,
// but ADR-023 specifies system as the baseline when no user override exists.
function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read operator default from BrandingContext. Returns null if BrandingProvider
  // is not an ancestor — falls back to 'auto-os' so the component is usable
  // standalone (e.g. in tests or Storybook without a BrandingProvider).
  const branding = useContext(BrandingContext);
  const operatorDefault: OperatorDefault = branding?.defaultThemeMode ?? 'auto-os';

  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [daytime, setDaytimeState] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    const cached = localStorage.getItem(DAYTIME_CACHE_KEY);
    if (cached === 'true') return true;
    if (cached === 'false') return false;
    return null;
  });
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const pref = readStoredPreference();
    const cached = typeof window !== 'undefined' ? localStorage.getItem(DAYTIME_CACHE_KEY) : null;
    const initDaytime = cached === 'true' ? true : cached === 'false' ? false : null;
    return resolveTheme(pref, operatorDefault, initDaytime);
  });

  // Apply resolved theme to DOM + keep it in sync when preference, operatorDefault, or daytime changes.
  useEffect(() => {
    const newResolved = resolveTheme(preference, operatorDefault, daytime);
    setResolved(newResolved);
    document.documentElement.setAttribute('data-theme', newResolved);
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference, operatorDefault, daytime]);

  // When preference is 'system' AND operatorDefault is 'auto-os', subscribe to
  // OS-level changes. auto-sunrise-sunset has its own effect below and does NOT
  // use matchMedia for live updates.
  useEffect(() => {
    if (preference !== 'system') return;
    if (operatorDefault !== 'auto-os') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    function handleChange(e: MediaQueryListEvent) {
      const next: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolved(next);
      document.documentElement.setAttribute('data-theme', next);
    }

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [preference, operatorDefault]);

  // auto-sunrise-sunset: fetch almanac data, compute day/night, and schedule
  // timers to flip the theme at the next sunrise or sunset. Cleans up on
  // unmount or when preference/operatorDefault changes.
  //
  // Timer scheduling is stored in a ref so the inner callback can reschedule
  // itself without closing over stale state, and so cleanup is always possible.
  const sunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const midnightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fallback: fetch almanac and run local sunrise/sunset timer only when
  // the BFF scene.daytime is not available (standalone deployment without SSE).
  useEffect(() => {
    if (preference !== 'system' || operatorDefault !== 'auto-sunrise-sunset') return;
    if (daytime !== null) return;

    const abortController = new AbortController();

    function applyTheme(theme: ResolvedTheme) {
      setResolved(theme);
      document.documentElement.setAttribute('data-theme', theme);
    }

    function fallbackToOs() {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(isDark ? 'dark' : 'light');
    }

    // Compute whether it's daytime right now given UTC rise/set strings.
    // Returns the resolved theme and the ms until the next transition event.
    function computeThemeAndDelay(
      riseUtc: string,
      setUtc: string,
    ): { theme: ResolvedTheme; msUntilNext: number } {
      const now = Date.now();
      const rise = new Date(riseUtc).getTime();
      const set = new Date(setUtc).getTime();

      const isDaytime = now >= rise && now < set;
      const theme: ResolvedTheme = isDaytime ? 'light' : 'dark';

      // Next event is whichever of rise/set comes next after now.
      const candidates = [rise, set].filter((t) => t > now);
      const msUntilNext = candidates.length > 0 ? Math.min(...candidates) - now : null;

      // Clamp: if next event is > 24 h away (e.g. polar edge case despite
      // non-null strings), wait only until midnight so we re-fetch fresh data.
      const msUntilMidnight = msUntilLocalMidnight();
      const delay = msUntilNext !== null
        ? Math.min(msUntilNext, msUntilMidnight)
        : msUntilMidnight;

      return { theme, msUntilNext: delay };
    }

    function msUntilLocalMidnight(): number {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0); // next midnight in local time
      return midnight.getTime() - now.getTime();
    }

    function scheduleMidnightRefetch() {
      const ms = msUntilLocalMidnight();
      midnightTimerRef.current = setTimeout(() => {
        if (!abortController.signal.aborted) {
          // Re-fetch almanac for the new day and restart the whole loop.
          void runSunriseSunsetLoop();
        }
      }, ms);
    }

    async function runSunriseSunsetLoop() {
      // Clear any pending transition timer from a previous run.
      if (sunTimerRef.current !== null) {
        clearTimeout(sunTimerRef.current);
        sunTimerRef.current = null;
      }
      if (midnightTimerRef.current !== null) {
        clearTimeout(midnightTimerRef.current);
        midnightTimerRef.current = null;
      }

      // fetchSunTimes returns null on fetch failure, or the raw rise/set strings
      // (which may themselves be null for polar regions) on success.
      async function fetchSunTimes(): Promise<{ rise: string | null; set: string | null } | null> {
        try {
          const response = await getAlmanac(undefined, abortController.signal);
          return { rise: response.data.sun.rise, set: response.data.sun.set };
        } catch {
          return null;
        }
      }

      const sunTimes = await fetchSunTimes();

      if (abortController.signal.aborted) return;

      // Fetch failure or polar region (null rise/set) → fall back to OS.
      if (sunTimes === null || sunTimes.rise === null || sunTimes.set === null) {
        fallbackToOs();
        return;
      }

      const riseUtc = sunTimes.rise;
      const setUtc = sunTimes.set;

      const { theme, msUntilNext } = computeThemeAndDelay(riseUtc, setUtc);
      applyTheme(theme);

      // Schedule the next theme flip at sunrise or sunset.
      sunTimerRef.current = setTimeout(() => {
        if (!abortController.signal.aborted) {
          void runSunriseSunsetLoop();
        }
      }, msUntilNext);

      // Also schedule a midnight re-fetch so the next day's times are loaded.
      // (If msUntilNext already lands after midnight, the sun timer fires first
      // and triggers a re-fetch via runSunriseSunsetLoop anyway.)
      scheduleMidnightRefetch();
    }

    void runSunriseSunsetLoop();

    return () => {
      abortController.abort();
      if (sunTimerRef.current !== null) {
        clearTimeout(sunTimerRef.current);
        sunTimerRef.current = null;
      }
      if (midnightTimerRef.current !== null) {
        clearTimeout(midnightTimerRef.current);
        midnightTimerRef.current = null;
      }
    };
  }, [preference, operatorDefault, daytime]);

  const setTheme = useCallback((t: ThemePreference) => {
    setPreferenceState(t);
  }, []);

  const setDaytime = useCallback((d: boolean | null) => {
    setDaytimeState(d);
    if (d !== null) {
      localStorage.setItem(DAYTIME_CACHE_KEY, String(d));
    }
  }, []);

  const contextValue = useMemo(
    () => ({ preference, resolved, setTheme, setDaytime }),
    [preference, resolved, setTheme, setDaytime],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
