// controls-strip.tsx — Controls strip primitive (ADR-051 D-A4.5).
//
// The "many controls" pattern: when a page's controls (tabs, period selectors,
// sort buttons, etc.) don't fit inline in the PageHeaderCard, they get their
// own full-width quarter-row card directly below the header.
//
// A11y contract (rules/coding.md §5.4):
// - Renders as a <section> with an accessible label supplied via aria-label.
// - If aria-label is omitted the section is still valid HTML but screen readers
//   won't announce a landmark name — callers should always provide aria-label.
// - All interactive controls inside must be keyboard-reachable (consumer's
//   responsibility).

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

type ControlsStripProps = {
  /**
   * Controls to render inside the strip (tabs, selectors, buttons, etc.).
   * All interactive controls must be keyboard-reachable (Tab order follows
   * DOM order).
   */
  children?: React.ReactNode;
  /**
   * Accessible label for the controls region.
   * Recommended — without it the <section> element has no announced name
   * for screen readers (WCAG 1.3.6 / 2.4.6).
   *
   * @example aria-label="Forecast controls"
   */
  'aria-label'?: string;
  /** Extra classes passed through to the outer Card. */
  className?: string;
};

/**
 * ControlsStrip — full-width quarter-row card for page-level controls.
 *
 * Use when a page has too many controls to fit inline in the PageHeaderCard
 * (the "many controls" pattern from ADR-051).  Sits directly below the
 * PageHeaderCard on the grid.
 *
 * Controls are laid out in a flex row (wrapping allowed).  Uses
 * rowSpan="quarter" to occupy a single --card-quarter-row track at md+.
 *
 * @example
 * <ControlsStrip aria-label="Records controls">
 *   <PeriodSelector />
 *   <SortControl />
 * </ControlsStrip>
 */
export function ControlsStrip({
  children,
  'aria-label': ariaLabel,
  className,
}: ControlsStripProps) {
  return (
    <Card
      footprint="full"
      rowSpan="quarter"
      className={cn(
        className,
      )}
    >
      {/* <section> carries the landmark role + accessible label.
          The Card <div> provides the glass surface; the section names the
          controls region for screen readers (WCAG 2.4.6). */}
      <section
        aria-label={ariaLabel}
        className="flex flex-1 flex-wrap items-center gap-2 px-[var(--card-pad-compact)]"
      >
        {children}
      </section>
    </Card>
  );
}
