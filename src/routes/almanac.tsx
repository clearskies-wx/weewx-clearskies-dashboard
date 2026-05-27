// almanac.tsx — Almanac page (/almanac)

import { useTranslation } from 'react-i18next';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  useAlmanac,
  useStation,
  useClimatologyMonthly,
  useAlmanacPlanets,
  useAlmanacMoonNames,
  useAlmanacEclipses,
  useAlmanacMeteorShowers,
} from '../hooks/useWeatherData';
import { formatValue } from '../utils/format';
import type { MeteorShowerEntry, PlanetEntry } from '../api/types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Format UTC ISO time to local time display: "5:55 AM PDT"
function formatLocalTime(isoString: string | null, tz: string, locale: string): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
    timeZoneName: 'short',
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

// Format ISO date-only string "YYYY-MM-DD" to locale date: "May 25, 2026"
function formatDateOnly(dateStr: string | null, locale: string): string {
  if (!dateStr) return '—';
  // Append T00:00:00Z so Date parses as UTC midnight, not local midnight
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateStr}T00:00:00Z`));
}

// Capitalize hyphenated phase name: "waxing-gibbous" → "Waxing Gibbous"
function formatPhaseName(name: string | null): string {
  if (!name) return '—';
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Days between today and a future date string "YYYY-MM-DD". Negative = past.
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
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

// ---------------------------------------------------------------------------
// Skeleton / error helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Eclipse type badge
// type penumbral → gray, partial → amber, total → red
// Color is paired with the text label — never color-only signal (WCAG 1.4.1)
// ---------------------------------------------------------------------------

type EclipseType = 'penumbral' | 'partial' | 'total';

const ECLIPSE_BADGE_CLASS: Record<EclipseType, string> = {
  // text-foreground on bg-muted: foreground (#171717) on muted (#f5f5f5) ≈ 16.6:1 — passes AA.
  // text-muted-foreground (#737373) on bg-muted (#f5f5f5) = 4.34:1, which fails AA 4.5 threshold.
  penumbral: 'bg-muted text-foreground border-muted-foreground/30',
  partial: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/30',
  total: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/30',
};

// ---------------------------------------------------------------------------
// Viewing conditions badge
// Color is paired with text label — never color-only (WCAG 1.4.1)
// ---------------------------------------------------------------------------

type ViewingCondition = 'excellent' | 'good' | 'fair' | 'poor';

const VIEWING_BADGE_CLASS: Record<ViewingCondition, string> = {
  excellent: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/30',
  good: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/30',
  fair: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/30',
  // text-foreground on bg-muted: foreground (#171717) on muted (#f5f5f5) ≈ 16.6:1 — passes AA.
  // text-muted-foreground (#737373) on bg-muted (#f5f5f5) = 4.34:1, which fails AA 4.5 threshold.
  poor: 'bg-muted text-foreground border-muted-foreground/30',
};

// ---------------------------------------------------------------------------
// PlanetRow — one row in the planets section
// ---------------------------------------------------------------------------

function PlanetRow({
  planet,
  tz,
  locale,
}: {
  planet: PlanetEntry;
  tz: string;
  locale: string;
}) {
  return (
    <li className="flex items-start justify-between gap-2 py-1.5">
      <span className="font-medium text-foreground">{planet.name}</span>
      <span className="text-right text-muted-foreground text-xs shrink-0">
        {planet.magnitude !== null && (
          <span className="mr-2">{planet.magnitude > 0 ? '+' : ''}{planet.magnitude.toFixed(1)} mag</span>
        )}
        {planet.rise && (
          <span>
            {formatLocalTime(planet.rise, tz, locale)}
            {planet.set ? ` – ${formatLocalTime(planet.set, tz, locale)}` : ''}
          </span>
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// MeteorShowerRow — one row in the shower table
// ---------------------------------------------------------------------------

function MeteorShowerRow({
  shower,
  locale,
  isUpcoming,
}: {
  shower: MeteorShowerEntry;
  locale: string;
  isUpcoming: boolean;
}) {
  const condition = shower.viewingConditions as ViewingCondition | null;
  const conditionClass = condition ? VIEWING_BADGE_CLASS[condition] : VIEWING_BADGE_CLASS.poor;

  return (
    <tr className={isUpcoming ? 'bg-primary/5' : undefined}>
      <td className="py-2 pr-3 text-sm">
        <span className="font-medium text-foreground">{shower.name}</span>
        {isUpcoming && (
          <span className="ml-1.5 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary border border-primary/20">
            Upcoming
          </span>
        )}
        {shower.parentBody && (
          <span className="block text-xs text-muted-foreground">{shower.parentBody}</span>
        )}
      </td>
      <td className="py-2 pr-3 text-sm text-muted-foreground whitespace-nowrap">
        {formatDateOnly(shower.peakDate, locale)}
      </td>
      <td className="py-2 pr-3 text-sm text-muted-foreground text-right">
        {shower.zhr !== null ? shower.zhr : '—'}
      </td>
      <td className="py-2 text-sm">
        {condition ? (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${conditionClass}`}
          >
            {condition.charAt(0).toUpperCase() + condition.slice(1)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AlmanacPage() {
  const { t, i18n } = useTranslation('almanac');
  const locale = i18n.language;

  const { data: almanac, loading, error, refetch } = useAlmanac();
  const { data: station } = useStation();
  const tz = station?.timezone ?? 'UTC';

  // New endpoint data
  const { data: climatology, loading: climLoading } = useClimatologyMonthly();
  const { data: planets, loading: planetsLoading } = useAlmanacPlanets();
  const { data: moonNames } = useAlmanacMoonNames();
  const { data: eclipseData, loading: eclipsesLoading } = useAlmanacEclipses();
  const { data: showerData, loading: showersLoading } = useAlmanacMeteorShowers();

  // ---------------------------------------------------------------------------
  // Derived: climatology chart data
  // ---------------------------------------------------------------------------

  const hasClimatologyData =
    climatology !== null &&
    (climatology.avgHighTemp.some((v) => v !== null) ||
      climatology.avgLowTemp.some((v) => v !== null) ||
      climatology.avgRainfall.some((v) => v !== null));

  const climatologyChartData = climatology
    ? climatology.months.map((month, i) => ({
        month,
        avgHigh: climatology.avgHighTemp[i] ?? null,
        avgLow: climatology.avgLowTemp[i] ?? null,
        avgDewpoint: climatology.avgDewpoint[i] ?? null,
        avgRainfall: climatology.avgRainfall[i] ?? null,
      }))
    : [];

  // ---------------------------------------------------------------------------
  // Derived: planets visibility
  // ---------------------------------------------------------------------------

  const hasPlanets =
    planets !== null &&
    (planets.evening.length > 0 ||
      planets.morning.length > 0 ||
      planets.allNight.length > 0);

  // ---------------------------------------------------------------------------
  // Derived: meteor showers sorted (upcoming first, then past)
  // ---------------------------------------------------------------------------

  const sortedShowers = showerData
    ? [...showerData.showers].sort((a, b) => {
        const da = daysUntil(a.peakDate);
        const db = daysUntil(b.peakDate);
        // Upcoming (non-negative) before past (negative)
        if (da >= 0 && db < 0) return -1;
        if (da < 0 && db >= 0) return 1;
        // Both upcoming: soonest first; both past: most recent first (least negative)
        return da - db;
      })
    : [];

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
                  <dd className="font-medium text-foreground mt-0.5">
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

          {/* Moon card — enhanced with special name badges when available */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('moon.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Moon name badges — only shown when data is available */}
              {moonNames && (moonNames.name || (moonNames.specialDesignations?.length ?? 0) > 0) && (
                <div className="flex flex-wrap gap-1.5 mb-4" aria-label="Special moon designations">
                  {moonNames.name && (
                    <Badge variant="secondary">{moonNames.name}</Badge>
                  )}
                  {(moonNames.specialDesignations ?? []).map((designation) => (
                    <Badge key={designation} variant="outline">{designation}</Badge>
                  ))}
                </div>
              )}
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
                  <dd className="font-medium text-foreground mt-0.5">
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

      {/* ------------------------------------------------------------------- */}
      {/* Climatological Monthly Averages card                                 */}
      {/* ------------------------------------------------------------------- */}

      {climLoading && <TileSkeleton className="h-72" />}

      {!climLoading && hasClimatologyData && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Monthly Averages</CardTitle>
          </CardHeader>
          <CardContent>
            {/*
              Screen-reader data table provides the chart data to non-sighted
              users (WCAG 1.1.1 / coding rules §5.5).
            */}
            <table className="sr-only" aria-label="Monthly averages data table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Avg High</th>
                  <th scope="col">Avg Low</th>
                  <th scope="col">Avg Dewpoint</th>
                  <th scope="col">Avg Rainfall</th>
                </tr>
              </thead>
              <tbody>
                {climatologyChartData.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{row.avgHigh ?? '—'}</td>
                    <td>{row.avgLow ?? '—'}</td>
                    <td>{row.avgDewpoint ?? '—'}</td>
                    <td>{row.avgRainfall ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Visual chart */}
            <div
              aria-label="Monthly averages chart showing temperature lines and rainfall bars"
              role="img"
            >
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={climatologyChartData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  {/* Left Y-axis: temperature */}
                  <YAxis
                    yAxisId="temp"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                    label={{
                      value: '°',
                      position: 'insideLeft',
                      offset: 4,
                      style: { fontSize: 12 },
                    }}
                  />
                  {/* Right Y-axis: rainfall */}
                  <YAxis
                    yAxisId="rain"
                    orientation="right"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: '0.75rem',
                      borderRadius: '0.5rem',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                  {/* Rainfall bars behind temperature lines */}
                  <Bar
                    yAxisId="rain"
                    dataKey="avgRainfall"
                    name="Avg Rainfall"
                    fill="hsl(210 80% 65%)"
                    fillOpacity={0.4}
                    radius={[2, 2, 0, 0]}
                  />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="avgHigh"
                    name="Avg High"
                    stroke="hsl(12 90% 52%)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="avgLow"
                    name="Avg Low"
                    stroke="hsl(210 80% 55%)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="avgDewpoint"
                    name="Avg Dewpoint"
                    stroke="hsl(270 60% 55%)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    strokeDasharray="4 2"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Planets Visible Tonight card                                         */}
      {/* ------------------------------------------------------------------- */}

      {planetsLoading && <TileSkeleton className="h-48" />}

      {!planetsLoading && planets !== null && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Planets Visible Tonight</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasPlanets ? (
              <p className="text-sm text-muted-foreground">No planets visible tonight</p>
            ) : (
              <div className="flex flex-col gap-4 text-sm">
                {planets.evening.length > 0 && (
                  <section aria-labelledby="planets-evening-heading">
                    <h3
                      id="planets-evening-heading"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1"
                    >
                      Evening Sky
                    </h3>
                    <ul className="divide-y divide-border" role="list">
                      {planets.evening.map((p) => (
                        <PlanetRow key={p.name} planet={p} tz={tz} locale={locale} />
                      ))}
                    </ul>
                  </section>
                )}
                {planets.morning.length > 0 && (
                  <section aria-labelledby="planets-morning-heading">
                    <h3
                      id="planets-morning-heading"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1"
                    >
                      Morning Sky
                    </h3>
                    <ul className="divide-y divide-border" role="list">
                      {planets.morning.map((p) => (
                        <PlanetRow key={p.name} planet={p} tz={tz} locale={locale} />
                      ))}
                    </ul>
                  </section>
                )}
                {planets.allNight.length > 0 && (
                  <section aria-labelledby="planets-allnight-heading">
                    <h3
                      id="planets-allnight-heading"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1"
                    >
                      All Night
                    </h3>
                    <ul className="divide-y divide-border" role="list">
                      {planets.allNight.map((p) => (
                        <PlanetRow key={p.name} planet={p} tz={tz} locale={locale} />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Lunar Eclipses card                                                  */}
      {/* ------------------------------------------------------------------- */}

      {eclipsesLoading && <TileSkeleton className="h-32" />}

      {!eclipsesLoading && eclipseData !== null && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Lunar Eclipses</CardTitle>
          </CardHeader>
          <CardContent>
            {eclipseData.eclipses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lunar eclipses this year</p>
            ) : (
              <ul className="divide-y divide-border text-sm" role="list">
                {eclipseData.eclipses.map((eclipse) => {
                  const eclipseClass = ECLIPSE_BADGE_CLASS[eclipse.type];
                  return (
                    <li
                      key={`${eclipse.date}-${eclipse.type}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="text-foreground">
                        {formatDateOnly(eclipse.date, locale)}
                      </span>
                      {/*
                        Eclipse type badge: color IS paired with the text label
                        so it is not a color-only signal (WCAG 1.4.1).
                      */}
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${eclipseClass}`}
                      >
                        {eclipse.type.charAt(0).toUpperCase() + eclipse.type.slice(1)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Meteor Showers card                                                  */}
      {/* ------------------------------------------------------------------- */}

      {showersLoading && <TileSkeleton className="h-40" />}

      {!showersLoading && showerData !== null && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Meteor Showers</CardTitle>
          </CardHeader>
          <CardContent>
            {sortedShowers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No meteor shower data available</p>
            ) : (
              /* Overflow wrapper for narrow viewports */
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-left border-collapse min-w-[24rem]" aria-label="Meteor showers">
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="pb-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Shower
                      </th>
                      <th scope="col" className="pb-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                        Peak Date
                      </th>
                      <th scope="col" className="pb-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
                        ZHR
                      </th>
                      <th scope="col" className="pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Conditions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedShowers.map((shower) => {
                      const upcoming = daysUntil(shower.peakDate);
                      return (
                        <MeteorShowerRow
                          key={shower.name}
                          shower={shower}
                          locale={locale}
                          isUpcoming={upcoming >= 0 && upcoming <= 30}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AlmanacPage;
