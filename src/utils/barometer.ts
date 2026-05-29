/**
 * barometer.ts — Barometer trend utilities.
 *
 * Extracted from now.tsx for shared use between the Station Observations tile
 * and the PrecipitationBarometerCard component.
 *
 * Per ADR-042, the dashboard has zero unit knowledge.  The BFF computes the
 * trend direction and emits it as a string; helpers here map that string to
 * display symbols and labels.  The old ±0.01 numeric threshold has been
 * deleted — it was a unit-knowledge leak (inHg-specific).
 */
import type { TFunction } from 'i18next';

/** The BFF-emitted direction type — matches CurrentResponse.barometerTrendDirection. */
export type BarometerTrendDirection = 'rising' | 'falling' | 'steady' | null;

/**
 * Returns a Unicode arrow character representing the barometer trend direction.
 * Mapping: "rising" → ↑, "falling" → ↓, "steady" / null → →
 */
export function barometerTrendArrow(direction: BarometerTrendDirection): string {
  if (direction === 'rising') return '↑';
  if (direction === 'falling') return '↓';
  return '→';
}

/**
 * Returns a human-readable trend label via i18n.
 * The `t` function must be from the 'now' namespace.
 * Reads keys: precipBarometer.trend.rising / .falling / .steady
 */
export function barometerTrendLabel(direction: BarometerTrendDirection, t: TFunction): string {
  if (direction === 'rising') return t('precipBarometer.trend.rising');
  if (direction === 'falling') return t('precipBarometer.trend.falling');
  return t('precipBarometer.trend.steady');
}
