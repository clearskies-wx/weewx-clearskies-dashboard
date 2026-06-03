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
};

/**
 * Normalise a weather code from any forecast provider to a WMO numeric code.
 *
 * - null/undefined → null
 * - number → returned as-is (already WMO)
 * - string → strip leading colons, look up in Aeris map; null if not found
 */
export function toWmoCode(code: number | string | null | undefined): number | null {
  if (code == null) return null;
  if (typeof code === 'number') return code;
  const stripped = code.replace(/^:+/, '');
  const segments = stripped.split(':').map(s => s.replace(/^[+-]/, ''));
  if (segments.some(s => s === 'T' || s === 'TW')) return 95;
  const mapped = AERIS_TO_WMO[segments[0]];
  return mapped !== undefined ? mapped : null;
}
