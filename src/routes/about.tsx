// about.tsx — About page (/about)

import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { useStation, useContent } from '../hooks/useWeatherData';

// Format ISO string as a long date: "January 1, 2020"
function formatLongDate(isoString: string | null, locale: string): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(isoString));
}

// Format ISO string as short date+time in local TZ: "May 18, 2026 10:30 AM"
function formatAbsoluteTime(isoString: string, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
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
// Uses Intl.RelativeTimeFormat when available for locale-appropriate output.
function relativeTime(isoString: string, locale: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  // Guard: new Date() returns NaN for invalid/missing strings.
  // Intl.RelativeTimeFormat.format() throws on NaN — return a safe fallback.
  if (!Number.isFinite(diffMs)) return '—';
  const diffSec = Math.floor(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diffSec < 60) return rtf.format(-diffSec, 'second');
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return rtf.format(-diffHr, 'hour');
  const diffDay = Math.floor(diffHr / 24);
  return rtf.format(-diffDay, 'day');
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
  const { t, i18n } = useTranslation('about');
  const { data: station, loading: stationLoading } = useStation();
  const { data: content, loading: contentLoading } = useContent('about');

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>

      {/* Station metadata */}
      <Card aria-busy={stationLoading}>
        <CardHeader>
          <CardTitle as="h2">{station?.name ?? t('station.defaultName')}</CardTitle>
        </CardHeader>
        <CardContent>
          {stationLoading ? (
            <>
              <span className="sr-only" role="status">{t('station.loadingAria')}</span>
              <TileSkeleton className="h-32" />
            </>
          ) : station ? (
            <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('station.location')}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {station.latitude}°N, {Math.abs(station.longitude)}°W
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('station.altitude')}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {station.altitude} ft
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('station.hardware')}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {station.hardware ?? t('station.hardwareDefault')}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('station.timezone')}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {station.timezone}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('station.unitSystem')}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {station.unitSystem}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('station.stationId')}</dt>
                <dd className="mt-0.5 font-medium text-foreground font-mono text-xs">
                  {station.stationId}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('station.recordingSince')}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {formatLongDate(station.firstRecord, i18n.language)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('station.lastData')}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {station.lastRecord
                    ? `${relativeTime(station.lastRecord, i18n.language)} · ${formatAbsoluteTime(station.lastRecord, station.timezone, i18n.language)}`
                    : '—'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t('station.unavailable')}</p>
          )}
        </CardContent>
      </Card>

      {/* Operator-authored content section */}
      <Card aria-busy={contentLoading}>
        <CardHeader>
          <CardTitle as="h2">{t('aboutStation.cardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {contentLoading ? (
            <>
              <span className="sr-only" role="status">{t('aboutStation.loadingAria')}</span>
              <TileSkeleton className="h-20" />
            </>
          ) : content ? (
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {content.markdown}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('aboutStation.placeholder')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Software info */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('software.cardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t('software.weatherSoftware')}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{t('software.weatherSoftwareValue')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('software.dashboard')}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{t('software.dashboardValue')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('software.dashboardEngine')}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{t('software.dashboardEngineValue')}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Station photo placeholder */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('photo.cardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Decorative placeholder — no img element, so no alt needed here.
              When operators upload a real photo the upload UI will require alt text per §5.5. */}
          <div className="border-dashed border-2 border-border rounded-lg h-48 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center px-4">
              {t('photo.placeholder')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AboutPage;
