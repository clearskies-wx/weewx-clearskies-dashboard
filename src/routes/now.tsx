// now.tsx — Now page (home route /)
// Shows current conditions: temperature, feels-like, today hi/lo, alert banner.

import { useMockData } from '../mock/index';
import { TriangleAlert } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';

export function NowPage() {
  const { observation, aqi, todayStats, alerts, units } = useMockData();

  const hasAlerts = alerts.length > 0;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Now</h1>

      {/* Alert banner — role=alert + aria-live for assistive tech */}
      {hasAlerts && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {/* Icon paired with text — color is not the only signal */}
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
          />
          <div>
            <p className="font-semibold leading-snug">
              {alerts[0].event}
            </p>
            <p className="mt-0.5 text-sm leading-snug">
              {alerts[0].headline}
            </p>
          </div>
        </div>
      )}

      {/* Primary temperature display */}
      <Card>
        <CardHeader>
          <CardTitle>Current Conditions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Large temperature — tabular nums so digits don't shift width */}
          <div
            className="text-7xl font-bold text-foreground leading-none"
            style={{ fontFeatureSettings: '"tnum"' }}
            aria-label={`Current temperature: ${observation.outTemp} degrees ${units.outTemp}`}
          >
            {observation.outTemp}
            <span className="text-4xl font-normal text-muted-foreground ml-1">
              {units.outTemp}
            </span>
          </div>

          <p className="text-lg text-muted-foreground">Partly Cloudy</p>

          <div className="flex gap-6 text-sm text-muted-foreground">
            <span>
              Feels like{' '}
              <span
                className="font-medium text-foreground"
                style={{ fontFeatureSettings: '"tnum"' }}
              >
                {observation.appTemp}°
              </span>
            </span>
            {observation.outHumidity !== null && (
              <span>
                Humidity{' '}
                <span className="font-medium text-foreground">
                  {observation.outHumidity}%
                </span>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Today stats card */}
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Highlights</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4 text-center">
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                High
              </dt>
              <dd
                className="mt-1 text-2xl font-semibold text-foreground"
                style={{ fontFeatureSettings: '"tnum"' }}
              >
                {todayStats.high}°
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                Low
              </dt>
              <dd
                className="mt-1 text-2xl font-semibold text-foreground"
                style={{ fontFeatureSettings: '"tnum"' }}
              >
                {todayStats.low}°
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                Peak Gust
              </dt>
              <dd
                className="mt-1 text-2xl font-semibold text-foreground"
                style={{ fontFeatureSettings: '"tnum"' }}
              >
                {todayStats.peakGust}{' '}
                <span className="text-base font-normal">{units.windGust}</span>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* AQI card */}
      <Card>
        <CardHeader>
          <CardTitle>Air Quality</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <span
            className="text-4xl font-bold text-foreground"
            style={{ fontFeatureSettings: '"tnum"' }}
            aria-label={`AQI: ${aqi.aqi}`}
          >
            {aqi.aqi}
          </span>
          <div>
            <p className="font-semibold text-foreground">{aqi.aqiCategory}</p>
            <p className="text-sm text-muted-foreground">
              Main pollutant: {aqi.aqiMainPollutant}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default NowPage;
