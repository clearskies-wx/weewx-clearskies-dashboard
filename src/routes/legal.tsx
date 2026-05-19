// legal.tsx — Legal page (/legal)

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { useContent } from '../hooks/useWeatherData';

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

export function LegalPage() {
  const { data: content, loading } = useContent('legal');

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto" aria-live="polite">
      <h1 className="text-2xl font-bold text-foreground">Legal &amp; Privacy</h1>

      {/* Operator-authored legal content — shown if configured, else show default text */}
      {loading ? (
        <>
          <span className="sr-only" role="status">Loading legal content…</span>
          <TileSkeleton className="h-32" />
        </>
      ) : content ? (
        <Card>
          <CardHeader>
            <CardTitle>Legal &amp; Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {content.markdown}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Privacy Policy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This weather station collects meteorological data from local sensors and may use
                third-party services for forecasts, air quality, and earthquake data. No personal
                visitor data is collected beyond standard web server logs. Station operators should
                customize this section to reflect their specific data practices and applicable
                privacy regulations.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Attribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1.5">
                <li>Weather observations: Local station hardware (configured in About)</li>
                <li>Forecast data: National Weather Service (NWS)</li>
                <li>Air quality data: AirNow / EPA</li>
                <li>Earthquake data: USGS</li>
                <li>Astronomical data: Skyfield ephemeris calculations</li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Actual data sources depend on configured providers.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open-Source Licenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Clear Skies is free software licensed under the GNU General Public License v3.0.
                It is built with open-source technologies including React, Vite, Tailwind CSS,
                Recharts, and Lucide icons. Full license text and third-party attribution are
                available in the project repository.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default LegalPage;
