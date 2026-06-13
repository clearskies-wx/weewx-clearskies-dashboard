// grid.tsx — Single-source grid primitive (ADR-051).
//
// This is the ONLY place the 4→2→1 column grid definition lives.  The future
// operator-customisable grid engine will replace this component's internals
// without touching individual cards — keeping the definition here (not on each
// card or page) is the entire point.
//
// Row heights: mobile (<768px) rows are auto (content-driven, stacked phone layout).
// At md+ (≥768px) the base track is --card-quarter-row (2.75rem) via grid-auto-rows.
// Row-gap is 0; vertical spacing is provided by each card's bottom margin (mb-[var(--gap-grid)]).
// Row-span vocabulary: "quarter"=md:row-span-1, "half"=md:row-span-2, 1=md:row-span-4, 2=md:row-span-8.
// Hero and alert banner live OUTSIDE the grid (full-width block elements).

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
 * Column gap = `--gap-grid` (1rem) via `gap-x`.  Row-gap = 0 (`gap-y-0`).
 * Vertical spacing is provided by each card's `mb-[var(--gap-grid)]` margin.
 * Container capped at `--container-max` (80rem).
 * Base track = `--card-quarter-row` (2.75rem) at md+ via `grid-auto-rows`.
 * Mobile rows are auto (stacked, content-driven).
 * Cards use rowSpan prop: "quarter"=1 track, "half"=2 tracks, 1=4 tracks (default), 2=8 tracks.
 * Hero and alert banner live outside the grid.
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
        // Column gap uses the --gap-grid token (1rem); row-gap is 0.
        // Vertical spacing between cards comes from each card's mb-[var(--gap-grid)].
        // gap-y CANNOT be used here because it adds gaps between ALL tracks including
        // tracks within a multi-track span (a row-span-4 card would get 3 internal gaps).
        'gap-x-[var(--gap-grid)] gap-y-0',
        // Content-driven rows on mobile; base quarter-row track (--card-quarter-row) at md+ (≥768px).
        'auto-rows-[auto] md:auto-rows-[var(--card-quarter-row)]',
        // max-width uses the --container-max token (80rem)
        'max-w-[var(--container-max)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
