// skip-link.tsx — skip-to-main-content link, first focusable element in DOM
// Visually hidden until focused; WCAG 2.1 AA §2.4.1 (bypass blocks).

import { useTranslation } from 'react-i18next';

interface SkipLinkProps {
  /**
   * When true, the skip link is marked `inert` + `aria-hidden` — used when a
   * full-viewport modal route (e.g. `/radar`) is open, since "#main-content"
   * isn't the relevant target while a dialog covers the page (Phase 5 T5.1).
   */
  hidden?: boolean;
}

export function SkipLink({ hidden = false }: SkipLinkProps) {
  const { t } = useTranslation('common');

  return (
    <a
      href="#main-content"
      aria-hidden={hidden}
      inert={hidden ? true : undefined}
      className={[
        // Visually hidden when not focused
        'sr-only focus:not-sr-only',
        // On focus: absolute positioned above nav, visible
        'focus:fixed focus:top-2 focus:left-2 focus:z-50',
        'focus:px-4 focus:py-2 focus:rounded-md',
        'focus:bg-primary focus:text-primary-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'font-semibold text-sm',
      ].join(' ')}
    >
      {t('skipToContent')}
    </a>
  );
}
