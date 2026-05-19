// theme-provider.tsx — React context + provider for three-state theme per ADR-023.
// Preference: 'light' | 'dark' | 'system'  (stored in localStorage)
// Resolved:   'light' | 'dark'             (what CSS actually sees via data-theme)
//
// Priority: user preference > operator default (operator default not yet wired;
// deferred to setup-wizard integration). When preference is absent, default is 'system'.

import { createContext, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'clearskies.theme.user-override';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Resolve preference → concrete light/dark using current OS state.
// ADR-023 defines 'system' as "follow operator default" — but operator config is not
// yet wired (deferred to setup-wizard, T8). Until then, 'system' resolves via
// matchMedia as a stand-in for the auto-os operator mode.
function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
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
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredPreference()));

  // Apply resolved theme to DOM + keep it in sync when preference changes.
  useEffect(() => {
    const newResolved = resolveTheme(preference);
    setResolved(newResolved);
    document.documentElement.setAttribute('data-theme', newResolved);
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  // When preference is 'system', subscribe to OS-level changes.
  useEffect(() => {
    if (preference !== 'system') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    function handleChange(e: MediaQueryListEvent) {
      const next: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolved(next);
      document.documentElement.setAttribute('data-theme', next);
    }

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [preference]);

  function setTheme(t: ThemePreference) {
    setPreferenceState(t);
  }

  return (
    <ThemeContext.Provider value={{ preference, resolved, setTheme }}>
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
