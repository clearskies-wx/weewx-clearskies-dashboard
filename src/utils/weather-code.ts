// weather-code.ts — Aeris-to-WMO weather code mapping utility.
//
// The Aeris forecast provider returns provider-specific code strings
// (e.g. "::FW", "::SC") instead of WMO numeric codes (0–99).
// WeatherIcon only understands WMO numbers, so this utility normalises
// both forms to a single WMO number or null when the code is unknown.

/** Map of Aeris code suffixes (after stripping leading colons) to WMO codes. */
const AERIS_TO_WMO: Record<string, number> = {
  CL: 0,   // Clear
  FW: 1,   // Fair Weather / Mostly Clear
  SC: 2,   // Scattered Clouds / Partly Cloudy
  BK: 3,   // Mostly Cloudy / Broken
  OV: 3,   // Overcast
  F: 45,   // Fog
  ZF: 48,  // Freezing Fog
  L: 51,   // Drizzle
  ZL: 56,  // Freezing Drizzle
  R: 61,   // Rain
  RW: 80,  // Rain Showers
  ZR: 66,  // Freezing Rain
  S: 71,   // Snow
  SW: 85,  // Snow Showers
  IP: 67,  // Sleet / Ice Pellets
  T: 95,   // Thunderstorm
  A: 99,   // Hail
  K: 6,    // Smoke
  BD: 7,   // Blowing dust
  H: 5,    // Haze
  BS: 75,  // Blowing snow → heavy snow
  BY: 80,  // Blowing spray → rain showers
  VA: 8,   // Volcanic ash
  WM: 79,  // Wintry mix → ice pellets (closest WMO)
  RS: 79,  // Rain/snow mix → ice pellets
  SI: 79,  // Snow/sleet → ice pellets
};

/** Map of NWS forecast icon shortnames (e.g. "skc", "sct/smoke") to WMO codes. */
const NWS_TO_WMO: Record<string, number> = {
  skc: 0,       // Clear
  few: 1,       // Few clouds
  sct: 2,       // Scattered clouds
  bkn: 3,       // Broken / mostly cloudy
  ovc: 3,       // Overcast
  fg: 45,       // Fog
  ra: 61,       // Rain
  shra: 80,     // Rain showers
  sn: 71,       // Snow
  tsra: 95,     // Thunderstorm
  fzra: 66,     // Freezing rain
  mix: 79,      // Wintry mix → ice pellets
  ip: 79,       // Sleet → ice pellets
  dust: 7,      // Dust
  smoke: 6,     // Smoke
  haze: 5,      // Haze
  hot: 0,       // Hot → clear
  cold: 0,      // Cold → clear
  blizzard: 75, // Heavy snow
  wind_skc: 0,  // Windy + clear (strip wind)
  wind_few: 1,  // Windy + few clouds
  wind_sct: 2,  // Windy + scattered
  wind_bkn: 3,  // Windy + broken
  wind_ovc: 3,  // Windy + overcast
};

/** Map of OpenWeatherMap condition IDs (200–804) to WMO codes. */
const OWM_TO_WMO: Record<number, number> = {
  // Thunderstorm group (200-232)
  200: 95, 201: 95, 202: 95, 210: 95, 211: 95, 212: 95, 221: 95, 230: 95, 231: 95, 232: 95,
  // Drizzle group (300-321)
  300: 51, 301: 51, 302: 51, 310: 51, 311: 51, 312: 51, 313: 51, 314: 51, 321: 51,
  // Rain group (500-504)
  500: 61, 501: 61, 502: 65, 503: 65, 504: 65,
  // Freezing rain
  511: 66,
  // Rain showers (520-531)
  520: 80, 521: 80, 522: 80, 531: 80,
  // Snow group (600-622)
  600: 71, 601: 71, 602: 75, 611: 79, 612: 79, 613: 79, 615: 79, 616: 79, 620: 71, 621: 71, 622: 75,
  // Atmosphere group (700-series)
  701: 10,  // Mist
  711: 6,   // Smoke
  721: 5,   // Haze
  731: 7,   // Dust
  741: 45,  // Fog
  751: 7,   // Sand → dust
  761: 7,   // Dust
  762: 8,   // Volcanic ash
  771: 3,   // Squall → overcast
  781: 95,  // Tornado → thunderstorm (closest)
  // Clear/clouds (800-804)
  800: 0,   // Clear
  801: 1,   // Few clouds
  802: 2,   // Scattered clouds
  803: 3,   // Broken clouds
  804: 3,   // Overcast
};

/**
 * Normalise a weather code from any forecast provider to a WMO numeric code.
 *
 * - null/undefined → null
 * - number 0-99 → returned as-is (already WMO)
 * - number >99 → looked up in the OWM condition-ID map (OWM uses 200-804)
 * - string → tried in order: numeric string, Aeris colon format
 *   ("PA::F", "::SC"), compound NWS shortname ("sct/smoke"), plain NWS
 *   shortname, and finally a raw (uppercased) Aeris lookup as a fallback.
 *
 * Aeris codes use the format "[modifier]::[weather_type]" — e.g. "PA::F"
 * (Patchy Fog), "::SC" (Scattered Clouds). Modifiers (PA, SH, IN, etc.)
 * are not weather types. We scan all non-empty segments for the first
 * one that maps to a WMO code.
 *
 * NWS compound shortnames (e.g. "sct/smoke") combine a sky-cover code
 * with an atmosphere/precip code; the more specific (higher-valued, per
 * WMO ordering) condition wins so smoke/precip is preferred over plain
 * sky cover.
 */
export function toWmoCode(code: number | string | null | undefined): number | null {
  if (code == null) return null;

  // Numeric input
  if (typeof code === 'number') {
    // OWM codes are 200-804; WMO codes are 0-99
    if (code > 99) {
      return OWM_TO_WMO[code] ?? null;
    }
    return code;
  }

  // String input — try multiple strategies
  const trimmed = code.trim();

  // 1. Try parsing as a number (may be "61" or "500")
  const asNum = parseInt(trimmed, 10);
  if (!isNaN(asNum) && String(asNum) === trimmed) {
    if (asNum > 99) return OWM_TO_WMO[asNum] ?? null;
    return asNum;
  }

  // 2. Try Aeris code format (has colons: "::SC", "PA::F", "+::RW")
  if (trimmed.includes(':')) {
    const stripped = trimmed.replace(/^:+/, '');
    const segments = stripped.split(':').map(s => s.replace(/^[+-]/, '')).filter(Boolean);
    if (segments.some(s => s === 'T' || s === 'TW')) return 95;
    for (const seg of segments) {
      const mapped = AERIS_TO_WMO[seg];
      if (mapped !== undefined) return mapped;
    }
    return null;
  }

  // 3. Try NWS shortname (may be compound: "sct/smoke")
  const lower = trimmed.toLowerCase();
  if (lower.includes('/')) {
    const parts = lower.split('/').filter(Boolean);
    let best: number | null = null;
    for (const part of parts) {
      const mapped = NWS_TO_WMO[part];
      if (mapped !== undefined) {
        // Prefer more specific codes (precip/atmosphere > sky)
        if (best === null || mapped > best) best = mapped;
      }
    }
    if (best !== null) return best;
    // Try as fog compound (e.g., "fg/ovc")
    if (parts.includes('fg')) return 45;
  }

  // 4. Direct NWS lookup
  const nwsMapped = NWS_TO_WMO[lower];
  if (nwsMapped !== undefined) return nwsMapped;

  // 5. Fallback: try Aeris lookup on the raw string (no colons)
  const aerisMapped = AERIS_TO_WMO[trimmed.toUpperCase()];
  if (aerisMapped !== undefined) return aerisMapped;

  return null;
}
