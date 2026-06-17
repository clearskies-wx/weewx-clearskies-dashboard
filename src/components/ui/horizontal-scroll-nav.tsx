// horizontal-scroll-nav.tsx — Standardized horizontal scroll navigation (Design Manual §11).
//
// Round chevron buttons project into margin space and hide at scroll boundaries.
// The scrollable container uses role="region" + aria-label + tabIndex={0} so
// keyboard users can scroll with arrow keys without the buttons.
//
// A11y notes:
//   - Each button has aria-label ("Scroll left" / "Scroll right") — icon is aria-hidden.
//   - Buttons are <button type="button"> — never <div onClick>.
//   - focus-visible:ring-2 focus-visible:ring-ring is the visible focus indicator.
//   - Buttons are only rendered (not hidden via CSS) when scrolling is possible,
//     so screen readers do not encounter stale/misleading controls.
//   - ResizeObserver re-evaluates boundary state when the container resizes
//     (e.g. viewport resize, card reflow) so boundary hiding stays accurate.

import * as React from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';

export interface HorizontalScrollNavProps {
  children: React.ReactNode;
  /** Accessible label for the scroll region (role="region"). */
  ariaLabel: string;
  /** Additional className applied to the outermost wrapper div. */
  className?: string;
}

export function HorizontalScrollNav({
  children,
  ariaLabel,
  className,
}: HorizontalScrollNavProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  // 1px tolerance to account for sub-pixel rounding at HiDPI screens.
  const updateScrollState = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });

    // Re-evaluate when the container itself resizes (viewport change, card reflow).
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className={`relative ${className ?? ''}`}>
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full card-glass shadow-md ring-1 ring-foreground/10 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CaretLeft size={16} weight="bold" aria-hidden="true" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full card-glass shadow-md ring-1 ring-foreground/10 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CaretRight size={16} weight="bold" aria-hidden="true" />
        </button>
      )}
      <div
        ref={scrollRef}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        className="overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
      >
        {children}
      </div>
    </div>
  );
}
