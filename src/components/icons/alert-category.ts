/**
 * alert-category.ts — Pure classification function for alert event strings
 * and Aeris hazardType codes.
 *
 * Separated from alert-icon-map.tsx so the non-component export does not
 * trigger react-refresh/only-export-components lint rule.
 *
 * See alert-icon-map.tsx for the full ADR-050 documentation.
 * hazardType support added per ADR-052 (geography-correct alert model).
 */

/** Identifiers for the 18 alert categories (+ generic fallback). */
export type AlertCategory =
  | 'tsunami'
  | 'flood'
  | 'hurricane'
  | 'tornado'
  | 'fire'
  | 'thunderstorm'
  | 'winter'
  | 'heat'
  | 'fog'
  | 'wind'
  | 'marine'
  | 'air-quality'
  | 'earthquake'
  | 'volcano'
  | 'hail'
  | 'avalanche'
  | 'dust'
  | 'generic';

/**
 * Hazard-type classification table.
 * Each entry: [substring-to-match (lower-case), category].
 * First match wins — order matters for overlapping terms.
 *
 * Populated from ADR-052's Aeris hazard code list.  Matching is done with
 * .includes() so partial strings like "wildfire" match "fire" first if listed
 * before it — order is intentional.
 */
const HAZARD_TYPE_CLASSIFICATIONS: [string, AlertCategory][] = [
  // Tsunami first (avoid false marine match)
  ['tsunami', 'tsunami'],
  // Tropical / hurricane family — all regional names resolve to hurricane
  ['hurricane', 'hurricane'],
  ['typhoon', 'hurricane'],
  ['cyclone', 'hurricane'],
  ['tropical', 'hurricane'],
  // Tornado
  ['tornado', 'tornado'],
  // Wildfire before generic fire so both match explicitly
  ['wildfire', 'fire'],
  ['fire', 'fire'],
  // Thunderstorm / lightning
  ['thunderstorm', 'thunderstorm'],
  ['lightning', 'thunderstorm'],
  // Winter / frozen precipitation
  ['blizzard', 'winter'],
  ['winter', 'winter'],
  ['snow', 'winter'],
  ['ice', 'winter'],
  ['frost', 'winter'],
  ['freeze', 'winter'],
  // Heat
  ['excessive heat', 'heat'],
  ['heat', 'heat'],
  // Flood / flooding
  ['flooding', 'flood'],
  ['flood', 'flood'],
  // Fog
  ['fog', 'fog'],
  // Earthquake
  ['earthquake', 'earthquake'],
  // Volcano / volcanic
  ['volcanic', 'volcano'],
  ['volcano', 'volcano'],
  // Hail
  ['hail', 'hail'],
  // Avalanche / landslide
  ['avalanche', 'avalanche'],
  // Dust / sand
  ['dust', 'dust'],
  ['sand', 'dust'],
  // Marine / coastal / rip current / surf
  ['rip', 'marine'],
  ['surf', 'marine'],
  ['coastal', 'marine'],
  ['marine', 'marine'],
  ['gale', 'wind'],          // gale → wind (matches task table)
  // Wind
  ['wind', 'wind'],
  // Air quality / smoke
  ['air quality', 'air-quality'],
  ['smoke', 'air-quality'],
  ['air', 'air-quality'],
];

/**
 * Ordered classification table for free-text NWS (or similar) event names.
 * Each entry: [substring-to-match (lower-case), category].
 * First match wins — order matters for overlapping terms.
 */
const EVENT_NAME_CLASSIFICATIONS: [string, AlertCategory][] = [
  // Tsunami must come before marine (avoids a hypothetical "tsunami marine" mismatch)
  ['tsunami', 'tsunami'],
  // Flood — includes "flash flood", "flood", "coastal flood", "lakeshore flood"
  ['flood', 'flood'],
  // Tropical / hurricane — all tropical watches/warnings use hurricane (ADR-050)
  ['hurricane', 'hurricane'],
  ['tropical', 'hurricane'],
  ['typhoon', 'hurricane'],
  // Tornado
  ['tornado', 'tornado'],
  // Fire — wildfire, red flag, fire weather
  ['fire', 'fire'],
  ['wildfire', 'fire'],
  ['red flag', 'fire'],
  // Thunderstorm / lightning / severe storm
  ['thunderstorm', 'thunderstorm'],
  ['lightning', 'thunderstorm'],
  ['severe thunderstorm', 'thunderstorm'],
  // Winter — blizzard, winter storm, ice storm, freezing, frost, freeze
  ['blizzard', 'winter'],
  ['winter storm', 'winter'],
  ['winter weather', 'winter'],
  ['ice storm', 'winter'],
  ['freezing', 'winter'],
  ['frost', 'winter'],
  ['freeze', 'winter'],
  ['snow', 'winter'],
  ['sleet', 'winter'],
  // Heat & cold — heat advisory, excessive heat, wind chill, extreme cold
  ['excessive heat', 'heat'],
  ['heat', 'heat'],
  ['wind chill', 'heat'],
  ['extreme cold', 'heat'],
  ['cold', 'heat'],
  // Dense fog, smoke (smoke → air-quality via hazardType; event-name smoke stays fog per legacy)
  ['fog', 'fog'],
  ['smoke', 'fog'],
  // Wind — high wind, wind advisory (must come after wind chill / tornado)
  ['high wind', 'wind'],
  ['wind advisory', 'wind'],
  ['wind warning', 'wind'],
  // Marine — coastal, lake, small craft, rip current, surf, gale
  ['marine', 'marine'],
  ['coastal', 'marine'],
  ['small craft', 'marine'],
  ['rip current', 'marine'],
  ['surf', 'marine'],
  ['gale', 'marine'],
  ['lake wind', 'marine'],
  // Generic watch → WarningCircle (kept for backward compat with NWS event names)
  ['watch', 'generic'],
  // Generic warning / advisory → generic fallback
  ['warning', 'generic'],
  ['advisory', 'generic'],
];

/**
 * getAlertCategory — returns the alert category for a given alert record.
 *
 * Accepts either a plain event-name string (backward-compatible, for NWS event
 * strings) or an options object with optional `event` and `hazardType` fields
 * (for Aeris/OWM records that carry structured hazard codes per ADR-052).
 *
 * Resolution order:
 *   1. hazardType — checked first when provided; Aeris structured codes are
 *      more reliable than free-text event names.
 *   2. event — NWS-style free-text keyword matching (original behaviour).
 *   3. Fallback → 'generic'.
 *
 * Both fields are matched case-insensitively.
 *
 * @param input  An event-name string, or { event?, hazardType? }.
 * @returns      One of the 18 AlertCategory values, or 'generic' (fallback).
 */
export function getAlertCategory(
  input: string | { event?: string; hazardType?: string | null },
): AlertCategory {
  let event = '';
  let hazardType: string | null | undefined;

  if (typeof input === 'string') {
    event = input;
  } else {
    event = input.event ?? '';
    hazardType = input.hazardType;
  }

  // --- hazardType path (ADR-052: more reliable when present) ---
  if (hazardType) {
    const lowerHazard = hazardType.toLowerCase();
    for (const [substring, category] of HAZARD_TYPE_CLASSIFICATIONS) {
      if (lowerHazard.includes(substring)) {
        return category;
      }
    }
  }

  // --- event-name path (NWS / legacy free-text matching) ---
  const lowerEvent = event.toLowerCase();
  for (const [substring, category] of EVENT_NAME_CLASSIFICATIONS) {
    if (lowerEvent.includes(substring)) {
      return category;
    }
  }

  // Default: generic (ADR-052 — "sensible default for unmatched types")
  return 'generic';
}
