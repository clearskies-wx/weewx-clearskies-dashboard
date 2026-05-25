/**
 * formatValue — numeric display formatter for meteorological values.
 *
 * Applies standard meteorological precision conventions. Does NOT append
 * unit labels — that responsibility belongs to the caller (or the
 * translation layer).
 *
 * Returns '--' for null inputs so components never need to guard separately.
 */

const DECIMALS: Record<string, number> = {
  temperature:     1,
  barometer:       2,
  wind:            0,
  humidity:        0,
  rain:            2,
  rainRate:        2,
  uv:              0,
  solar:           0,
  earthquakeMag:   1,
  earthquakeDepth: 1,
  percent:         0,
  degrees:         0,
  default:         1,
};

export function formatValue(value: number | null | undefined, type: string): string {
  if (value == null || typeof value !== 'number' || !isFinite(value)) return '--';
  const decimals = DECIMALS[type] ?? DECIMALS['default'];
  return value.toFixed(decimals);
}
