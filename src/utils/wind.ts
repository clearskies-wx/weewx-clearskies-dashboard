/**
 * wind.ts — Wind direction utilities.
 *
 * cardinalFromDegrees: converts a numeric wind direction (degrees) to one of
 * the 16 canonical cardinal codes used by the BFF and i18n system (ADR-021).
 *
 * Formula matches the BFF exactly:
 *   idx = Math.floor(((deg + 11.25) % 360) / 22.5) % 16
 *
 * This is used for forecast data, which arrives as raw degree numbers because
 * the forecast BFF path does not apply a cardinal transform.  For /current and
 * SSE observations, prefer the BFF-supplied windDirCardinal / windGustDirCardinal
 * fields directly from the Observation type.
 *
 * Code set (exactly 16, language-neutral):
 *   N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW
 */

const CARDINAL_CODES = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
] as const;

export type CardinalCode = typeof CARDINAL_CODES[number];

/**
 * Convert wind direction degrees to a canonical 16-point cardinal code.
 *
 * Boundary behaviour (matches BFF `int((deg+11.25)/22.5)%16`):
 *   0°         → N
 *   11.24°     → N   (last degree before NNE sector)
 *   11.25°     → NNE (first degree of NNE sector)
 *   348.74°    → NNW
 *   348.75°    → N   (wraps back to N via modulo)
 *   360°       → N   (equivalent to 0°)
 *
 * @param deg Wind direction in degrees (0–360, meteorological convention).
 *            Values outside [0, 360] are normalised by the modulo.
 * @returns Canonical cardinal code, or null when deg is null / non-finite.
 */
export function cardinalFromDegrees(deg: number | null): CardinalCode | null {
  if (deg === null || !Number.isFinite(deg)) return null;
  // Normalise to [0, 360) then apply the BFF sector formula.
  const normalised = ((deg % 360) + 360) % 360;
  const idx = Math.floor(((normalised + 11.25) % 360) / 22.5) % 16;
  return CARDINAL_CODES[idx];
}
