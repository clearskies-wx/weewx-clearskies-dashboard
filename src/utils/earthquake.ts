// earthquake.ts — Shared earthquake display utilities.
//
// Extracted from src/routes/seismic.tsx so both the Seismic page and the
// EarthquakeCard tile can use the same magnitude-badge and PAGER-alert
// colour mappings without duplication.
//
// A11y note (§5.1): colour is never the sole signal here.  Callers must pair
// the colour class with a numeric value (magnitude badge) or a text label
// (PAGER alert pill) so the meaning is conveyed without colour.

import type { EarthquakeRecord } from '../api/types';

// ---------------------------------------------------------------------------
// magnitudeClasses
// ---------------------------------------------------------------------------

// MMI-scale colours for the magnitude badge.  Approximate magnitude → MMI:
//   M<3  → MMI I–III  (not felt / weak)
//   M3–4 → MMI IV–V  (light / moderate)
//   M4–5 → MMI VI    (strong)
//   M5–7 → MMI VII–IX (very strong / severe)
//   M7+  → MMI X+    (extreme)
//
// Returns separate `bg` and `text` Tailwind class strings so the caller can
// apply them to the badge container and its text children independently.
export function magnitudeClasses(mag: number): { bg: string; text: string } {
  if (mag < 3)   return { bg: 'bg-sky-100 dark:bg-sky-900/40',        text: 'text-sky-800 dark:text-sky-200' };
  if (mag < 4)   return { bg: 'bg-green-500 dark:bg-green-600',       text: 'text-white dark:text-white' };
  if (mag < 5)   return { bg: 'bg-yellow-400 dark:bg-yellow-500',     text: 'text-yellow-900 dark:text-yellow-950' };
  if (mag < 7)   return { bg: 'bg-orange-500 dark:bg-red-600',        text: 'text-white dark:text-white' };
  return           { bg: 'bg-red-800 dark:bg-red-900',                text: 'text-white dark:text-red-100' };
}

// ---------------------------------------------------------------------------
// alertClasses
// ---------------------------------------------------------------------------

// PAGER alert-level badge colours — matches the real USGS palette semantics.
// Text label must always be present alongside the colour (§5.1: not colour-only).
export function alertClasses(level: EarthquakeRecord['alert']): string {
  switch (level) {
    case 'green':  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'yellow': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'orange': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
    case 'red':    return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    default:       return '';
  }
}
