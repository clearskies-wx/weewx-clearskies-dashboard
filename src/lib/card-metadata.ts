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
  | "webcam"
  | "marine-summary";

export type CardFootprint = "tile" | "wide" | "panel" | "full";

export interface CardLayout {
  footprint: CardFootprint;
  rowSpan: 1 | 2 | 2.5;
}

export interface CardConfigField {
  fieldId: string;
  fieldType: 'text' | 'url' | 'number' | 'boolean' | 'select' | 'radio' | 'password' | 'textarea';
  label: string;
  helpText?: string;
  default?: string | number | boolean;
  options?: Array<{ value: string; label: string; description?: string }>;
  validation?: Array<{ ruleType: string; value: string | number }>;
}

export interface CardMetadata {
  type: CardType;
  /** i18n key (common namespace) for the human-readable card name — resolve
   *  via t(displayNameKey) wherever this metadata reaches a rendering
   *  context. Never a raw English string (ADR-021 / rules/coding.md §6). */
  displayNameKey: string;
  apiEndpoints: string[];
  allowedLayouts: CardLayout[];
  thumbnail: string;
  configFields?: CardConfigField[];
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
    displayNameKey: "cards.currentConditions",
    apiEndpoints: ["/api/v1/current", "/api/v1/forecast", "/api/v1/almanac"],
    allowedLayouts: [{ footprint: "wide", rowSpan: 2 }],
    thumbnail: "/card-thumbnails/current-conditions.png",
  },
  "now-forecast": {
    type: "now-forecast",
    displayNameKey: "cards.todaysForecast",
    apiEndpoints: ["/api/v1/forecast"],
    allowedLayouts: [{ footprint: "wide", rowSpan: 2 }],
    thumbnail: "/card-thumbnails/now-forecast.png",
  },
  "wind-compass": {
    type: "wind-compass",
    displayNameKey: "cards.wind",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 2 }],
    thumbnail: "/card-thumbnails/wind-compass.png",
  },
  "todays-highlights": {
    type: "todays-highlights",
    displayNameKey: "cards.todaysHighlights",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 2 }],
    thumbnail: "/card-thumbnails/todays-highlights.png",
  },
  "precipitation": {
    type: "precipitation",
    displayNameKey: "cards.precipitation",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/precipitation.png",
  },
  "barometer": {
    type: "barometer",
    displayNameKey: "cards.barometer",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/barometer.png",
  },
  "solar-radiation": {
    type: "solar-radiation",
    displayNameKey: "cards.solarRadiation",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/solar-radiation.png",
  },
  "uv-index": {
    type: "uv-index",
    displayNameKey: "cards.uvIndex",
    apiEndpoints: ["/api/v1/current", "/api/v1/forecast", "/api/v1/almanac"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/uv-index.png",
  },
  "aqi": {
    type: "aqi",
    displayNameKey: "cards.airQualityIndex",
    apiEndpoints: ["/api/v1/aqi/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/aqi.png",
  },
  "sun-moon": {
    type: "sun-moon",
    displayNameKey: "cards.sunAndMoon",
    apiEndpoints: ["/api/v1/almanac"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/sun-moon.png",
  },
  "lightning": {
    type: "lightning",
    displayNameKey: "cards.lightning",
    apiEndpoints: ["/api/v1/current"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/lightning.png",
  },
  "earthquake": {
    type: "earthquake",
    displayNameKey: "cards.earthquakes",
    apiEndpoints: ["/api/v1/earthquakes"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/earthquake.png",
  },
  "radar": {
    type: "radar",
    displayNameKey: "cards.radar",
    apiEndpoints: ["/api/v1/station"],
    allowedLayouts: [{ footprint: "wide", rowSpan: 2.5 }],
    thumbnail: "/card-thumbnails/radar.png",
  },
  "webcam": {
    type: "webcam",
    displayNameKey: "cards.webcam",
    // Webcam reads /webcam.json (a static file served by Caddy), not an API endpoint.
    apiEndpoints: [],
    allowedLayouts: [{ footprint: "wide", rowSpan: 2.5 }],
    thumbnail: "/card-thumbnails/webcam.png",
  },
  "marine-summary": {
    type: "marine-summary",
    displayNameKey: "cards.marineSummary",
    apiEndpoints: ["/api/v1/marine"],
    allowedLayouts: [{ footprint: "tile", rowSpan: 1 }],
    thumbnail: "/card-thumbnails/marine-summary.png",
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
