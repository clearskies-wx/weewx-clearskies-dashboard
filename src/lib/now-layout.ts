// now-layout.ts — Layout config types and default layout for the Now page.
// Per §9 Dynamic Now Page in DASHBOARD-MANUAL.md.

import type { CardType, CardFootprint } from './card-metadata';

/**
 * A single card entry in the Now page layout config.
 * Mirrors the `allowedLayouts` entries in card-metadata.ts.
 */
export interface NowLayoutEntry {
  type: CardType;
  footprint: CardFootprint;
  rowSpan: 1 | 2 | 2.5;
}

/**
 * The full Now page layout configuration.
 * version: 1 for the initial schema; increment on breaking changes.
 */
export interface NowLayoutConfig {
  version: 1;
  cards: NowLayoutEntry[];
}

/**
 * Compiled-in default layout matching the current hardcoded card arrangement
 * in now.tsx. Used when /now-layout.json is absent or unparseable.
 * Card order matches the current now.tsx rendering order exactly.
 */
export const DEFAULT_NOW_LAYOUT: NowLayoutConfig = {
  version: 1,
  cards: [
    // Row 1-2: Current Conditions (wide 2×2) + Today's Forecast (wide 2×2)
    { type: "current-conditions", footprint: "wide", rowSpan: 2 },
    { type: "now-forecast",       footprint: "wide", rowSpan: 2 },

    // Row 3-4: Wind (tile 1×2) + Highlights (tile 1×2) + Precip/Baro/Solar/UV
    { type: "wind-compass",       footprint: "tile", rowSpan: 2 },
    { type: "todays-highlights",  footprint: "tile", rowSpan: 2 },
    { type: "precipitation",      footprint: "tile", rowSpan: 1 },
    { type: "barometer",          footprint: "tile", rowSpan: 1 },
    { type: "solar-radiation",    footprint: "tile", rowSpan: 1 },
    { type: "uv-index",           footprint: "tile", rowSpan: 1 },

    // Row 5: AQI · Sun & Moon · Lightning · Earthquake (4 tiles)
    { type: "aqi",                footprint: "tile", rowSpan: 1 },
    { type: "sun-moon",           footprint: "tile", rowSpan: 1 },
    { type: "lightning",          footprint: "tile", rowSpan: 1 },
    { type: "earthquake",         footprint: "tile", rowSpan: 1 },

    // Row 6+: Radar (wide 2×2.5) + Webcam (wide 2×2.5)
    { type: "radar",              footprint: "wide", rowSpan: 2.5 },
    { type: "webcam",             footprint: "wide", rowSpan: 2.5 },
  ],
};

/**
 * Fetch the operator-configured Now page layout from /now-layout.json.
 * Falls back to DEFAULT_NOW_LAYOUT on 404, network error, or parse error.
 * Never throws.
 *
 * Per §9: Caddy serves /now-layout.json. On 404 or parse error, return
 * DEFAULT_NOW_LAYOUT. Cards not in the layout don't render — this is how
 * operators hide individual Now page cards.
 */
export async function fetchNowLayout(): Promise<NowLayoutConfig> {
  try {
    const resp = await fetch('/now-layout.json');
    if (!resp.ok) return DEFAULT_NOW_LAYOUT;
    const data = await resp.json() as unknown;
    if (
      data !== null &&
      typeof data === 'object' &&
      'version' in data &&
      (data as { version: unknown }).version === 1 &&
      'cards' in data &&
      Array.isArray((data as { cards: unknown }).cards)
    ) {
      return data as NowLayoutConfig;
    }
    return DEFAULT_NOW_LAYOUT;
  } catch {
    return DEFAULT_NOW_LAYOUT;
  }
}
