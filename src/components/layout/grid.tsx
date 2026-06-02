// grid.tsx — Single-source grid primitive (ADR-051).
//
// This is the ONLY place the 4→2→1 column grid definition lives.  The future
// operator-customisable grid engine will replace this component's internals
// without touching individual cards — keeping the definition here (not on each
// card or page) is the entire point.
//
// Row heights: mobile (<768px) rows are auto (stacked phone layout).
// At md+ (≥768px) the track is fixed at --card-half-row (5.5rem).
// Normal cards emit md:row-span-2 (11rem); tall cards emit md:row-span-4 (22rem);
// half-row cards (hero bar, alert banner) stay at 1 track (5.5rem).

import * as React from 'react';
import { cn } from '@/lib/utils';

type GridProps = {
  /** Extra Tailwind classes passed through to the outer container. */
  className?: string;
  children?: React.ReactNode;
};

/**
 * Grid — responsive card grid, 4→2→1 columns.
 *
 * - ≥1024px (lg): 4 columns
 * - ≥768px  (md): 2 columns
 * - <768px       : 1 column
 *
 * Gap = `--gap-grid` (1rem).  Container capped at `--container-max` (80rem).
 * Row track = `--card-half-row` (5.5rem) at md+ via `grid-auto-rows`.
 * Mobile rows are auto (stacked, content-driven).
 * Cards emit `md:row-span-2` (11rem) by default; `rowSpan={2}` emits
 * `md:row-span-4` (22rem); `halfRow` cards emit `md:row-span-1` (5.5rem).
 *
 * Render as `<div>` — no ARIA roles added; the consumer provides landmark
 * context (e.g. wrapping `<main>`).
 */
export function Grid({ className, children }: GridProps) {
  return (
    <div
      className={cn(
        // Container cap + centering
        'mx-auto w-full',
        // Responsive grid: 1 col default, 2 at md (≥768px), 4 at lg (≥1024px)
        'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
        // Gap uses the --gap-grid token (1rem) on both axes
        'gap-[var(--gap-grid)]',
        // md+: fixed half-row track (5.5rem). Cards emit md:row-span-2 for 11rem standard height.
        // Mobile: no fixed track — rows are auto (stacked phone layout).
        'md:auto-rows-[var(--card-half-row)]',
        // max-width uses the --container-max token (80rem)
        'max-w-[var(--container-max)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
