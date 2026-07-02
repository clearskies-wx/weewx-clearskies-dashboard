/**
 * format-date.ts — locale-and-timezone-aware date/time formatting.
 *
 * Wraps Intl.DateTimeFormat / Intl.RelativeTimeFormat. Every function
 * requires both `locale` and `tz` explicitly — there is no default for
 * either. This is intentional: it prevents the hardcoded-'en-US' bug
 * (rules/coding.md §6) and the browser-local-time bug (DASHBOARD-MANUAL
 * §3 — all timestamps must be formatted in station-local time via the
 * station's IANA timezone, never the visitor's browser timezone).
 *
 * Callers: pass `i18n.language` for locale and `stationTz` (from station
 * metadata) for tz. Never substitute a hardcoded locale or timezone.
 */

export function formatDayOfWeek(date: Date | number, locale: string, tz: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: tz }).format(date);
}

export function formatShortDayOfWeek(date: Date | number, locale: string, tz: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: tz }).format(date);
}

export function formatMonthDay(date: Date | number, locale: string, tz: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: tz }).format(date);
}

export function formatTime(date: Date | number, locale: string, tz: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(date);
}

export function formatFullDate(date: Date | number, locale: string, tz: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  }).format(date);
}

/**
 * Formats a millisecond offset (negative = past, positive = future)
 * as a locale-correct relative time string ("3 minutes ago", "vor 3
 * Minuten", "dans 3 minutes"), auto-selecting the coarsest unit that
 * keeps the magnitude readable.
 */
export function formatRelativeTime(diffMs: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffSeconds = diffMs / 1000;
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) {
    return rtf.format(Math.round(diffSeconds), 'second');
  }
  const diffMinutes = diffSeconds / 60;
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(Math.round(diffMinutes), 'minute');
  }
  const diffHours = diffMinutes / 60;
  if (Math.abs(diffHours) < 24) {
    return rtf.format(Math.round(diffHours), 'hour');
  }
  const diffDays = diffHours / 24;
  return rtf.format(Math.round(diffDays), 'day');
}
