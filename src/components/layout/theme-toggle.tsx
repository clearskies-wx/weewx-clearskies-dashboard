// theme-toggle.tsx — three-state theme cycle button per ADR-023.
// Cycle order: system → light → dark → system
// Reads/writes preference via ThemeProvider context (src/lib/theme-provider.tsx).

import { Desktop, Sun, Moon } from '@phosphor-icons/react';
// Desktop: not enumerated in ADR-050; nearest Phosphor match for system-theme option (ph:desktop).
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { useTheme } from '../../lib/theme-provider';
import type { ThemePreference } from '../../lib/theme-provider';

// Maps current preference → next preference in the cycle. Shared with nav-rail.
export const NEXT_PREFERENCE: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === 'system') return <Desktop aria-hidden="true" className="h-5 w-5" />;
  if (preference === 'light')  return <Sun     aria-hidden="true" className="h-5 w-5" />;
  return                               <Moon    aria-hidden="true" className="h-5 w-5" />;
}

export function ThemeToggle() {
  const { preference, setTheme } = useTheme();
  const { t } = useTranslation('common');

  // Map preference to its aria key suffix: system→ariaAuto, light→ariaLight, dark→ariaDark
  const ariaKey = preference === 'system' ? 'theme.ariaAuto'
    : preference === 'light' ? 'theme.ariaLight'
    : 'theme.ariaDark';

  function handleClick() {
    setTheme(NEXT_PREFERENCE[preference]);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-label={t(ariaKey)}
      className="rounded-full"
    >
      <ThemeIcon preference={preference} />
    </Button>
  );
}
