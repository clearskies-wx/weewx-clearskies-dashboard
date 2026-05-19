import { useMockData } from '../mock/index';
import {
  Card,
  CardContent,
} from '../components/ui/card';

function formatTime(isoString: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(new Date(isoString));
}

export function EarthquakesPage() {
  const { earthquakes, station } = useMockData();

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Earthquakes</h1>

      {earthquakes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No recent earthquakes in the configured radius.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4" role="list" aria-label="Recent earthquakes">
          {earthquakes.map((quake) => (
            <li key={quake.id}>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-4">
                    <div
                      className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-muted"
                      aria-label={`Magnitude ${quake.magnitude}`}
                    >
                      <span className="text-xs text-muted-foreground leading-none">M</span>
                      <span
                        className="text-2xl font-bold text-foreground leading-none mt-0.5"
                        style={{ fontFeatureSettings: '"tnum"' }}
                      >
                        {quake.magnitude}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 min-w-0">
                      <p className="font-semibold text-foreground leading-snug">
                        {quake.place ?? 'Unknown location'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatTime(quake.time, station.timezone)}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        {quake.depth !== null && (
                          <span>Depth: {quake.depth} km</span>
                        )}
                        <span>Source: {quake.source.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EarthquakesPage;
