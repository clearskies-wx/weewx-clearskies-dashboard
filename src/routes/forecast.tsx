import { useMockData } from '../mock/index';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';

function formatHour(isoString: string, timeZone: string): string {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true,
    timeZone,
  }).format(d);
}

function formatDayName(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(d);
}

export function ForecastPage() {
  const { forecast, station } = useMockData();

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Forecast</h1>

      {/* 7-day daily strip */}
      <Card>
        <CardHeader>
          <CardTitle>7-Day Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex gap-2 overflow-x-auto pb-2" tabIndex={0}
            role="list"
            aria-label="7-day daily forecast"
          >
            {forecast.daily.map((day) => (
              <div
                key={day.validDate}
                role="listitem"
                className="flex flex-col items-center gap-1 min-w-[80px] rounded-lg border border-border bg-card px-3 py-3 text-center"
              >
                <span className="text-sm font-semibold text-foreground">
                  {formatDayName(day.validDate)}
                </span>
                <span className="text-xs text-muted-foreground leading-tight min-h-[2.5rem] flex items-center">
                  {day.weatherText}
                </span>
                <div
                  className="flex gap-1 text-sm font-medium"
                  style={{ fontFeatureSettings: '"tnum"' }}
                >
                  <span className="text-foreground">{day.tempMax}°</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">{day.tempMin}°</span>
                </div>
                {day.precipProbabilityMax !== null && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    {day.precipProbabilityMax}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 12-hour hourly strip */}
      <Card>
        <CardHeader>
          <CardTitle>Next 12 Hours</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex gap-2 overflow-x-auto pb-2" tabIndex={0}
            role="list"
            aria-label="Hourly forecast for the next 12 hours"
          >
            {forecast.hourly.map((hour) => (
              <div
                key={hour.validTime}
                role="listitem"
                className="flex flex-col items-center gap-1 min-w-[64px] rounded-lg border border-border bg-card px-2 py-3 text-center"
              >
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatHour(hour.validTime, station.timezone)}
                </span>
                <span
                  className="text-sm font-semibold text-foreground"
                  style={{ fontFeatureSettings: '"tnum"' }}
                >
                  {hour.outTemp}°
                </span>
                {hour.precipProbability !== null && hour.precipProbability > 0 && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    {hour.precipProbability}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
