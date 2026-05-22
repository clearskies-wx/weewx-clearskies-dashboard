// records.tsx — Records page (/records)
// Semantic <table> with <thead>/<tbody>/<th scope> per coding §5.2.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { useRecords } from '../hooks/useWeatherData';

function formatDate(isoString: string | null, locale: string): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(isoString));
}

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
  const [period, setPeriod] = useState<Period>('all-time');
  const { data: records, units, loading, error, refetch } = useRecords(period);

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>

      {/* Period selector */}
      <div className="flex gap-2" role="group" aria-label={t('ariaPeriodGroup')}>
        <button
          type="button"
          aria-pressed={period === 'all-time'}
          onClick={() => setPeriod('all-time')}
          className={[
            'rounded-md px-4 py-2 text-sm font-medium min-h-[44px] md:min-h-0',
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
            'rounded-md px-4 py-2 text-sm font-medium min-h-[44px] md:min-h-0',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            period === 'ytd'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground hover:bg-muted/70',
          ].join(' ')}
        >
          {t('periodYearToDate')}
        </button>
      </div>

      {/* Operator narrative slot per ADR-024 */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 rounded-md px-3 py-2">
            {t('operatorNotePlaceholder')}
          </p>
        </CardContent>
      </Card>

      {loading && (
        <>
          <span className="sr-only" role="status">{t('loadingRecords')}</span>
          <TileSkeleton className="h-48" />
          <TileSkeleton className="h-48" />
        </>
      )}

      {error && <TileError message={t('unableToLoad')} onRetry={refetch} />}

      {!loading && !error && records && (
        <>
          {/* Populated sections from API data */}
          {Object.entries(records.sections).map(([section, entries]) => (
            <Card key={section}>
              <CardHeader>
                <CardTitle as="h2" className="capitalize">{t('sectionHeading', { section })}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" aria-label={t('sectionHeading', { section })}>
                    <thead>
                      <tr className="border-b border-border">
                        <th scope="col" className="pb-2 text-left font-semibold text-foreground pr-4">
                          {t('tableHeaderRecord')}
                        </th>
                        <th scope="col" className="pb-2 text-right font-semibold text-foreground pr-4">
                          {t('tableHeaderValue')}
                        </th>
                        <th scope="col" className="pb-2 text-right font-semibold text-foreground">
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
                                className="ml-2 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                title={t('badgeNewTitle')}
                                aria-label={t('badgeNewAriaLabel')}
                              >
                                {t('badgeNew')}
                              </span>
                            )}
                          </td>
                          <td
                            className="py-2.5 pr-4 text-right font-semibold text-foreground"
                            style={{ fontFeatureSettings: '"tnum"' }}
                          >
                            {entry.value !== null
                              ? `${entry.value} ${units?.[entry.canonicalField] ?? ''}`
                              : '—'}
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">
                            {formatDate(entry.observedAt, locale)}
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
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {t('noData')}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default RecordsPage;
