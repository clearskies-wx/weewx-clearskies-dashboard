// theme-toggle.tsx — three-state theme cycle button per ADR-023.
// Cycle order: system → light → dark → system
// Reads/writes preference via ThemeProvider context (src/lib/theme-provider.tsx).

import { Monitor, Sun, Moon } from 'lucide-react';
import { Button } from '../ui/button';
import { useTheme } from '../../lib/theme-provider';
import type { ThemePreference } from '../../lib/theme-provider';

// Maps current preference → next preference in the cycle.
const NEXT_PREFERENCE: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

// aria-label: describes current state and what clicking will switch to next.
const ARIA_LABEL: Record<ThemePreference, string> = {
  system: 'Theme: following system preference — click to switch to light mode',
  light:  'Theme: light — click to switch to dark mode',
  dark:   'Theme: dark — click to switch to system preference',
};

// Icon for each preference state.
function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === 'system') return <Monitor aria-hidden="true" className="h-5 w-5" />;
  if (preference === 'light')  return <Sun     aria-hidden="true" className="h-5 w-5" />;
  return                               <Moon    aria-hidden="true" className="h-5 w-5" />;
}

export function ThemeToggle() {
  const { preference, setTheme } = useTheme();

  function handleClick() {
    setTheme(NEXT_PREFERENCE[preference]);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-label={ARIA_LABEL[preference]}
      className="rounded-full"
    >
      <ThemeIcon preference={preference} />
    </Button>
  );
}
