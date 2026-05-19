// about.tsx — About page (/about)

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { useStation, useContent } from '../hooks/useWeatherData';

// Format ISO string as a long date: "January 1, 2020"
function formatLongDate(isoString: string | null): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(isoString));
}

// Format ISO string as short date+time in local TZ: "May 18, 2026 10:30 AM"
function formatAbsoluteTime(isoString: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(new Date(isoString));
}

// Produce a human-readable relative string: "2 hours ago", "5 minutes ago", etc.
function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} second${diffSec !== 1 ? 's' : ''} ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
}

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

export function AboutPage() {
  const { data: station, loading: stationLoading } = useStation();
  const { data: content, loading: contentLoading } = useContent('about');

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto" aria-live="polite">
      <h1 className="text-2xl font-bold text-foreground">About</h1>

      {/* Station metadata */}
      <Card aria-busy={stationLoading}>
        <CardHeader>
          <CardTitle>{station?.name ?? 'Weather Station'}</CardTitle>
        </CardHeader>
        <CardContent>
          {stationLoading ? (
            <>
              <span className="sr-only" role="status">Loading station information…</span>
              <TileSkeleton className="h-32" />
            </>
          ) : station ? (
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
              <div>
                <dt className="text-muted-foreground">Recording Since</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {formatLongDate(station.firstRecord)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last Data Received</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {station.lastRecord
                    ? `${relativeTime(station.lastRecord)} · ${formatAbsoluteTime(station.lastRecord, station.timezone)}`
                    : '—'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Station information unavailable.</p>
          )}
        </CardContent>
      </Card>

      {/* Operator-authored content section */}
      <Card aria-busy={contentLoading}>
        <CardHeader>
          <CardTitle>About This Station</CardTitle>
        </CardHeader>
        <CardContent>
          {contentLoading ? (
            <>
              <span className="sr-only" role="status">Loading about content…</span>
              <TileSkeleton className="h-20" />
            </>
          ) : content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {content.markdown}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              This station operator-authored description is a placeholder. Configure
              your station&apos;s About content via the Clear Skies configuration UI.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Software info */}
      <Card>
        <CardHeader>
          <CardTitle>Software</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Weather Software</dt>
              <dd className="mt-0.5 font-medium text-foreground">weewx 5.x</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dashboard</dt>
              <dd className="mt-0.5 font-medium text-foreground">Clear Skies v0.1.0-dev</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dashboard Engine</dt>
              <dd className="mt-0.5 font-medium text-foreground">React + Vite</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Station photo placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Station Photo</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Decorative placeholder — no img element, so no alt needed here.
              When operators upload a real photo the upload UI will require alt text per §5.5. */}
          <div className="border-dashed border-2 border-border rounded-lg h-48 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center px-4">
              Upload a station photo via the Clear Skies configuration UI.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AboutPage;
