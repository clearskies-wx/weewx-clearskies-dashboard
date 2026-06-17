// usePrefersReducedMotion.ts — shared hook for prefers-reduced-motion media query.
//
// Returns true when the user has requested reduced motion via OS/browser settings.
// Subscribes to changes in real time (e.g. OS setting toggled while the page is open).
//
// Per DESIGN-MANUAL §14 and coding.md §5: all tweens must be disabled when
// prefers-reduced-motion: reduce is active. Use this hook at every animation site
// rather than duplicating the inline implementation.

import { useState, useEffect } from 'react';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}
