// about.tsx — About page (/about)
// Station info card from mockStation.

import { useMockData } from '../mock/index';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';

export function AboutPage() {
  const { station } = useMockData();

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">About</h1>

      <Card>
        <CardHeader>
          <CardTitle>{station.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Location</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {station.latitude}°N, {Math.abs(station.longitude)}°W
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Altitude</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {station.altitude} ft
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Hardware</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {station.hardware ?? 'Not specified'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Time Zone</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {station.timezone}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Unit System</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {station.unitSystem}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Station ID</dt>
              <dd className="mt-0.5 font-medium text-foreground font-mono text-xs">
                {station.stationId}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            This station operator-authored description is a placeholder. Configure
            your station&apos;s About content via the Clear Skies configuration UI.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
