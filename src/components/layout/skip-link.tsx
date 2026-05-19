// skip-link.tsx — skip-to-main-content link, first focusable element in DOM
// Visually hidden until focused; WCAG 2.1 AA §2.4.1 (bypass blocks).

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className={[
        // Visually hidden when not focused
        'sr-only focus:not-sr-only',
        // On focus: absolute positioned above nav, visible
        'focus:fixed focus:top-2 focus:left-2 focus:z-50',
        'focus:px-4 focus:py-2 focus:rounded-md',
        'focus:bg-primary focus:text-primary-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'font-medium text-sm',
      ].join(' ')}
    >
      Skip to main content
    </a>
  );
}
