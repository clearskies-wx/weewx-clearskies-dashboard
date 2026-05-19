import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudLightning,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { AlertBanner } from '../components/shared/alert-banner';
import {
  Card,
  CardHeader,
  CardContent,
} from '../components/ui/card';
import { useForecast, useAlerts, useStation } from '../hooks/useWeatherData';

function weatherCodeIcon(code: string | null): ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }> {
  if (code === null) return Cloud;
  const n = parseInt(code, 10);
  if (n === 0 || n === 1) return Sun;
  if (n === 2) return CloudSun;
  if (n === 3) return Cloud;
  if (n === 45 || n === 48) return CloudFog;
  if (n >= 51 && n <= 55) return CloudDrizzle;
  if ((n >= 61 && n <= 65) || (n >= 80 && n <= 82)) return CloudRain;
  if (n >= 95) return CloudLightning;
  return Cloud;
}

function formatHour(isoString: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true,
    timeZone,
  }).format(new Date(isoString));
}

function formatDayName(isoDate: string, index: number): string {
  if (index === 0) return 'Today';
  const d = new Date(isoDate + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(d);
}

function formatRelativeTime(isoString: string): string {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diffMs = new Date(isoString).getTime() - Date.now();
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
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        Retry
      </button>
    </div>
  );
}

export function ForecastPage() {
  const { data: forecast, loading: fcLoading, error: fcError, refetch: fcRefetch } = useForecast();
  const { data: station } = useStation();
  const { data: alerts, loading: alertLoading } = useAlerts();
  const tz = station?.timezone ?? 'UTC';

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto" aria-live="polite">
      <h1 className="sr-only">Forecast</h1>

      {!alertLoading && alerts && <AlertBanner alerts={alerts} />}

      {/* Hourly Forecast Strip */}
      <section aria-labelledby="hourly-heading" aria-busy={fcLoading}>
        <h2 id="hourly-heading" className="text-lg font-semibold text-foreground mb-3">Next 12 Hours</h2>
        {fcLoading ? (
          <>
            <span className="sr-only" role="status">Loading hourly forecast…</span>
            <TileSkeleton className="h-28" />
          </>
        ) : fcError ? (
          <TileError message="Unable to load forecast" onRetry={fcRefetch} />
        ) : forecast && forecast.hourly.length > 0 ? (
          <div
            className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
            tabIndex={0}
            aria-label="Hourly forecast — scroll to see more"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            <div
              role="list"
              aria-label="Hourly forecast"
              className="flex gap-2 pb-2 min-w-max"
            >
              {forecast.hourly.map((hour) => {
                const Icon = weatherCodeIcon(hour.weatherCode);
                const hourLabel = formatHour(hour.validTime, tz);
                return (
                  <div
                    key={hour.validTime}
                    role="listitem"
                    className="flex flex-col items-center gap-1.5 min-w-[72px] rounded-lg border border-border bg-card px-3 py-3 text-center shrink-0"
                    style={{ scrollSnapAlign: 'start' }}
                  >
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{hourLabel}</span>
                    <Icon
                      aria-hidden="true"
                      className="h-5 w-5 text-muted-foreground"
                    />
                    <span
                      className="text-sm font-semibold text-foreground font-[tabular-nums]"
                    >
                      {hour.outTemp}°
                    </span>
                    {hour.precipProbability !== null && hour.precipProbability > 0 && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-[tabular-nums]">
                        {hour.precipProbability}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No hourly forecast data available.</p>
        )}
      </section>

      {/* 7-Day Daily Forecast */}
      <section aria-labelledby="daily-heading" aria-busy={fcLoading}>
        <h2 id="daily-heading" className="text-lg font-semibold text-foreground mb-3">7-Day Forecast</h2>
        {fcLoading ? (
          <>
            <span className="sr-only" role="status">Loading daily forecast…</span>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <TileSkeleton key={i} className="h-36" />
              ))}
            </div>
          </>
        ) : fcError ? null : forecast && forecast.daily.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {forecast.daily.map((day, index) => {
              const Icon = weatherCodeIcon(day.weatherCode);
              const dayName = formatDayName(day.validDate, index);
              return (
                <article
                  key={day.validDate}
                  aria-label={`${dayName} forecast`}
                >
                  <Card>
                    <CardHeader>
                      <h3 className="font-heading text-base leading-snug font-medium">{dayName}</h3>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Icon aria-hidden="true" className="h-5 w-5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground leading-tight">{day.weatherText}</span>
                      </div>
                      <div className="flex gap-1 font-[tabular-nums]">
                        <span className="font-semibold text-foreground">{day.tempMax}°</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-muted-foreground">{day.tempMin}°</span>
                      </div>
                      {day.precipProbabilityMax !== null && (
                        <p className="text-blue-600 dark:text-blue-400 font-[tabular-nums]">
                          {day.precipProbabilityMax}% precip
                        </p>
                      )}
                      {day.windSpeedMax !== null && (
                        <p className="text-muted-foreground font-[tabular-nums]">
                          Wind up to {day.windSpeedMax} mph
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No daily forecast data available.</p>
        )}
      </section>

      {/* Forecast Freshness Indicator */}
      {forecast && (
        <p className="text-xs text-muted-foreground text-right">
          Updated {formatRelativeTime(forecast.generatedAt)}
        </p>
      )}
    </div>
  );
}

export default ForecastPage;
