/**
 * alert-colors.ts — Per-system, per-severity color mapping for alert banners.
 *
 * Returns the correct rendering colors for a given alert system + severity level.
 * Colors match the real national alert system palettes documented in
 * docs/reference/GLOBAL-ALERT-SYSTEMS-RESEARCH.md §6.
 *
 * A11y note (rules/coding.md §5.1): color is NEVER the only signal — the banner
 * always pairs color with an icon (AlertIcon) and visible event text. This utility
 * only supplies the color; the component must supply the non-color signals.
 *
 * iconFg values:
 *   'white' — icon rendered white on a dark background (red, orange, purple, dark blue)
 *   'dark'  — icon rendered dark on a light background (yellow, amber, green)
 *             '#3d2800' for yellow/amber backgrounds (dark brown — readable on yellow)
 *             '#14532d' for green backgrounds (dark green — readable on green)
 */

export interface AlertColorSet {
  /** Background color for the icon panel. CSS hex string. */
  iconBg: string;
  /** Border accent color (left + bottom border). CSS hex string. */
  border: string;
  /** Title / event name text color. CSS hex string or 'currentColor'. */
  titleColor: string;
  /** Icon foreground: 'white' on dark bg, 'dark' on light bg.
   *  Caller should resolve 'dark' to the appropriate dark color for the bg. */
  iconFg: 'white' | 'dark';
  /** Resolved icon foreground CSS color (already resolved from iconFg). */
  iconFgColor: string;
}

// ---------------------------------------------------------------------------
// Level → color maps per system
// ---------------------------------------------------------------------------

/** NWS (US National Weather Service) — Warning/Watch/Advisory/Statement */
const NWS_LEVELS: Record<number, Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>> = {
  4: { iconBg: '#dc2626', border: '#dc2626', iconFg: 'white', iconFgColor: '#ffffff' }, // Warning — red
  3: { iconBg: '#ea580c', border: '#ea580c', iconFg: 'white', iconFgColor: '#ffffff' }, // Watch — orange
  2: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // Advisory — amber
  1: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // Statement — treated as advisory (amber)
};

/** MeteoAlarm (EU) — Red/Orange/Yellow/Green */
const METEOALARM_LEVELS: Record<number, Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>> = {
  4: { iconBg: '#dc2626', border: '#dc2626', iconFg: 'white', iconFgColor: '#ffffff' }, // Red
  3: { iconBg: '#ea580c', border: '#ea580c', iconFg: 'white', iconFgColor: '#ffffff' }, // Orange
  2: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // Yellow
  1: { iconBg: '#16a34a', border: '#16a34a', iconFg: 'dark',  iconFgColor: '#14532d' }, // Green
};

/** UK Met Office — Red/Amber/Yellow */
const UKMET_LEVELS: Record<number, Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>> = {
  4: { iconBg: '#dc2626', border: '#dc2626', iconFg: 'white', iconFgColor: '#ffffff' }, // Red
  3: { iconBg: '#d97706', border: '#d97706', iconFg: 'white', iconFgColor: '#ffffff' }, // Amber
  2: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // Yellow
  1: { iconBg: '#475569', border: '#475569', iconFg: 'white', iconFgColor: '#ffffff' }, // fallback
};

/** JMA (Japan Meteorological Agency) — Emergency/Warning/Advisory */
const JMA_LEVELS: Record<number, Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>> = {
  4: { iconBg: '#7c3aed', border: '#7c3aed', iconFg: 'white', iconFgColor: '#ffffff' }, // Emergency/Special Warning — purple
  3: { iconBg: '#dc2626', border: '#dc2626', iconFg: 'white', iconFgColor: '#ffffff' }, // Warning — red
  2: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // Advisory — yellow
  1: { iconBg: '#475569', border: '#475569', iconFg: 'white', iconFgColor: '#ffffff' }, // fallback
};

/** IMD (India Meteorological Department) — Red/Orange/Yellow/Green */
const IMD_LEVELS: Record<number, Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>> = {
  4: { iconBg: '#dc2626', border: '#dc2626', iconFg: 'white', iconFgColor: '#ffffff' }, // Red
  3: { iconBg: '#ea580c', border: '#ea580c', iconFg: 'white', iconFgColor: '#ffffff' }, // Orange
  2: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // Yellow
  1: { iconBg: '#16a34a', border: '#16a34a', iconFg: 'dark',  iconFgColor: '#14532d' }, // Green
};

/** BoM (Bureau of Meteorology, Australia) — Severe Warning/Warning/Watch/Advice */
const BOM_LEVELS: Record<number, Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>> = {
  4: { iconBg: '#dc2626', border: '#dc2626', iconFg: 'white', iconFgColor: '#ffffff' }, // Severe Warning — red
  3: { iconBg: '#ea580c', border: '#ea580c', iconFg: 'white', iconFgColor: '#ffffff' }, // Warning — orange
  2: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // Watch — yellow
  1: { iconBg: '#2563eb', border: '#2563eb', iconFg: 'white', iconFgColor: '#ffffff' }, // Advice — blue
};

/** KMA (Korea Meteorological Administration) */
const KMA_LEVELS: Record<number, Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>> = {
  4: { iconBg: '#dc2626', border: '#dc2626', iconFg: 'white', iconFgColor: '#ffffff' }, // Red
  3: { iconBg: '#ea580c', border: '#ea580c', iconFg: 'white', iconFgColor: '#ffffff' }, // Orange
  2: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // Yellow
  1: { iconBg: '#475569', border: '#475569', iconFg: 'white', iconFgColor: '#ffffff' }, // fallback
};

/** Environment Canada (envca) — Warning/Watch/Advisory/Statement */
const ENVCA_LEVELS: Record<number, Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>> = {
  4: { iconBg: '#dc2626', border: '#dc2626', iconFg: 'white', iconFgColor: '#ffffff' }, // Warning — red
  3: { iconBg: '#ea580c', border: '#ea580c', iconFg: 'white', iconFgColor: '#ffffff' }, // Watch — orange
  2: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // Advisory — amber
  1: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // Statement — treated as advisory (amber)
};

/** Generic fallback — level-based only (unknown system or null alertSystem). */
const GENERIC_LEVELS: Record<number, Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>> = {
  4: { iconBg: '#dc2626', border: '#dc2626', iconFg: 'white', iconFgColor: '#ffffff' }, // red
  3: { iconBg: '#ea580c', border: '#ea580c', iconFg: 'white', iconFgColor: '#ffffff' }, // orange
  2: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // yellow
  1: { iconBg: '#ca8a04', border: '#ca8a04', iconFg: 'dark',  iconFgColor: '#3d2800' }, // advisory-level amber
};

/** Fallback used when both system and level are unknown. */
const UNKNOWN_FALLBACK: Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'> = {
  iconBg:      '#475569',
  border:      '#475569',
  iconFg:      'white',
  iconFgColor: '#ffffff',
};

// ---------------------------------------------------------------------------
// System → level-map lookup
// ---------------------------------------------------------------------------

const SYSTEM_MAP: Record<string, Record<number, Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>>> = {
  nws:         NWS_LEVELS,
  meteoalarm:  METEOALARM_LEVELS,
  ukmet:       UKMET_LEVELS,
  jma:         JMA_LEVELS,
  imd:         IMD_LEVELS,
  bom:         BOM_LEVELS,
  kma:         KMA_LEVELS,
  envca:       ENVCA_LEVELS,
};

// ---------------------------------------------------------------------------
// Title color helper — dark text on yellow/green, light on dark backgrounds
// ---------------------------------------------------------------------------

function titleColorForBg(iconBg: string): string {
  // Yellow / amber / green backgrounds — use dark text
  if (iconBg === '#ca8a04') return '#3d2800';
  if (iconBg === '#d97706') return '#3d2800';
  if (iconBg === '#16a34a') return '#14532d';
  // All other backgrounds are dark — white text
  return '#ffffff';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * getAlertColors — resolves the rendering color set for a given alert.
 *
 * @param alertSystem   The `alertSystem` field from AlertRecord (e.g. "nws", "meteoalarm").
 *                      Case-insensitive. Pass null for passthrough / unknown.
 * @param severityLevel The `severityLevel` field from AlertRecord (1–4). Pass null for unknown.
 * @param colorOverride Optional hex string from AlertRecord.color (Aeris `details.color`).
 *                      When provided AND it differs meaningfully from the system default,
 *                      it is used as both iconBg and border.  The Aeris color is an
 *                      additional data signal but does NOT override the national system
 *                      palette when we have a known system+level combination — that would
 *                      break the semantic meaning of the colors (research doc §6 note on
 *                      Aeris `details.color: "FF7000"` not being the MeteoAlarm Yellow).
 *                      Override is only applied for UNKNOWN system or null level.
 * @returns AlertColorSet
 */
export function getAlertColors(
  alertSystem: string | null,
  severityLevel: number | null,
  colorOverride?: string | null,
): AlertColorSet {
  const system = alertSystem?.toLowerCase() ?? null;
  const level  = severityLevel ?? 0;

  // Look up system-specific level map
  const levelMap = system ? (SYSTEM_MAP[system] ?? null) : null;

  // Clamp level to 1–4 range for the lookup; anything outside gets the level-1 entry or fallback
  const clampedLevel = Math.max(1, Math.min(4, level)) as 1 | 2 | 3 | 4;

  let base: Pick<AlertColorSet, 'iconBg' | 'border' | 'iconFg' | 'iconFgColor'>;

  if (levelMap && levelMap[clampedLevel]) {
    // Known system + valid level — use national palette
    base = levelMap[clampedLevel];
  } else if (level >= 1 && level <= 4) {
    // Unknown system but valid level — apply generic level-based palette
    base = GENERIC_LEVELS[clampedLevel];
  } else if (colorOverride) {
    // Unknown system AND unknown level but Aeris color is available — use it
    const hex = colorOverride.startsWith('#') ? colorOverride : `#${colorOverride}`;
    const fg = isLightColor(hex) ? 'dark' : 'white';
    const fgColor = fg === 'dark' ? '#3d2800' : '#ffffff';
    base = { iconBg: hex, border: hex, iconFg: fg, iconFgColor: fgColor };
  } else {
    // Total unknown — neutral slate
    base = UNKNOWN_FALLBACK;
  }

  return {
    ...base,
    titleColor: titleColorForBg(base.iconBg),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * isLightColor — rough luminance check for a CSS hex color.
 * Returns true if the color is "light" (should use dark text/icon).
 * Only used for Aeris color overrides on unknown system+level combinations.
 */
function isLightColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // Relative luminance approximation (WCAG formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}
