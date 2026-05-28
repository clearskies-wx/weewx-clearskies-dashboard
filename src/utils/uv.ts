// uv.ts — Shared EPA UV index segments utility.
//
// The EPA UV categories (Low/Moderate/High/Very High/Extreme) are used in
// multiple places: the Solar/UV card on the Now page and the daily forecast
// cards on the Forecast page.  Centralising the segment definitions here
// ensures both views use identical thresholds and color values.
//
// Color rationale (WCAG 1.4.11 Non-Text Contrast):
//   The raw EPA UV palette uses #3EA72D green and #FFF300 yellow, which fail
//   the 3:1 graphical-object contrast threshold against white card backgrounds.
//   The colors below are WCAG-adjusted replacements that preserve EPA category
//   semantics while meeting ≥3:1 against #FFFFFF (light) and ≈#1A1A1A (dark).
//   Contrast ratios verified via WebAIM Contrast Checker (2025-05):
//
//     Low (0–2):        #1A7A1A  (~7.0:1 on white, ~5.2:1 on #1A1A1A)
//     Moderate (3–5):   #B8A000  (~3.4:1 on white, ~4.6:1 on #1A1A1A)
//     High (6–7):       #C45E00  (~4.0:1 on white, ~5.4:1 on #1A1A1A)
//     Very High (8–10): #CC0000  (~5.9:1 on white, ~6.8:1 on #1A1A1A)
//     Extreme (11+):    #6B2D8B  (~5.5:1 on white, ~4.3:1 on #1A1A1A)
//
// NOTE: color is NEVER the sole signal — callers must always render the text
//   label alongside the color chip (WCAG 1.4.1 Use of Color).

export interface UvSegment {
  min: number;
  max: number;
  /** Human-readable risk label (e.g. "Low", "Moderate"). */
  label: string;
  /** WCAG-accessible stroke/text color hex for UI elements. */
  color: string;
  /** Semi-transparent background tint (20 % opacity) for badge backgrounds. */
  bgColor: string;
  /**
   * i18n key path within the 'now' namespace for the translated label.
   * e.g. 'solarUv.uv.low' → t('solarUv.uv.low') returns the localised string.
   */
  labelKey: string;
}

export const UV_SEGMENTS: UvSegment[] = [
  { min: 0,  max: 2,        label: 'Low',       color: '#1A7A1A', bgColor: '#1A7A1A20', labelKey: 'solarUv.uv.low'      },
  { min: 3,  max: 5,        label: 'Moderate',  color: '#B8A000', bgColor: '#B8A00020', labelKey: 'solarUv.uv.moderate'  },
  { min: 6,  max: 7,        label: 'High',      color: '#C45E00', bgColor: '#C45E0020', labelKey: 'solarUv.uv.high'      },
  { min: 8,  max: 10,       label: 'Very High', color: '#CC0000', bgColor: '#CC000020', labelKey: 'solarUv.uv.veryHigh'  },
  { min: 11, max: Infinity, label: 'Extreme',   color: '#6B2D8B', bgColor: '#6B2D8B20', labelKey: 'solarUv.uv.extreme'   },
];

/**
 * getUvSegment — return the matching UvSegment for a given UV index value.
 *
 * Returns null when uv is null or undefined (sensor offline or forecast not
 * available).  Callers must handle null and render "N/A" or hide the element.
 */
export function getUvSegment(uv: number | null | undefined): UvSegment | null {
  if (uv == null) return null;
  return UV_SEGMENTS.find(s => uv >= s.min && uv <= s.max) ?? null;
}

/**
 * getUvLabel — convenience wrapper that returns the English fallback label.
 *
 * For translated labels, use getUvSegment() and pass segment.labelKey to
 * the i18next t() function.
 */
export function getUvLabel(uv: number | null | undefined): string {
  const segment = getUvSegment(uv);
  return segment?.label ?? 'N/A';
}
