import { useTranslation } from 'react-i18next';
import { WeatherIcon } from '../components/weather-icon';
import { AlertBanner } from '../components/shared/alert-banner';
import {
  Card,
  CardHeader,
  CardContent,
} from '../components/ui/card';
import { useForecast, useAlerts, useStation } from '../hooks/useWeatherData';
import { formatValue } from '../utils/format';

/** Convert wind direction degrees to an 16-point cardinal label. */
function windDirLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

/**
 * PrecipBar — horizontal progress bar for precipitation probability.
 *
 * Accessibility: role="meter" with aria-valuenow/min/max conveys the
 * proportional value to screen readers. The numeric percentage is always
 * shown alongside so color is never the sole signal (WCAG 1.4.1).
 */
function PrecipBar({ pct, ariaLabel }: { pct: number; ariaLabel: string }) {
  const clampedPct = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      {/* meter track */}
      <div
        role="meter"
        aria-valuenow={clampedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
        className="relative h-1.5 flex-1 rounded-full bg-blue-200 dark:bg-blue-900 overflow-hidden"
      >
        {/* filled portion */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 rounded-full bg-blue-500 dark:bg-blue-400"
          style={{ width: `${clampedPct}%` }}
        />
      </div>
      {/* numeric label — always visible; color is not the only signal */}
      <span
        aria-hidden="true"
        className="text-xs tabular-nums text-blue-600 dark:text-blue-400 shrink-0"
      >
        {clampedPct}%
      </span>
    </div>
  );
}

/**
 * WindArrow — small SVG arrow that rotates to indicate the direction the wind
 * is blowing FROM (meteorological convention).
 *
 * Rotation: windDir=0 means FROM the north (arrow tip points up/north).
 * Applies rotate(windDir) around the SVG centre — the same convention used
 * by WindCompass in now.tsx.
 *
 * The element is aria-hidden; the caller supplies an aria-label on the
 * surrounding context element.
 */
function WindArrow({ deg, className = '' }: { deg: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className={className}
      style={{ transform: `rotate(${deg}deg)`, display: 'inline-block' }}
    >
      {/* Arrow pointing upward (N) — rotated by deg to show FROM direction */}
      <polygon points="7,1 9,9 7,7 5,9" fill="currentColor" />
      <line x1="7" y1="7" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}


function formatHour(isoString: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    hour12: true,
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(isoString));
}

function formatDayName(isoDate: string, locale: string): string {
  const d = new Date(isoDate + 'T12:00:00Z');
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(d);
}

function formatRelativeTime(isoString: string, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffMs = new Date(isoString).getTime() - Date.now();
  // Guard: new Date() returns NaN for invalid/missing strings.
  // Intl.RelativeTimeFormat.format() throws on NaN — return a safe fallback.
  if (!Number.isFinite(diffMs)) return '—';
  const diffMin = Math.round(diffMs / 60000);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  return rtf.format(diffDay, 'day');
}

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t: tc } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        {tc('retry')}
      </button>
    </div>
  );
}

export function ForecastPage() {
  const { t, i18n } = useTranslation('forecast');
  const { data: forecast, loading: fcLoading, error: fcError, refetch: fcRefetch } = useForecast();
  const { data: station } = useStation();
  const { data: alerts, loading: alertLoading } = useAlerts();
  const tz = station?.timezone ?? 'UTC';
  const locale = i18n.language;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <h1 className="sr-only">{t('title')}</h1>

      {!alertLoading && alerts && <AlertBanner alerts={alerts} />}

      {/* Hourly Forecast Strip */}
      <section aria-labelledby="hourly-heading" aria-busy={fcLoading}>
        <h2 id="hourly-heading" className="text-lg font-semibold text-foreground mb-3">{t('next12Hours')}</h2>
        {fcLoading ? (
          <>
            <span className="sr-only" role="status">{t('loadingHourly')}</span>
            <TileSkeleton className="h-28" />
          </>
        ) : fcError ? (
          <TileError message={t('unableToLoad')} onRetry={fcRefetch} />
        ) : forecast && forecast.hourly.length > 0 ? (
          <div className="relative">
            <div
              className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
              tabIndex={0}
              aria-label={t('ariaHourlyScroll')}
              style={{ scrollSnapType: 'x mandatory' }}
            >
            <div
              role="list"
              aria-label={t('ariaHourlyList')}
              className="flex gap-2 pb-2 min-w-max"
            >
              {forecast.hourly.map((hour) => {
                const hourLabel = formatHour(hour.validTime, tz, locale);
                const hasWindDir = hour.windDir !== null;
                const windDirDeg = hour.windDir ?? 0;
                const windLabel = hasWindDir
                  ? t('ariaWindDir', { direction: windDirLabel(windDirDeg).toLowerCase() })
                  : undefined;
                return (
                  <div
                    key={hour.validTime}
                    role="listitem"
                    className="flex flex-col items-center gap-1.5 min-w-[72px] rounded-lg border border-border bg-card px-3 py-3 text-center shrink-0"
                    style={{ scrollSnapAlign: 'start' }}
                  >
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{hourLabel}</span>
                    <WeatherIcon
                      code={hour.weatherCode}
                      size={24}
                      className="text-muted-foreground"
                    />
                    <span
                      className="text-sm font-semibold text-foreground font-[tabular-nums]"
                    >
                      {formatValue(hour.outTemp, 'temperature')}°
                    </span>
                    {hour.precipProbability !== null && hour.precipProbability > 0 && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-[tabular-nums]">
                        {formatValue(hour.precipProbability, 'percent')}%
                      </span>
                    )}
                    {hasWindDir && hour.windSpeed !== null && (
                      <span
                        className="flex items-center gap-0.5 text-xs text-muted-foreground font-[tabular-nums]"
                        aria-label={windLabel}
                      >
                        <WindArrow
                          deg={windDirDeg}
                          className="text-muted-foreground"
                        />
                        {formatValue(hour.windSpeed, 'wind')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
            {/* Scroll fade indicator — always visible on mobile; 12 items always overflow narrow viewports */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent"
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t('noHourlyData')}</p>
        )}
      </section>

      {/* 7-Day Daily Forecast */}
      <section aria-labelledby="daily-heading" aria-busy={fcLoading}>
        <h2 id="daily-heading" className="text-lg font-semibold text-foreground mb-3">{t('sevenDayForecast')}</h2>
        {fcLoading ? (
          <>
            <span className="sr-only" role="status">{t('loadingDaily')}</span>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <TileSkeleton key={i} className="h-36" />
              ))}
            </div>
          </>
        ) : fcError ? null : forecast && forecast.daily.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {forecast.daily.map((day, index) => {
              const dayName = index === 0 ? t('today') : formatDayName(day.validDate, locale);
              const hasPrecip = day.precipProbabilityMax !== null && day.precipProbabilityMax > 0;
              return (
                <article
                  key={day.validDate}
                  aria-label={t('ariaDayForecast', { day: dayName })}
                >
                  <Card>
                    <CardHeader>
                      <h3 className="font-heading text-base leading-snug font-medium">{dayName}</h3>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      {/* Weather icon — dominant visual element */}
                      <div className="flex justify-center py-1">
                        <WeatherIcon
                          code={day.weatherCode}
                          size="48px"
                          className="text-foreground"
                        />
                      </div>

                      {/* Temperature row — high / low */}
                      <div className="flex justify-center gap-1 font-[tabular-nums] text-base">
                        <span className="font-semibold text-foreground">{formatValue(day.tempMax, 'temperature')}°</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-muted-foreground">{formatValue(day.tempMin, 'temperature')}°</span>
                      </div>

                      {/* Weather description */}
                      {day.weatherText && (
                        <p className="text-xs text-muted-foreground text-center leading-tight">{day.weatherText}</p>
                      )}

                      {/* Precipitation probability bar — only when > 0 */}
                      {hasPrecip && (
                        <PrecipBar
                          pct={day.precipProbabilityMax!}
                          ariaLabel={t('ariaPrecipBar', { pct: day.precipProbabilityMax! })}
                        />
                      )}

                      {/* Wind speed — no windDir on DailyForecastPoint, show speed only */}
                      {day.windSpeedMax !== null && (
                        <p className="text-xs text-muted-foreground font-[tabular-nums]">
                          {t('windUpTo', { speed: formatValue(day.windSpeedMax, 'wind') })}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t('noDailyData')}</p>
        )}
      </section>

      {/* Forecast Freshness Indicator */}
      {forecast && (
        <p className="text-xs text-muted-foreground text-right">
          {t('updated', { time: formatRelativeTime(forecast.generatedAt, locale) })}
        </p>
      )}
    </div>
  );
}

export default ForecastPage;
