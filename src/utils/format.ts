/**
 * formatValue — numeric display formatter for meteorological values.
 *
 * Applies standard meteorological precision conventions. Does NOT append
 * unit labels — that responsibility belongs to the caller (or the
 * translation layer).
 *
 * Returns '--' for null inputs so components never need to guard separately.
 *
 * Pass `locale` (i18n.language) for locale-aware decimal separators — see
 * rules/coding.md §6. Omitting `locale` preserves the legacy `.toFixed()`
 * behavior for callers not yet migrated to pass a locale (Phase 2).
 */

import { formatNumber } from './format-number';

const DECIMALS: Record<string, number> = {
  temperature:        1,
  barometer:          2,
  wind:               0,
  humidity:           0,
  rain:               2,
  rainRate:           2,
  uv:                 0,
  solar:              0,
  earthquakeMag:      1,
  earthquakeDepth:    1,
  earthquakeDistance: 0,
  percent:            0,
  degrees:            0,
  default:            1,
};

export function formatValue(value: number | null | undefined, type: string, locale?: string): string {
  if (value == null || typeof value !== 'number' || !isFinite(value)) return '--';
  const decimals = DECIMALS[type] ?? DECIMALS['default'];
  if (locale) {
    return formatNumber(value, decimals, locale);
  }
  return value.toFixed(decimals);
}
