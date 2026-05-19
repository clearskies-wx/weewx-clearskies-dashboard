// theme-provider.tsx — React context + provider for three-state theme per ADR-023.
// Preference: 'light' | 'dark' | 'system'  (stored in localStorage)
// Resolved:   'light' | 'dark'             (what CSS actually sees via data-theme)
//
// Priority: user preference > operator default > auto-os fallback.
// When preference is absent, default is 'system' (follow operator default).
// Operator default comes from BrandingProvider (BrandingContext) when present.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BrandingContext } from './branding-provider';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type OperatorDefault = 'light' | 'dark' | 'auto-os' | 'auto-sunrise-sunset';

const STORAGE_KEY = 'clearskies.theme.user-override';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Resolve preference → concrete light/dark given the operator default.
// 'system' defers to operatorDefault:
//   'light' → 'light'
//   'dark'  → 'dark'
//   'auto-os' → matchMedia
//   'auto-sunrise-sunset' → matchMedia fallback (sunrise/sunset data not yet
//     available from the api; TODO: re-evaluate at next sunrise/sunset once
//     almanac endpoint supplies those times per ADR-023/ADR-014).
function resolveTheme(preference: ThemePreference, operatorDefault: OperatorDefault): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';

  // preference === 'system': resolve via operator default.
  if (operatorDefault === 'light') return 'light';
  if (operatorDefault === 'dark') return 'dark';

  // 'auto-os' or 'auto-sunrise-sunset': use matchMedia.
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
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredPreference(), operatorDefault),
  );

  // Apply resolved theme to DOM + keep it in sync when preference or operatorDefault changes.
  useEffect(() => {
    const newResolved = resolveTheme(preference, operatorDefault);
    setResolved(newResolved);
    document.documentElement.setAttribute('data-theme', newResolved);
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference, operatorDefault]);

  // When preference is 'system' AND operatorDefault is an auto-os mode,
  // subscribe to OS-level changes.
  useEffect(() => {
    if (preference !== 'system') return;
    if (operatorDefault !== 'auto-os' && operatorDefault !== 'auto-sunrise-sunset') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    function handleChange(e: MediaQueryListEvent) {
      const next: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolved(next);
      document.documentElement.setAttribute('data-theme', next);
    }

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [preference, operatorDefault]);

  // useCallback so setTheme has a stable identity across renders — required for the
  // useMemo context value below to remain stable when only resolved or preference changes.
  const setTheme = useCallback((t: ThemePreference) => {
    setPreferenceState(t);
  }, []);

  // Memoize the context value so consumers only re-render when preference or resolved
  // actually changes. Without this, every ThemeProvider render (e.g. triggered by a
  // sibling state update) produces a new object reference, causing all useTheme()
  // consumers to re-render — which can close an infinite loop if any consumer has a
  // useEffect that writes state (e.g. a data-fetching hook).
  const contextValue = useMemo(
    () => ({ preference, resolved, setTheme }),
    [preference, resolved, setTheme],
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
