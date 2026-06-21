// card-metadata.ts — Card type definitions and metadata for all 14 built-in cards.
// IMPORTANT: This file must have ZERO React imports. It is imported by the
// build-time manifest script (scripts/generate-card-manifest.ts) in a non-React context.
// Per §8 Card Plugin Contract in DASHBOARD-MANUAL.md.

export type CardType =
  | "current-conditions"
  | "now-forecast"
  | "wind-compass"
  | "todays-highlights"
  | "precipitation"
  | "barometer"
  | "solar-radiation"
  | "uv-index"
  | "aqi"
  | "sun-moon"
  | "lightning"
  | "earthquake"
  | "radar"
  | "webcam";

export type CardFootprint = "tile" | "wide" | "panel" | "full";

export interface CardLayout {
  footprint: CardFootprint;
  rowSpan: 1 | 2 | 2.5;
}

export interface CardMetadata {
  type: CardType;
  displayName: string;
  apiEndpoints: string[];
  allowedLayouts: CardLayout[];
  thumbnail: string;
}

/**
 * Metadata for all 14 built-in cards.
 * apiEndpoints are full paths including the /api/v1 prefix.
 * allowedLayouts reflects the current hardcoded layout in now.tsx.
 * Operators will be able to choose from this list in the admin layout editor.
 */
export const CARD_METADATA: Record<CardType, CardMetadata> = {
  "current-conditions": {
    type: "current-conditions",
    displayName: "Current Conditions",
    apiEndpoints: ["/api/v1/current", "/api/v1/forecast", "/api/v1/almanac"],
    allowedLayouts: [{ footprint: "wide", rowSpan: 2 }],
    thumbnail: "/card-thumbnails/current-conditions.png",
  },
  "now-forecast": {
    type: "now-forecast",
    displayName: "Today's Forecast",
    apiEndpoints: ["/api/v1/forecast"],
    allowedLayouts: [{ footprint: "wide", rowSpan: 2 }],
    thumbnail: "/card-thumbnails/now-forecast.png",
  },
  "wind-compass": {
    type: "wind-compass",
    displayName: "Wind",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 2 }],
    thumbnail: "/card-thumbnails/wind-compass.png",
  },
  "todays-highlights": {
    type: "todays-highlights",
    displayName: "Today's Highlights",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 2 }],
    thumbnail: "/card-thumbnails/todays-highlights.png",
  },
  "precipitation": {
    type: "precipitation",
    displayName: "Precipitation",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/precipitation.png",
  },
  "barometer": {
    type: "barometer",
    displayName: "Barometer",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/barometer.png",
  },
  "solar-radiation": {
    type: "solar-radiation",
    displayName: "Solar Radiation",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/solar-radiation.png",
  },
  "uv-index": {
    type: "uv-index",
    displayName: "UV Index",
    apiEndpoints: ["/api/v1/current", "/api/v1/forecast", "/api/v1/almanac"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/uv-index.png",
  },
  "aqi": {
    type: "aqi",
    displayName: "Air Quality Index",
    apiEndpoints: ["/api/v1/aqi/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/aqi.png",
  },
  "sun-moon": {
    type: "sun-moon",
    displayName: "Sun & Moon",
    apiEndpoints: ["/api/v1/almanac"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/sun-moon.png",
  },
  "lightning": {
    type: "lightning",
    displayName: "Lightning",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/lightning.png",
  },
  "earthquake": {
    type: "earthquake",
    displayName: "Earthquakes",
    apiEndpoints: ["/api/v1/earthquakes"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/earthquake.png",
  },
  "radar": {
    type: "radar",
    displayName: "Radar",
    apiEndpoints: ["/api/v1/station"],
    allowedLayouts: [{ footprint: "wide", rowSpan: 2.5 }],
    thumbnail: "/card-thumbnails/radar.png",
  },
  "webcam": {
    type: "webcam",
    displayName: "Webcam",
    // Webcam reads /webcam.json (a static file served by Caddy), not an API endpoint.
    apiEndpoints: [],
    allowedLayouts: [{ footprint: "wide", rowSpan: 2.5 }],
    thumbnail: "/card-thumbnails/webcam.png",
  },
};

/**
 * Collect and deduplicate all API endpoints required by a set of card types.
 * Used by the Now page container to determine which endpoints to fetch.
 */
export function getEndpointsForCards(types: CardType[]): string[] {
  const set = new Set<string>();
  for (const type of types) {
    const meta = CARD_METADATA[type];
    if (meta) {
      for (const ep of meta.apiEndpoints) {
        set.add(ep);
      }
    }
  }
  return Array.from(set);
}
