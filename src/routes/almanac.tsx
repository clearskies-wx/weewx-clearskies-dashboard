// almanac.tsx — Almanac page (/almanac)

import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { useAlmanac, useStation } from '../hooks/useWeatherData';
import { formatValue } from '../utils/format';

// Format UTC ISO time to local time display: "5:55 AM"
function formatLocalTime(isoString: string | null, tz: string, locale: string): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat(locale, {
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
function formatDate(isoString: string | null, locale: string): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat(locale, {
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

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        {t('retry')}
      </button>
    </div>
  );
}

export function AlmanacPage() {
  const { t, i18n } = useTranslation('almanac');
  const locale = i18n.language;

  const { data: almanac, loading, error, refetch } = useAlmanac();
  const { data: station } = useStation();
  const tz = station?.timezone ?? 'UTC';

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>

      {loading && (
        <>
          <span className="sr-only" role="status">{t('loading')}</span>
          <TileSkeleton className="h-48" />
          <TileSkeleton className="h-48" />
        </>
      )}

      {error && <TileError message={t('error')} onRetry={refetch} />}

      {!loading && !error && almanac && (
        <>
          {/* Sun card */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('sun.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('sun.sunrise')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatLocalTime(almanac.sun.rise, tz, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('sun.sunset')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatLocalTime(almanac.sun.set, tz, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('sun.civilDawn')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatLocalTime(almanac.sun.civilTwilightDawn, tz, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('sun.civilDusk')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatLocalTime(almanac.sun.civilTwilightDusk, tz, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('sun.totalDaylight')}</dt>
                  <dd className="font-medium text-foreground mt-0.5" style={{ fontFeatureSettings: '"tnum"' }}>
                    {formatDaylight(almanac.sun.daylightMinutes)}
                    {almanac.sun.daylightDeltaVsYesterdayMinutes !== null && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t('daylightDelta', {
                          delta: (almanac.sun.daylightDeltaVsYesterdayMinutes > 0 ? '+' : '') +
                            almanac.sun.daylightDeltaVsYesterdayMinutes,
                        })}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('sun.solarNoon')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatLocalTime(almanac.sun.transit, tz, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('sun.nextSolstice')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatDate(almanac.sun.nextSolstice, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('sun.nextEquinox')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatDate(almanac.sun.nextEquinox, locale)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Moon card */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('moon.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('moon.phase')}</dt>
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
                  <dt className="text-muted-foreground">{t('moon.illumination')}</dt>
                  <dd className="font-medium text-foreground mt-0.5" style={{ fontFeatureSettings: '"tnum"' }}>
                    {formatValue(almanac.moon.illuminationPercent, 'percent')}%
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('moon.moonrise')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatLocalTime(almanac.moon.rise, tz, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('moon.moonset')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatLocalTime(almanac.moon.set, tz, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('moon.nextFullMoon')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatDate(almanac.moon.nextFullMoon, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('moon.nextNewMoon')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatDate(almanac.moon.nextNewMoon, locale)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Positional Data card — Skyfield-computed; null in mock phase */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('positional.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                {t('positional.note')}
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('positional.sunAzimuth')}</dt>
                  <dd className="font-medium text-muted-foreground mt-0.5">
                    {almanac.sun.azimuth !== null ? `${formatValue(almanac.sun.azimuth, 'degrees')}°` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('positional.sunAltitude')}</dt>
                  <dd className="font-medium text-muted-foreground mt-0.5">
                    {almanac.sun.altitude !== null ? `${formatValue(almanac.sun.altitude, 'degrees')}°` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('positional.moonAzimuth')}</dt>
                  <dd className="font-medium text-muted-foreground mt-0.5">
                    {almanac.moon.azimuth !== null ? `${formatValue(almanac.moon.azimuth, 'degrees')}°` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('positional.moonAltitude')}</dt>
                  <dd className="font-medium text-muted-foreground mt-0.5">
                    {almanac.moon.altitude !== null ? `${formatValue(almanac.moon.altitude, 'degrees')}°` : '—'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </>
      )}

      {!loading && !error && !almanac && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('noData')}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AlmanacPage;
