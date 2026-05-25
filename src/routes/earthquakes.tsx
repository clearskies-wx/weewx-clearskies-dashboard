import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, CircleMarker, Popup } from 'react-leaflet';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import type { EarthquakeRecord } from '../api/types';
import { useEarthquakes, useStation } from '../hooks/useWeatherData';
import { formatValue } from '../utils/format';

function formatTime(isoString: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(new Date(isoString));
}

// Returns Tailwind bg+text class pair for the magnitude badge based on the M value.
// Color alone does not signal severity — the numeric value is always visible (§5.1).
function magnitudeClasses(mag: number): { bg: string; text: string } {
  if (mag < 2)   return { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-300' };
  if (mag < 3)   return { bg: 'bg-green-100 dark:bg-green-900/40',    text: 'text-green-800 dark:text-green-300' };
  if (mag < 4)   return { bg: 'bg-amber-100 dark:bg-amber-900/40',    text: 'text-amber-800 dark:text-amber-300' };
  if (mag < 5)   return { bg: 'bg-orange-100 dark:bg-orange-900/40',  text: 'text-orange-800 dark:text-orange-300' };
  return           { bg: 'bg-red-100 dark:bg-red-900/40',             text: 'text-red-800 dark:text-red-300' };
}

// PAGER alert level badge colors — matches real USGS palette semantics.
// Text label always present alongside color (§5.1).
function alertClasses(level: EarthquakeRecord['alert']): string {
  switch (level) {
    case 'green':  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'yellow': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'orange': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
    case 'red':    return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    default:       return '';
  }
}

function alertColor(alert: EarthquakeRecord['alert']): string {
  switch (alert) {
    case 'green':  return '#22c55e';
    case 'yellow': return '#eab308';
    case 'orange': return '#f97316';
    case 'red':    return '#ef4444';
    default:       return '#6b7280';
  }
}

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t: tc } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        {tc('retry')}
      </button>
    </div>
  );
}

export function EarthquakesPage() {
  const { t, i18n } = useTranslation('earthquakes');
  const locale = i18n.language;
  const { data: earthquakes, loading, error, refetch } = useEarthquakes();
  const { data: station } = useStation();

  const hasStation = station !== null;
  const center: [number, number] = hasStation
    ? [station.latitude, station.longitude]
    : [0, 0];
  const defaultZoom = hasStation ? 7 : 2;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>

      {loading && (
        <>
          <span className="sr-only" role="status">{t('loadingData')}</span>
          <TileSkeleton className="h-32" />
          <TileSkeleton className="h-32" />
        </>
      )}

      {error && <TileError message={t('unableToLoad')} onRetry={refetch} />}

      {!loading && !error && earthquakes !== null && (
        earthquakes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {t('noRecentQuakes')}
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-4" role="list" aria-label={t('ariaRecentList')}>
            {earthquakes.map((quake) => {
              const { bg, text } = magnitudeClasses(quake.magnitude);
              return (
                <li key={quake.id}>
                  <Card>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-4">
                        <div
                          className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg ${bg}`}
                          aria-label={t('ariaMagnitude', { mag: formatValue(quake.magnitude, 'earthquakeMag') })}
                        >
                          <span className={`text-xs leading-none ${text}`}>M</span>
                          <span
                            className={`text-2xl font-bold leading-none mt-0.5 ${text}`}
                            style={{ fontFeatureSettings: '"tnum"' }}
                          >
                            {formatValue(quake.magnitude, 'earthquakeMag')}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <p className="font-semibold text-foreground leading-snug">
                            {quake.place ?? t('unknownLocation')}
                            {quake.magnitudeType && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                ({quake.magnitudeType.toLowerCase()})
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatTime(quake.time, station?.timezone ?? 'UTC', locale)}
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                            {quake.depth !== null && (
                              <span>{t('depth', { depth: formatValue(quake.depth, 'earthquakeDepth') })}</span>
                            )}
                            <span>{t('source', { source: quake.source.toUpperCase() })}</span>
                          </div>

                          {/* Additional fields: felt, mmi, tsunami, alert */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-1">
                            {quake.felt !== null && (
                              <span className="text-muted-foreground">
                                {t('feltBy', { count: quake.felt })}
                              </span>
                            )}
                            {quake.mmi !== null && (
                              <span className="text-muted-foreground" style={{ fontFeatureSettings: '"tnum"' }}>
                                {t('mmi', { mmi: formatValue(quake.mmi, 'earthquakeMag') })}
                              </span>
                            )}
                            {quake.tsunami && (
                              <span className="font-medium text-amber-800 dark:text-amber-300">
                                {t('tsunamiWatch')}
                              </span>
                            )}
                            {quake.alert !== null && (
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 font-medium capitalize ${alertClasses(quake.alert)}`}
                              >
                                {t('pager', { level: quake.alert })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('mapCardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="h-96 rounded-lg overflow-hidden"
            role="region"
            aria-label={t('mapCardTitle')}
          >
            <MapContainer
              center={center}
              zoom={defaultZoom}
              className="h-full w-full"
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {hasStation && (
                <Marker position={center}>
                  <Popup>{t('stationLocation')}</Popup>
                </Marker>
              )}
              {earthquakes?.map((eq) => (
                <CircleMarker
                  key={eq.id}
                  center={[eq.latitude, eq.longitude]}
                  radius={Math.max(4, eq.magnitude * 3)}
                  pathOptions={{
                    color: alertColor(eq.alert),
                    fillColor: alertColor(eq.alert),
                    fillOpacity: 0.6,
                    weight: 1,
                  }}
                >
                  <Popup>
                    <div>
                      <strong>{eq.place ?? t('unknownLocation')}</strong><br />
                      {t('magnitude')}: {formatValue(eq.magnitude, 'earthquakeMag')}{eq.magnitudeType ? ` ${eq.magnitudeType}` : ''}<br />
                      {eq.depth !== null ? <>{t('depthLabel')}: {formatValue(eq.depth, 'earthquakeDepth')} km<br /></> : null}
                      {eq.alert !== null ? <>{t('pager', { level: eq.alert })}<br /></> : null}
                      {new Date(eq.time).toLocaleString(locale)}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {/* Configuration summary */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('configCardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('configRadius')}</dt>
              <dd className="font-medium text-foreground mt-0.5">100 km</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('configProvider')}</dt>
              <dd className="font-medium text-foreground mt-0.5">USGS</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {t('configHelperText')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default EarthquakesPage;
