// about.tsx — About page (/about)

import { useTranslation } from 'react-i18next';
import { Info } from '@phosphor-icons/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { PageLayout } from '../components/layout/page-layout';
import { useStation, useContent, useCapabilities } from '../hooks/useWeatherData';
import { useBranding } from '../lib/branding-provider';
import { SCENE_ASSET_MAP } from '../components/background/scene-background-types';

const PROVIDER_INFO: Record<string, { name: string; url: string }> = {
  nws:            { name: 'US National Weather Service / NOAA',       url: 'https://www.weather.gov' },
  aeris:          { name: 'Aeris Weather (DTN)',                      url: 'https://www.aerisweather.com' },
  openmeteo:      { name: 'Open-Meteo',                              url: 'https://open-meteo.com' },
  openweathermap: { name: 'OpenWeatherMap',                          url: 'https://openweathermap.org' },
  wunderground:   { name: 'Weather Underground (IBM)',                url: 'https://www.wunderground.com' },
  iqair:          { name: 'IQAir',                                   url: 'https://www.iqair.com' },
  usgs:           { name: 'US Geological Survey / US Dept. of the Interior', url: 'https://earthquake.usgs.gov' },
  geonet:         { name: 'GeoNet (GNS Science, New Zealand)',       url: 'https://www.geonet.org.nz' },
  emsc:           { name: 'European-Mediterranean Seismological Centre', url: 'https://www.emsc-csem.org' },
  renass:         { name: 'Réseau National de Surveillance Sismique (France)', url: 'https://renass.unistra.fr' },
  seven_timer:    { name: '7Timer! Astronomical Seeing Forecast',    url: 'https://www.7timer.info' },
  rainviewer:     { name: 'RainViewer',                              url: 'https://www.rainviewer.com' },
  iem_nexrad:     { name: 'Iowa Environmental Mesonet NEXRAD',       url: 'https://mesonet.agron.iastate.edu' },
  noaa_mrms:      { name: 'NOAA Multi-Radar Multi-Sensor (MRMS)',    url: 'https://www.nssl.noaa.gov/projects/mrms/' },
  msc_geomet:     { name: 'Meteorological Service of Canada GeoMet', url: 'https://eccc-msc.github.io/open-data/' },
  dwd_radolan:    { name: 'Deutscher Wetterdienst RADOLAN',          url: 'https://www.dwd.de' },
  astronomyapi:   { name: 'Astronomy API',                          url: 'https://astronomyapi.com' },
};

function formatLongDate(isoString: string | null, locale: string): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(isoString));
}

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

function relativeTime(isoString: string, locale: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
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
  const { data: capabilities } = useCapabilities();
  const branding = useBranding();

  return (
    <PageLayout title={t('title')} icon={<Info weight="duotone" />}>
        {/* Station metadata */}
        <Card footprint="full" aria-busy={stationLoading}>
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
                  <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('station.location')}</dt>
                  <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                    {station.latitude}°N, {Math.abs(station.longitude)}°W
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('station.altitude')}</dt>
                  <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                    {station.altitude} ft
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('station.hardware')}</dt>
                  <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                    {station.hardware ?? t('station.hardwareDefault')}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('station.timezone')}</dt>
                  <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                    {station.timezone}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('station.unitSystem')}</dt>
                  <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                    {station.unitSystem}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('station.stationId')}</dt>
                  <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                    {station.stationId}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('station.recordingSince')}</dt>
                  <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                    {formatLongDate(station.firstRecord, i18n.language)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('station.lastData')}</dt>
                  <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                    {station.lastRecord
                      ? `${relativeTime(station.lastRecord, i18n.language)} · ${formatAbsoluteTime(station.lastRecord, station.timezone, i18n.language)}`
                      : '—'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('station.unavailable')}</p>
            )}
          </CardContent>
        </Card>

        {/* Station photo — only rendered when operator has configured a photo URL */}
        {branding.stationPhotoUrl && branding.stationPhotoUrl.trim().length > 0 && (
          <Card footprint="wide" className="h-[var(--card-row)]">
            <CardHeader>
              <CardTitle as="h2">{t('photo.cardTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={branding.stationPhotoUrl}
                alt={branding.stationPhotoAlt?.trim() || t('photo.defaultAlt')}
                className="rounded-lg w-full h-full object-contain"
              />
            </CardContent>
          </Card>
        )}

        {/* Operator-authored content — only rendered when content exists */}
        {(contentLoading || content) && (
          <Card footprint="wide" aria-busy={contentLoading}>
            <CardHeader>
              <CardTitle as="h2">{t('aboutStation.cardTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {contentLoading ? (
                <>
                  <span className="sr-only" role="status">{t('aboutStation.loadingAria')}</span>
                  <TileSkeleton className="h-20" />
                </>
              ) : (
                <p className="text-foreground leading-relaxed whitespace-pre-wrap" style={{ fontSize: 'var(--text-body)' }}>
                  {content!.markdown}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Software */}
        <Card footprint="full">
          <CardHeader>
            <CardTitle as="h2">{t('software.cardTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('software.weatherSoftware')}</dt>
                <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('software.weatherSoftwareValue')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('software.dashboard')}</dt>
                <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('software.dashboardValue')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('software.dashboardEngine')}</dt>
                <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('software.dashboardEngineValue')}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Data Providers */}
        <Card footprint="full">
          <CardHeader>
            <CardTitle as="h2">{t('dataProviders.cardTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {capabilities && capabilities.providers.length > 0 ? (
              <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
                {Object.entries(
                  capabilities.providers.reduce<Record<string, string[]>>((acc, p) => {
                    if (!acc[p.domain]) acc[p.domain] = [];
                    if (!acc[p.domain].includes(p.providerId)) acc[p.domain].push(p.providerId);
                    return acc;
                  }, {}),
                ).map(([domain, providerIds]) => (
                  <div key={domain}>
                    <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>
                      {t(`dataProviders.domain.${domain}`, { defaultValue: domain })}
                    </dt>
                    <dd className="mt-0.5 space-y-0.5">
                      {providerIds.map(id => {
                        const info = PROVIDER_INFO[id];
                        return info ? (
                          <div key={id}>
                            <a
                              href={info.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-foreground hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                            >
                              {info.name}
                            </a>
                          </div>
                        ) : (
                          <div key={id} className="text-foreground capitalize">{id}</div>
                        );
                      })}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('dataProviders.empty')}</p>
            )}
          </CardContent>
        </Card>

        {/* Photo Credits */}
        <Card footprint="full">
          <CardHeader>
            <CardTitle as="h2">{t('photoCredits.cardTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(SCENE_ASSET_MAP).map(([key, entry]) => (
                <div key={key}>
                  <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>
                    {t(`photoCredits.scene.${key}`, { defaultValue: key })}
                  </dt>
                  <dd className="mt-0.5 text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                    {entry.attribution ?? t('photoCredits.builtIn')}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

    </PageLayout>
  );
}

export default AboutPage;
