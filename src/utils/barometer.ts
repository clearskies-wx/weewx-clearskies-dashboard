/**
 * barometer.ts — Barometer trend utilities.
 *
 * Extracted from now.tsx for shared use between the Station Observations tile
 * and the PrecipitationBarometerCard component.
 */
import type { TFunction } from 'i18next';

/**
 * Returns a Unicode arrow character representing the direction of the barometer
 * trend.  Threshold of ±0.01 inHg is the standard WeeWx convention.
 */
export function barometerTrendArrow(trend: number | null): string {
  if (trend === null) return '→';
  if (trend > 0.01) return '↑';
  if (trend < -0.01) return '↓';
  return '→';
}

/**
 * Returns a human-readable trend label via i18n.
 * The `t` function must be from the 'now' namespace.
 * Reads keys: precipBarometer.trend.rising / .falling / .steady
 */
export function barometerTrendLabel(trend: number | null, t: TFunction): string {
  if (trend === null) return t('precipBarometer.trend.steady');
  if (trend > 0.01) return t('precipBarometer.trend.rising');
  if (trend < -0.01) return t('precipBarometer.trend.falling');
  return t('precipBarometer.trend.steady');
}
