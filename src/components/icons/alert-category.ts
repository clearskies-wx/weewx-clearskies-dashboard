/**
 * alert-category.ts — Pure classification function for alert event strings.
 *
 * Separated from alert-icon-map.tsx so the non-component export does not
 * trigger react-refresh/only-export-components lint rule.
 *
 * See alert-icon-map.tsx for the full ADR-050 documentation.
 */

/** Identifiers for the 13 alert categories (+ default fallback). */
export type AlertCategory =
  | 'tsunami'
  | 'flood'
  | 'hurricane'
  | 'tornado'
  | 'fire'
  | 'thunderstorm'
  | 'snow'
  | 'heat'
  | 'fog'
  | 'wind'
  | 'marine'
  | 'watch'
  | 'warning';

/**
 * Ordered classification table.
 * Each entry: [substring-to-match (lower-case), category].
 * First match wins — order matters for overlapping terms.
 */
const ALERT_CLASSIFICATIONS: [string, AlertCategory][] = [
  // Tsunami must come before marine (avoids a hypothetical "tsunami marine" mismatch)
  ['tsunami', 'tsunami'],
  // Flood — includes "flash flood", "flood", "coastal flood", "lakeshore flood"
  ['flood', 'flood'],
  // Tropical / hurricane — all tropical watches/warnings use Hurricane (ADR-050)
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
  // Snow / winter — blizzard, winter storm, ice storm, freezing, frost, freeze
  ['blizzard', 'snow'],
  ['winter storm', 'snow'],
  ['winter weather', 'snow'],
  ['ice storm', 'snow'],
  ['freezing', 'snow'],
  ['frost', 'snow'],
  ['freeze', 'snow'],
  ['snow', 'snow'],
  ['sleet', 'snow'],
  // Heat & cold — heat advisory, excessive heat, wind chill, extreme cold
  ['excessive heat', 'heat'],
  ['heat', 'heat'],
  ['wind chill', 'heat'],
  ['extreme cold', 'heat'],
  ['cold', 'heat'],
  // Dense fog, smoke
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
  // Generic watch → WarningCircle
  ['watch', 'watch'],
  // Generic warning → Warning (catch-all for "warning" suffix before final default)
  ['warning', 'warning'],
  // Advisory → Warning (generic)
  ['advisory', 'warning'],
];

/**
 * getAlertCategory — returns the alert category for a given NWS event string.
 *
 * @param event  AlertRecord.event value (e.g. "Tornado Warning").
 * @returns      One of the 13 AlertCategory values, or 'warning' (default fallback).
 *
 * Matching is case-insensitive substring against the free-text event name.
 * Order matters: more-specific terms are listed before generic ones so that
 * "Flash Flood Warning" resolves to 'flood' before 'warning'.
 */
export function getAlertCategory(event: string): AlertCategory {
  const lower = event.toLowerCase();
  for (const [substring, category] of ALERT_CLASSIFICATIONS) {
    if (lower.includes(substring)) {
      return category;
    }
  }
  // Default: generic warning (ADR-050 — "sensible default for unmatched types")
  return 'warning';
}
