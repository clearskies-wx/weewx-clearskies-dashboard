/**
 * format-number.ts — locale-aware number and unit formatting.
 *
 * Wraps Intl.NumberFormat so callers never hardcode a locale or fall back
 * to `.toFixed()` (which always produces `.` as the decimal separator —
 * wrong for de/fr/ru/pt and most other supported locales). See
 * rules/coding.md §6 for the full i18n rationale.
 */

/**
 * Locale-aware number formatting using Intl.NumberFormat.
 */
export function formatNumber(value: number, decimals: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// Units Intl.NumberFormat's style:'unit' supports natively across all 13
// supported locales. Passing any other unit identifier throws a RangeError.
const INTL_SUPPORTED_UNITS = new Set([
  'celsius',
  'fahrenheit',
  'kilometer-per-hour',
  'mile-per-hour',
  'meter-per-second',
  'millimeter',
  'inch',
  'degree',
  'percent',
]);

// Decimal places for units that require the custom-label fallback path.
const CUSTOM_UNIT_DECIMALS: Record<string, number> = {
  hectopascal: 1,
  knot: 0,
  'watt-per-square-meter': 0,
  'inch-of-mercury': 2,
};

// Verified per-locale labels for units Intl.NumberFormat doesn't support
// natively. Falls back to 'en' when a locale isn't present.
const CUSTOM_UNIT_LABELS: Record<string, Record<string, string>> = {
  hectopascal: {
    en: 'hPa', de: 'hPa', es: 'hPa', fr: 'hPa', it: 'hPa',
    ja: 'hPa', nl: 'hPa', 'pt-BR': 'hPa', 'pt-PT': 'hPa',
    ru: 'гПа', 'zh-CN': '百帕', 'zh-TW': '百帕', fil: 'hPa',
  },
  knot: {
    en: 'kn', de: 'kn', es: 'kn', fr: 'nd', it: 'kn',
    ja: 'ノット', nl: 'kn', 'pt-BR': 'nó', 'pt-PT': 'nó',
    ru: 'уз', 'zh-CN': '节', 'zh-TW': '節', fil: 'kn',
  },
  'watt-per-square-meter': {
    en: 'W/m²', de: 'W/m²', es: 'W/m²', fr: 'W/m²', it: 'W/m²',
    ja: 'W/m²', nl: 'W/m²', 'pt-BR': 'W/m²', 'pt-PT': 'W/m²',
    ru: 'Вт/м²', 'zh-CN': 'W/m²', 'zh-TW': 'W/m²', fil: 'W/m²',
  },
  'inch-of-mercury': {
    en: 'inHg', de: 'inHg', es: 'inHg', fr: 'inHg', it: 'inHg',
    ja: 'inHg', nl: 'inHg', 'pt-BR': 'inHg', 'pt-PT': 'inHg',
    ru: 'д.рт.ст.', 'zh-CN': '英寸汞柱', 'zh-TW': '英寸汞柱', fil: 'inHg',
  },
};

/**
 * Locale-aware unit formatting. Uses Intl.NumberFormat style:'unit' for
 * units Intl supports natively; falls back to formatNumber() + a
 * per-locale custom label for units Intl.NumberFormat doesn't recognize
 * (barometric pressure, wind speed in knots, solar radiation, etc.).
 */
export function formatUnit(value: number, unit: string, locale: string): string {
  if (INTL_SUPPORTED_UNITS.has(unit)) {
    return new Intl.NumberFormat(locale, { style: 'unit', unit }).format(value);
  }

  const decimals = CUSTOM_UNIT_DECIMALS[unit] ?? 0;
  const labelsForUnit = CUSTOM_UNIT_LABELS[unit];
  const label = labelsForUnit?.[locale] ?? labelsForUnit?.['en'] ?? unit;
  return `${formatNumber(value, decimals, locale)} ${label}`;
}
