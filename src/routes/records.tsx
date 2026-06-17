// records.tsx — Records page (/records)
// Semantic <table> with <thead>/<tbody>/<th scope> per coding §5.2.

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { PageLayout } from '../components/layout/page-layout';
import {
  Trophy,
  Thermometer,
  Wind,
  Drop,
  DropHalfBottom,
  Gauge,
  Sun,
  Leaf,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useRecords, useArchive, useStation } from '../hooks/useWeatherData';
import { formatValue } from '../utils/format';
import type { ArchiveRecord } from '../api/types';

function canonicalFieldToType(field: string): string {
  if (/[Tt]emp|dewpoint|windchill|heatindex|appTemp/.test(field)) return 'temperature';
  if (/[Bb]arometer|pressure|altimeter/.test(field)) return 'barometer';
  if (/[Ww]ind[Ss]peed|[Ww]ind[Gg]ust|avgWind|highWind/.test(field)) return 'wind';
  if (/[Ww]ind[Dd]ir|[Dd]om[Ww]ind/.test(field)) return 'degrees';
  if (/[Hh]umidity/.test(field)) return 'humidity';
  if (/rainRate/.test(field)) return 'rainRate';
  if (/rain|Rain|precip|Precip/.test(field)) return 'rain';
  if (/[Uu][Vv]/.test(field)) return 'uv';
  if (/radiation|[Ss]olar/.test(field)) return 'solar';
  return 'default';
}

type AggType = 'max' | 'min' | 'sum' | null;

function getRecordAggType(label: string, canonicalField: string): AggType {
  const lower = label.toLowerCase();
  if (/consecutive|range|wind run|monthly|annual/.test(lower)) return null;
  if (canonicalField === 'rain' && /high|most/.test(lower)) return 'sum';
  if (/low|smallest|least/.test(lower)) return 'min';
  if (/high|largest|most/.test(lower)) return 'max';
  return null;
}

function getTodayExtreme(
  canonicalField: string,
  aggType: AggType,
  archiveRecords: ArchiveRecord[],
): number | null {
  if (!aggType) return null;
  const values = archiveRecords
    .map(r => {
      const v = r[canonicalField];
      return typeof v === 'number' ? v : null;
    })
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  switch (aggType) {
    case 'max': return Math.max(...values);
    case 'min': return Math.min(...values);
    case 'sum': return values.reduce((a, b) => a + b, 0);
  }
}

function formatDate(isoString: string | null, locale: string, tz = 'UTC'): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    // ADR-020: display dates in station-local time.
    timeZone: tz,
  }).format(new Date(isoString));
}

const UNITLESS_FIELDS = /^(uv|UV|[Bb]eaufort)/;

const SECTION_ICONS: Record<string, Icon> = {
  temperature: Thermometer,
  wind: Wind,
  rain: Drop,
  humidity: DropHalfBottom,
  barometer: Gauge,
  sun: Sun,
  aqi: Leaf,
};

type Period = 'all-time' | 'ytd';

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

export function RecordsPage() {
  const { t, i18n } = useTranslation('records');
  const locale = i18n.language;
  const [period, setPeriod] = useState<Period>('ytd');
  const { data: records, units, loading, error, refetch } = useRecords(period);
  const { data: station } = useStation();
  const tz = station?.timezone ?? 'UTC';

  const todayFromEpoch = useMemo(() => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
    const elapsed = get('hour') * 3600 + get('minute') * 60 + get('second');
    return String(Math.floor(now.getTime() / 1000) - elapsed);
  }, [tz]);

  const { data: todayArchive } = useArchive({ from: todayFromEpoch });

  return (
    <PageLayout
      title={t('title')}
      icon={<Trophy weight="duotone" />}
      controls={
        <div className="flex gap-2" role="group" aria-label={t('ariaPeriodGroup')}>
          <button
            type="button"
            aria-pressed={period === 'all-time'}
            onClick={() => setPeriod('all-time')}
            className={[
              'rounded-md px-4 py-2 text-sm font-semibold min-h-[44px] md:min-h-0',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              period === 'all-time'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground hover:bg-muted/70',
            ].join(' ')}
          >
            {t('periodAllTime')}
          </button>
          <button
            type="button"
            aria-pressed={period === 'ytd'}
            onClick={() => setPeriod('ytd')}
            className={[
              'rounded-md px-4 py-2 text-sm font-semibold min-h-[44px] md:min-h-0',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              period === 'ytd'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground hover:bg-muted/70',
            ].join(' ')}
          >
            {t('periodYearToDate')}
          </button>
        </div>
      }
    >
        {loading && (
          <>
            <span className="sr-only" role="status">{t('loadingRecords')}</span>
            <TileSkeleton className="col-span-full h-48" />
            <TileSkeleton className="col-span-full h-48" />
          </>
        )}

        {error && (
          <div className="col-span-full">
            <TileError message={t('unableToLoad')} onRetry={refetch} />
          </div>
        )}

        {!loading && !error && records && (
          <>
            {Object.entries(records.sections).map(([section, entries]) => (
              <Card key={section} footprint="full">
                <CardHeader>
                  <CardTitle as="h2" className="capitalize flex items-center gap-2">
                    {SECTION_ICONS[section] && (() => {
                      const SectionIcon = SECTION_ICONS[section];
                      return <SectionIcon size={16} className="text-primary shrink-0" aria-hidden="true" />;
                    })()}
                    {t('sectionHeading', { section })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-sm" aria-label={t('sectionHeading', { section })}>
                      <thead>
                        <tr className="border-b border-border">
                          <th scope="col" className="w-[40%] pb-2 text-left font-semibold text-foreground pr-4">
                            {t('tableHeaderRecord')}
                          </th>
                          <th scope="col" className="w-[20%] pb-2 text-right font-semibold text-foreground pr-4">
                            {t('tableHeaderToday')}
                          </th>
                          <th scope="col" className="w-[20%] pb-2 text-right font-semibold text-foreground pr-4">
                            {t('tableHeaderValue')}
                          </th>
                          <th scope="col" className="w-[20%] pb-2 text-right font-semibold text-foreground">
                            {t('tableHeaderDateObserved')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry) => (
                          <tr
                            key={entry.label}
                            className="border-b border-border/50 last:border-0"
                          >
                            <td className="py-2.5 pr-4 text-left text-muted-foreground">
                              {entry.label}
                              {entry.brokenInLast30Days && (
                                <span
                                  className="ml-2 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                  title={t('badgeNewTitle')}
                                  aria-label={t('badgeNewAriaLabel')}
                                >
                                  {t('badgeNew')}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 text-right text-muted-foreground">
                              {(() => {
                                if (!todayArchive || todayArchive.length === 0) return '--';
                                const aggType = getRecordAggType(entry.label, entry.canonicalField);
                                const val = getTodayExtreme(entry.canonicalField, aggType, todayArchive);
                                if (val === null) return '--';
                                const unit = UNITLESS_FIELDS.test(entry.canonicalField) ? '' : (units?.[entry.canonicalField] ?? '');
                                return `${formatValue(val, canonicalFieldToType(entry.canonicalField))} ${unit}`.trim();
                              })()}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-semibold text-foreground">
                              {entry.value !== null
                                ? `${formatValue(entry.value, canonicalFieldToType(entry.canonicalField))} ${UNITLESS_FIELDS.test(entry.canonicalField) ? '' : (units?.[entry.canonicalField] ?? '')}`.trim()
                                : '—'}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">
                              {formatDate(entry.observedAt, locale, tz)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}

            {Object.keys(records.sections).length === 0 && (
              <Card footprint="full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t('noData')}
                </CardContent>
              </Card>
            )}
          </>
        )}
    </PageLayout>
  );
}

export default RecordsPage;
