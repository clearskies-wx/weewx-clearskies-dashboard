/**
 * time.ts — shared time-formatting utilities for the Clear Skies dashboard.
 *
 * Extracted from src/routes/now.tsx and src/routes/almanac.tsx so components
 * can import directly without routing through a page module.
 *
 * ADR-020: UTC on wire; station-local display via IANA TZ in StationMetadata.
 * ADR-021: locale from i18n.language (Intl.DateTimeFormat BCP-47 tag).
 */

/**
 * Format a UTC ISO-8601 string for display in the station's local time zone.
 *
 * Returns "—" for null / falsy input so callers do not need a separate null guard.
 *
 * @param iso    UTC ISO-8601 string (e.g. "2026-06-01T12:34:56Z")
 * @param tz     IANA time zone identifier (e.g. "America/Chicago")
 * @param locale BCP-47 locale tag (e.g. "en-US", "de-DE")
 * @returns      Formatted time string, e.g. "7:34 AM CDT"
 */
export function formatLocalTime(
  iso: string | null | undefined,
  tz: string,
  locale: string,
): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
    timeZoneName: 'short',
  }).format(new Date(iso));
}
