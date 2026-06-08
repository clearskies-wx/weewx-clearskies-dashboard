// about.tsx — About page (/about)

import { useTranslation } from 'react-i18next';
import { Info } from '@phosphor-icons/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { Grid } from '../components/layout/grid';
import { PageHeaderCard } from '../components/layout/page-header-card';
import { useStation, useContent, useCapabilities } from '../hooks/useWeatherData';
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t('title')}</h1>

      <Grid className="md:auto-rows-[auto]">
        <PageHeaderCard title={t('title')} icon={<Info weight="duotone" />} />

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
                  <dd className="mt-0.5 font-medium text-foreground text-xs">
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

        {/* Station photo — before software per user request */}
        <Card footprint="full">
          <CardHeader>
            <CardTitle as="h2">{t('photo.cardTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border-dashed border-2 border-border rounded-lg h-48 flex items-center justify-center">
              <p className="text-sm text-muted-foreground text-center px-4">
                {t('photo.placeholder')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Operator-authored content */}
        <Card footprint="full" aria-busy={contentLoading}>
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

        {/* Software */}
        <Card footprint="full">
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
                    <dt className="text-muted-foreground">
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
                              className="font-medium text-foreground underline underline-offset-4 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                            >
                              {info.name}
                            </a>
                          </div>
                        ) : (
                          <div key={id} className="font-medium text-foreground capitalize">{id}</div>
                        );
                      })}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{t('dataProviders.empty')}</p>
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
                  <dt className="text-muted-foreground">
                    {t(`photoCredits.scene.${key}`, { defaultValue: key })}
                  </dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {entry.attribution ?? t('photoCredits.builtIn')}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </Grid>
    </div>
  );
}

export default AboutPage;
