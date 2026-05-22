// reports.tsx — Reports page (/reports)

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { useReports, useReport } from '../hooks/useWeatherData';

/** Return the long month name for a 1-based month number using the active locale. */
function getMonthName(monthNumber: number, locale: string): string {
  // Intl.DateTimeFormat month: 'long' on a date whose month index = monthNumber - 1
  return new Intl.DateTimeFormat(locale, { month: 'long' }).format(
    new Date(2000, monthNumber - 1, 1),
  );
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

export function ReportsPage() {
  const { t, i18n } = useTranslation('reports');
  const { data: reports, loading: indexLoading, error: indexError, refetch: indexRefetch } = useReports();

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const { data: report, loading: reportLoading, error: reportError, refetch: reportRefetch } = useReport(
    selectedYear,
    selectedMonth,
  );

  // Derive available years from report index
  const availableYears = reports
    ? [...new Set(reports.map((r) => r.year))].sort((a, b) => b - a)
    : [];

  // Derive available months for selected year
  const availableMonths = reports && selectedYear
    ? reports
        .filter((r) => r.year === selectedYear && r.month != null)
        .map((r) => r.month as number)
        .sort((a, b) => b - a)
    : [];

  function handleYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const y = e.target.value ? Number(e.target.value) : null;
    setSelectedYear(y);
    setSelectedMonth(null);
  }

  function handleMonthChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const m = e.target.value ? Number(e.target.value) : null;
    setSelectedMonth(m);
  }

  const canFetch = selectedYear !== null && selectedMonth !== null;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        {t('intro')}
      </p>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('card.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {indexLoading && (
            <>
              <span className="sr-only" role="status">{t('loading.index')}</span>
              <TileSkeleton className="h-12" />
            </>
          )}

          {indexError && <TileError message={t('error.index')} onRetry={indexRefetch} />}

          {!indexLoading && !indexError && (
            <>
              {reports && reports.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('empty')}
                </p>
              )}

              {reports && reports.length > 0 && (
                <div className="flex flex-wrap gap-4">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="report-year"
                      className="text-sm font-medium text-foreground"
                    >
                      {t('year.label')}
                    </label>
                    <select
                      id="report-year"
                      value={selectedYear ?? ''}
                      onChange={handleYearChange}
                      className={[
                        'rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground min-h-[44px] md:min-h-0',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      ].join(' ')}
                      aria-label={t('year.ariaLabel')}
                    >
                      <option value="">{t('year.placeholder')}</option>
                      {availableYears.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="report-month"
                      className="text-sm font-medium text-foreground"
                    >
                      {t('month.label')}
                    </label>
                    <select
                      id="report-month"
                      value={selectedMonth ?? ''}
                      onChange={handleMonthChange}
                      disabled={!selectedYear || availableMonths.length === 0}
                      className={[
                        'rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground min-h-[44px] md:min-h-0',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                        (!selectedYear || availableMonths.length === 0) ? 'opacity-60 cursor-not-allowed' : '',
                      ].join(' ')}
                      aria-label={t('month.ariaLabel')}
                    >
                      <option value="">{t('month.placeholder')}</option>
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>{getMonthName(m, i18n.language)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Report viewer */}
          {canFetch && (
            <div aria-live="polite" aria-busy={reportLoading}>
              {reportLoading && (
                <>
                  <span className="sr-only" role="status">{t('loading.report')}</span>
                  <TileSkeleton className="h-64" />
                </>
              )}
              {reportError && <TileError message={t('error.report')} onRetry={reportRefetch} />}
              {!reportLoading && !reportError && report && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">
                      {report.month ? getMonthName(report.month, i18n.language) : t('annual')} {report.year}
                    </h2>
                    <a
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(report.rawText)}`}
                      download={report.filename}
                      className="inline-flex items-center min-h-[44px] md:min-h-0 px-2 text-sm text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                    >
                      {t('download')}
                    </a>
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-muted/40 p-4 text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap">
                    {report.rawText}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ReportsPage;
