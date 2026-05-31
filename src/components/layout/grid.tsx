// grid.tsx — Single-source grid primitive (ADR-051).
//
// This is the ONLY place the 4→2→1 column grid definition lives.  The future
// operator-customisable grid engine will replace this component's internals
// without touching individual cards — keeping the definition here (not on each
// card or page) is the entire point.
//
// Column rule (ADR-051): columns are ENFORCED now.  Row heights are
// CONTENT-DRIVEN (grid-auto-rows: auto) — no fixed track is set here; that
// ships with the future grid engine to avoid clipping rich cards today.

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
 * Row heights are content-driven (`grid-auto-rows: auto`) — the fixed
 * `--card-half-row` track is reserved for the future grid engine (ADR-051).
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
        // max-width uses the --container-max token (80rem)
        'max-w-[var(--container-max)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
