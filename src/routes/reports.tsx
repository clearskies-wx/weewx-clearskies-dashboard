// reports.tsx — Reports page (/reports)

import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { useReports, useReport } from '../hooks/useWeatherData';

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        Retry
      </button>
    </div>
  );
}

export function ReportsPage() {
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
    <div className="flex flex-col gap-6 max-w-2xl mx-auto" aria-live="polite">
      <h1 className="text-2xl font-bold text-foreground">Reports</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        NOAA-style monthly and annual climate reports summarize temperature, precipitation, and
        other observations. Reports are generated from your station&apos;s archive data.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>NOAA Monthly Reports</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {indexLoading && (
            <>
              <span className="sr-only" role="status">Loading report index…</span>
              <TileSkeleton className="h-12" />
            </>
          )}

          {indexError && <TileError message="Unable to load reports" onRetry={indexRefetch} />}

          {!indexLoading && !indexError && (
            <>
              {reports && reports.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No NOAA reports found. Reports become available once the archive has monthly data.
                </p>
              )}

              {reports && reports.length > 0 && (
                <div className="flex flex-wrap gap-4">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="report-year"
                      className="text-sm font-medium text-foreground"
                    >
                      Year
                    </label>
                    <select
                      id="report-year"
                      value={selectedYear ?? ''}
                      onChange={handleYearChange}
                      className={[
                        'rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      ].join(' ')}
                      aria-label="Select report year"
                    >
                      <option value="">— Select year —</option>
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
                      Month
                    </label>
                    <select
                      id="report-month"
                      value={selectedMonth ?? ''}
                      onChange={handleMonthChange}
                      disabled={!selectedYear || availableMonths.length === 0}
                      className={[
                        'rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                        (!selectedYear || availableMonths.length === 0) ? 'opacity-60 cursor-not-allowed' : '',
                      ].join(' ')}
                      aria-label="Select report month"
                    >
                      <option value="">— Select month —</option>
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>{MONTHS[m]}</option>
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
                  <span className="sr-only" role="status">Loading report…</span>
                  <TileSkeleton className="h-64" />
                </>
              )}
              {reportError && <TileError message="Unable to load report" onRetry={reportRefetch} />}
              {!reportLoading && !reportError && report && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">
                      {MONTHS[report.month ?? 0]} {report.year}
                    </h2>
                    <a
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(report.rawText)}`}
                      download={report.filename}
                      className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                    >
                      Download .txt
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
