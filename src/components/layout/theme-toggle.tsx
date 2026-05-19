// theme-toggle.tsx — light/dark theme toggle
// Persists to localStorage key clearskies.theme.user-override per ADR-023.
// Sets data-theme on <html> synchronously.

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '../ui/button';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'clearskies.theme.user-override';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }

  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-full"
    >
      {isDark ? (
        <Sun aria-hidden="true" className="h-5 w-5" />
      ) : (
        <Moon aria-hidden="true" className="h-5 w-5" />
      )}
    </Button>
  );
}

// Initialize theme synchronously before first render.
// Called once at module load time to avoid flash of wrong theme.
(function initTheme() {
  if (typeof window === 'undefined') return;
  const stored = localStorage.getItem(STORAGE_KEY);
  const theme: Theme = stored === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
