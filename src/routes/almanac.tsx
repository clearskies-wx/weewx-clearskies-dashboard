// almanac.tsx — Almanac page (/almanac)

import { useMockData } from '../mock/index';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';

// Format UTC ISO time to local time display: "5:55 AM"
function formatLocalTime(isoString: string | null, tz: string): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(new Date(isoString));
}

// Format daylightMinutes to "Xh Ym"
function formatDaylight(minutes: number | null): string {
  if (minutes === null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

// Format ISO datetime to local date: "May 25, 2026"
function formatDate(isoString: string | null): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(isoString));
}

// Capitalize hyphenated phase name: "waxing-gibbous" → "Waxing Gibbous"
function formatPhaseName(name: string | null): string {
  if (!name) return '—';
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Unicode moon phase emoji keyed by phase name.
// aria-hidden on usage site since the phase name text conveys the same info.
const MOON_PHASE_EMOJI: Record<string, string> = {
  'new': '🌑',
  'waxing-crescent': '🌒',
  'first-quarter': '🌓',
  'waxing-gibbous': '🌔',
  'full': '🌕',
  'waning-gibbous': '🌖',
  'last-quarter': '🌗',
  'waning-crescent': '🌘',
};

export function AlmanacPage() {
  const { almanac, station } = useMockData();
  const tz = station.timezone;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Almanac</h1>

      {/* Sun card */}
      <Card>
        <CardHeader>
          <CardTitle>Sun</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Sunrise</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatLocalTime(almanac.sun.rise, tz)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sunset</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatLocalTime(almanac.sun.set, tz)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Civil Dawn</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatLocalTime(almanac.sun.civilTwilightDawn, tz)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Civil Dusk</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatLocalTime(almanac.sun.civilTwilightDusk, tz)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total Daylight</dt>
              <dd className="font-medium text-foreground mt-0.5" style={{ fontFeatureSettings: '"tnum"' }}>
                {formatDaylight(almanac.sun.daylightMinutes)}
                {almanac.sun.daylightDeltaVsYesterdayMinutes !== null && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({almanac.sun.daylightDeltaVsYesterdayMinutes > 0 ? '+' : ''}
                    {almanac.sun.daylightDeltaVsYesterdayMinutes}m vs yesterday)
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Solar Noon</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatLocalTime(almanac.sun.transit, tz)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Next Solstice</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatDate(almanac.sun.nextSolstice)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Next Equinox</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatDate(almanac.sun.nextEquinox)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Moon card */}
      <Card>
        <CardHeader>
          <CardTitle>Moon</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Phase</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {almanac.moon.phaseName && (
                  <span aria-hidden="true" className="mr-1.5">
                    {MOON_PHASE_EMOJI[almanac.moon.phaseName]}
                  </span>
                )}
                {formatPhaseName(almanac.moon.phaseName)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Illumination</dt>
              <dd className="font-medium text-foreground mt-0.5" style={{ fontFeatureSettings: '"tnum"' }}>
                {almanac.moon.illuminationPercent}%
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Moonrise</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatLocalTime(almanac.moon.rise, tz)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Moonset</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatLocalTime(almanac.moon.set, tz)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Next Full Moon</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatDate(almanac.moon.nextFullMoon)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Next New Moon</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatDate(almanac.moon.nextNewMoon)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Positional Data card — Skyfield-computed; null in mock phase */}
      <Card>
        <CardHeader>
          <CardTitle>Positional Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Positional data requires Skyfield computation on the server.
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Sun Azimuth</dt>
              <dd className="font-medium text-muted-foreground mt-0.5">
                {almanac.sun.azimuth !== null ? `${almanac.sun.azimuth}°` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sun Altitude</dt>
              <dd className="font-medium text-muted-foreground mt-0.5">
                {almanac.sun.altitude !== null ? `${almanac.sun.altitude}°` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Moon Azimuth</dt>
              <dd className="font-medium text-muted-foreground mt-0.5">
                {almanac.moon.azimuth !== null ? `${almanac.moon.azimuth}°` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Moon Altitude</dt>
              <dd className="font-medium text-muted-foreground mt-0.5">
                {almanac.moon.altitude !== null ? `${almanac.moon.altitude}°` : '—'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

export default AlmanacPage;
