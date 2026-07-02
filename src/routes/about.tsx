// about.tsx — About page (/about)

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from '@phosphor-icons/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { PageLayout } from '../components/layout/page-layout';
import { useStation, useCapabilities } from '../hooks/useWeatherData';
import { useBranding } from '../lib/branding-provider';
import { SCENE_ASSET_MAP } from '../components/background/scene-background-types';

const STATIC_PROVIDERS: Array<{ domain: string; name: string; url: string }> = [
  { domain: 'baseMaps',     name: 'OpenStreetMap',                              url: 'https://www.openstreetmap.org/copyright' },
  { domain: 'baseMaps',     name: 'CARTO',                                     url: 'https://carto.com/attributions' },
  { domain: 'baseMaps',     name: 'Protomaps',                                 url: 'https://protomaps.com' },
  { domain: 'earthquakes',  name: 'GEM Global Active Faults Database',         url: 'https://github.com/GEMScienceTools/gem-global-active-faults' },
  { domain: 'astronomical', name: 'Skyfield + NASA JPL Ephemerides',           url: 'https://rhodesmill.org/skyfield/' },
  { domain: 'astronomical', name: 'International Meteor Organization (IMO)',   url: 'https://www.imo.net' },
];

const DOMAIN_GROUP: Record<string, string> = {
  seeing: 'astronomical',
  almanac: 'astronomical',
  seismicData: 'earthquakes',
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
  const { data: capabilities } = useCapabilities();
  const branding = useBranding();

  const groupedProviders = useMemo(() => {
    if (!capabilities || capabilities.providers.length === 0) return null;
    const grouped: Record<string, Array<{ name: string; url: string; id: string }>> = {};
    for (const p of capabilities.providers) {
      const domain = DOMAIN_GROUP[p.domain] ?? p.domain;
      if (!grouped[domain]) grouped[domain] = [];
      const info = p.attribution
        ? { name: p.attribution.displayName, url: p.attribution.url, id: p.providerId }
        : { name: p.providerId, url: '', id: p.providerId };
      if (!grouped[domain].some(e => e.id === info.id)) grouped[domain].push(info);
    }
    for (const sp of STATIC_PROVIDERS) {
      const domain = DOMAIN_GROUP[sp.domain] ?? sp.domain;
      if (!grouped[domain]) grouped[domain] = [];
      grouped[domain].push({ name: sp.name, url: sp.url, id: sp.name });
    }
    return grouped;
  }, [capabilities]);

  return (
    <PageLayout title={t('title')} icon={<Info weight="duotone" />}>
        {/* Station metadata */}
        <Card footprint="wide" aria-busy={stationLoading}>
          <CardHeader>
            <CardTitle as="h2">{branding.siteTitle || station?.name || t('station.defaultName')}</CardTitle>
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
                    {station.name ? `${station.name} — ` : ''}{station.latitude}°N, {Math.abs(station.longitude)}°W
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
                {branding.aboutContent && branding.aboutContent.trim().length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>{t('aboutStation.cardTitle')}</dt>
                    <dd className="mt-0.5 text-foreground leading-relaxed whitespace-pre-wrap" style={{ fontSize: 'var(--text-body)' }}>
                      {branding.aboutContent}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('station.unavailable')}</p>
            )}
          </CardContent>
        </Card>

        {/* Station photo — only rendered when operator has configured a photo URL */}
        {branding.stationPhotoUrl && branding.stationPhotoUrl.trim().length > 0 && (
          <Card footprint="wide" className="h-[calc(var(--card-row)*2)]">
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
            {groupedProviders ? (
              <dl className="columns-1 sm:columns-2 gap-x-8 text-sm">
                {Object.entries(groupedProviders).map(([domain, providers]) => (
                  <div key={domain} className="mb-3 break-inside-avoid">
                    <dt className="text-muted-foreground uppercase font-semibold" style={{ fontSize: 'var(--text-label)' }}>
                      {t(`dataProviders.domain.${domain}`, { defaultValue: domain })}
                    </dt>
                    <dd className="mt-0.5 space-y-0.5">
                      {providers.map(p => p.url ? (
                        <div key={p.id}>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          >
                            {p.name}
                          </a>
                        </div>
                      ) : (
                        <div key={p.id} className="text-foreground capitalize">{p.name}</div>
                      ))}
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
