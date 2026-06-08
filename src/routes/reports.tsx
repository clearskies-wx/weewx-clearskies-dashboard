// reports.tsx — Reports page (/reports)
//
// Default view: parsed, sortable HTML table for both monthly and yearly reports.
// Toggle to raw text view is available via the "View raw text" button.
// Monthly report highlights the row with the highest daily high temp (orange)
// and the row with the lowest daily low temp (blue).
// Yearly report renders three separate sub-tables (Temperature, Precipitation, Wind).

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadSimple, FileText } from '@phosphor-icons/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { Grid } from '../components/layout/grid';
import { PageHeaderCard } from '../components/layout/page-header-card';
import { Button } from '../components/ui/button';
import { useReports, useReport, useYearlyReport } from '../hooks/useWeatherData';
import { parseMonthlyReport, parseYearlyReport } from '../lib/noaa-parser';
import type { MonthlyRow, YearlyTable, ParsedMonthlyReport, ParsedYearlyReport } from '../lib/noaa-parser';
import { cn } from '../lib/utils';
import { formatValue } from '../utils/format';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the long month name for a 1-based month number using the active locale. */
function getMonthName(monthNumber: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long' }).format(
    new Date(2000, monthNumber - 1, 1),
  );
}

/**
 * Escape a single CSV field value: wrap in quotes if it contains a comma,
 * double-quote, or newline; always double internal quotes.
 */
function csvEscape(value: string | number | null): string {
  if (value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Join a row of values into a CSV line. */
function csvRow(cells: (string | number | null)[]): string {
  return cells.map(csvEscape).join(',');
}

/**
 * Build CSV text from a parsed monthly report.
 * Includes a header row, one data row per day, and the summary row if present.
 */
function buildMonthlyCsv(parsed: ParsedMonthlyReport): string {
  const header = csvRow([
    'Day', 'Mean Temp', 'High Temp', 'High Time', 'Low Temp', 'Low Time',
    'Heat Deg Days', 'Cool Deg Days', 'Rain', 'Avg Wind Speed',
    'High Wind Speed', 'High Wind Time', 'Dom Wind Dir',
  ]);

  const dataRows = parsed.rows.map((row) =>
    csvRow([
      row.day,
      row.meanTemp,
      row.highTemp,
      row.highTempTime || '',
      row.lowTemp,
      row.lowTempTime || '',
      row.heatDegDays,
      row.coolDegDays,
      row.rain,
      row.avgWindSpeed,
      row.highWindSpeed,
      row.highWindTime || '',
      row.domWindDir,
    ]),
  );

  const lines: string[] = [header, ...dataRows];

  if (parsed.summary) {
    const s = parsed.summary;
    lines.push(
      csvRow([
        'Summary',
        s.meanTemp,
        s.highTemp,
        s.highTempTime || '',
        s.lowTemp,
        s.lowTempTime || '',
        s.heatDegDays,
        s.coolDegDays,
        s.rain,
        s.avgWindSpeed,
        s.highWindSpeed,
        s.highWindTime || '',
        s.domWindDir,
      ]),
    );
  }

  return lines.join('\n');
}

/**
 * Build CSV text from a parsed yearly report.
 * Emits three sections (Temperature, Precipitation, Wind) separated by
 * a blank line and a section-header row.
 */
function buildYearlyCsv(parsed: ParsedYearlyReport): string {
  function sectionCsv(label: string, table: YearlyTable): string {
    const sectionLines: string[] = [
      // Section label in the first cell, rest empty
      csvRow([label, ...Array(table.headers.length - 1).fill('')]),
      csvRow(table.headers),
      ...table.rows.map((row) => csvRow(row)),
    ];
    if (table.summary) {
      sectionLines.push(csvRow(['Summary', ...table.summary.slice(1)]));
    }
    return sectionLines.join('\n');
  }

  return [
    sectionCsv('Temperature', parsed.temperature),
    '',
    sectionCsv('Precipitation', parsed.precipitation),
    '',
    sectionCsv('Wind', parsed.wind),
  ].join('\n');
}

/**
 * Trigger a browser file download via a temporary Blob URL.
 * The URL is revoked immediately after the click is dispatched.
 */
function triggerDownload(content: string, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Shared sub-components
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
// Sort state
// ---------------------------------------------------------------------------

type SortDirection = 'asc' | 'desc';

interface SortState {
  column: number | null;
  direction: SortDirection;
}

// ---------------------------------------------------------------------------
// Monthly column metadata
// The label keys map to `reports.monthlyColumns.*` in i18n.
// ---------------------------------------------------------------------------

interface ColumnMeta {
  /** i18n key within monthlyColumns namespace */
  labelKey: string;
  /** Property accessor on MonthlyRow */
  accessor: keyof MonthlyRow;
  /** Whether the value is numeric (enables numeric sort) */
  numeric: boolean;
}

const MONTHLY_COLUMNS: ColumnMeta[] = [
  { labelKey: 'day',           accessor: 'day',           numeric: true  },
  { labelKey: 'meanTemp',      accessor: 'meanTemp',      numeric: true  },
  { labelKey: 'highTemp',      accessor: 'highTemp',      numeric: true  },
  { labelKey: 'highTempTime',  accessor: 'highTempTime',  numeric: false },
  { labelKey: 'lowTemp',       accessor: 'lowTemp',       numeric: true  },
  { labelKey: 'lowTempTime',   accessor: 'lowTempTime',   numeric: false },
  { labelKey: 'heatDegDays',   accessor: 'heatDegDays',   numeric: true  },
  { labelKey: 'coolDegDays',   accessor: 'coolDegDays',   numeric: true  },
  { labelKey: 'rain',          accessor: 'rain',          numeric: true  },
  { labelKey: 'avgWindSpeed',  accessor: 'avgWindSpeed',  numeric: true  },
  { labelKey: 'highWindSpeed', accessor: 'highWindSpeed', numeric: true  },
  { labelKey: 'highWindTime',  accessor: 'highWindTime',  numeric: false },
  { labelKey: 'domWindDir',    accessor: 'domWindDir',    numeric: true  },
];


// ---------------------------------------------------------------------------
// SortableHeader — <th> with embedded <button> for sort
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  colIndex,
  sortState,
  onSort,
}: {
  label: string;
  colIndex: number;
  sortState: SortState;
  onSort: (colIndex: number) => void;
}) {
  const { t } = useTranslation('reports');
  const isActive = sortState.column === colIndex;
  const ariaSortValue = isActive
    ? sortState.direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

  const indicator = isActive ? (sortState.direction === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <th
      scope="col"
      aria-sort={ariaSortValue}
      className="px-2 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap"
    >
      <button
        type="button"
        onClick={() => onSort(colIndex)}
        className={cn(
          'inline-flex items-center gap-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          isActive ? 'text-primary' : 'hover:text-primary',
        )}
        aria-label={`${label} — ${isActive && sortState.direction === 'asc' ? t('sortDescending') : t('sortAscending')}`}
      >
        {label}{indicator}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Monthly table
// ---------------------------------------------------------------------------

function MonthlyReportTable({
  rawText,
  period,
}: {
  rawText: string;
  period: string;
}) {
  const { t } = useTranslation('reports');
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: 'asc' });

  const parsed = useMemo(() => parseMonthlyReport(rawText), [rawText]);

  // All hooks must run before any early return — compute sort even when parsed may be null.
  const sortedRows = useMemo(() => {
    if (!parsed) return [];
    if (sortState.column === null) return parsed.rows;
    const col = MONTHLY_COLUMNS[sortState.column];
    if (!col) return parsed.rows;

    return [...parsed.rows].sort((a, b) => {
      const av = a[col.accessor];
      const bv = b[col.accessor];
      // Nulls sort last regardless of direction
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;

      const cmp = col.numeric
        ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv));
      return sortState.direction === 'asc' ? cmp : -cmp;
    });
  }, [parsed, sortState]);

  // Map sorted row back to original index for highlight lookup.
  const originalIndexMap = useMemo(() => {
    if (!parsed) return [];
    return sortedRows.map((row) => parsed.rows.indexOf(row));
  }, [sortedRows, parsed]);

  const captionText = t('tableCaption', { period });

  function handleSort(colIndex: number) {
    setSortState((prev) => ({
      column: colIndex,
      direction: prev.column === colIndex && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  if (!parsed) {
    // Parsing failed — fall back to raw text inline
    return (
      <pre className="overflow-x-auto rounded-md bg-muted/40 p-4 text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap">
        {rawText}
      </pre>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Highlight legend */}
      <p className="text-xs text-muted-foreground" aria-live="off">
        {t('highlightLegend')}
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs text-foreground border-collapse">
          <caption className="sr-only">{captionText}</caption>
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {MONTHLY_COLUMNS.map((col, idx) => (
                <SortableHeader
                  key={col.accessor}
                  label={t(`monthlyColumns.${col.labelKey}`)}
                  colIndex={idx}
                  sortState={sortState}
                  onSort={handleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, sortedIdx) => {
              const origIdx = originalIndexMap[sortedIdx];
              const isHighTemp = origIdx === parsed.highTempRowIndex;
              const isLowTemp = origIdx === parsed.lowTempRowIndex;

              return (
                <tr
                  key={row.day ?? `row-${sortedIdx}`}
                  className={cn(
                    'border-b border-border last:border-0 hover:bg-muted/30 transition-colors',
                    isHighTemp && 'bg-orange-50 dark:bg-orange-950/30',
                    isLowTemp && !isHighTemp && 'bg-blue-50 dark:bg-blue-950/30',
                  )}
                  aria-label={
                    isHighTemp
                      ? t('highTempRow', { defaultValue: 'Highest temperature day' })
                      : isLowTemp
                      ? t('lowTempRow', { defaultValue: 'Lowest temperature day' })
                      : undefined
                  }
                >
                  {/* Day cell — scope="row" so screen readers can identify the row */}
                  <td scope="row" className="px-2 py-1.5 font-medium tabular-nums">
                    {row.day ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{row.meanTemp !== null ? formatValue(row.meanTemp, 'temperature') : '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.highTemp !== null ? formatValue(row.highTemp, 'temperature') : '—'}</td>
                  <td className="px-2 py-1.5">{row.highTempTime || '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.lowTemp !== null ? formatValue(row.lowTemp, 'temperature') : '—'}</td>
                  <td className="px-2 py-1.5">{row.lowTempTime || '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.heatDegDays !== null ? formatValue(row.heatDegDays, 'default') : '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.coolDegDays !== null ? formatValue(row.coolDegDays, 'default') : '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.rain !== null ? formatValue(row.rain, 'rain') : '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.avgWindSpeed !== null ? formatValue(row.avgWindSpeed, 'wind') : '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.highWindSpeed !== null ? formatValue(row.highWindSpeed, 'wind') : '—'}</td>
                  <td className="px-2 py-1.5">{row.highWindTime || '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.domWindDir !== null ? formatValue(row.domWindDir, 'degrees') : '—'}</td>
                </tr>
              );
            })}

            {/* Summary row */}
            {parsed.summary && (
              <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                <td scope="row" className="px-2 py-1.5">
                  {t('summary')}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{parsed.summary.meanTemp !== null ? formatValue(parsed.summary.meanTemp, 'temperature') : '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{parsed.summary.highTemp !== null ? formatValue(parsed.summary.highTemp, 'temperature') : '—'}</td>
                <td className="px-2 py-1.5">{parsed.summary.highTempTime || '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{parsed.summary.lowTemp !== null ? formatValue(parsed.summary.lowTemp, 'temperature') : '—'}</td>
                <td className="px-2 py-1.5">{parsed.summary.lowTempTime || '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{parsed.summary.heatDegDays !== null ? formatValue(parsed.summary.heatDegDays, 'default') : '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{parsed.summary.coolDegDays !== null ? formatValue(parsed.summary.coolDegDays, 'default') : '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{parsed.summary.rain !== null ? formatValue(parsed.summary.rain, 'rain') : '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{parsed.summary.avgWindSpeed !== null ? formatValue(parsed.summary.avgWindSpeed, 'wind') : '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{parsed.summary.highWindSpeed !== null ? formatValue(parsed.summary.highWindSpeed, 'wind') : '—'}</td>
                <td className="px-2 py-1.5">{parsed.summary.highWindTime || '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{parsed.summary.domWindDir !== null ? formatValue(parsed.summary.domWindDir, 'degrees') : '—'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Yearly sub-table
// ---------------------------------------------------------------------------

function YearlySubTable({
  table,
  caption,
}: {
  table: YearlyTable;
  caption: string;
}) {
  const { t } = useTranslation('reports');
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: 'asc' });

  function handleSort(colIndex: number) {
    setSortState((prev) => ({
      column: colIndex,
      direction: prev.column === colIndex && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  const sortedRows = useMemo(() => {
    if (sortState.column === null) return table.rows;
    return [...table.rows].sort((a, b) => {
      const av = a[sortState.column!];
      const bv = b[sortState.column!];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortState.direction === 'asc' ? cmp : -cmp;
    });
  }, [table.rows, sortState]);

  const colCount = table.headers.length;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs text-foreground border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            {table.headers.map((header, idx) => {
              const isActive = sortState.column === idx;
              const ariaSortValue = isActive
                ? sortState.direction === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none';
              const indicator = isActive ? (sortState.direction === 'asc' ? ' ↑' : ' ↓') : '';
              return (
                <th
                  key={`${header}-${idx}`}
                  scope="col"
                  aria-sort={ariaSortValue}
                  className="px-2 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(idx)}
                    className={cn(
                      'inline-flex items-center gap-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      isActive ? 'text-primary' : 'hover:text-primary',
                    )}
                    aria-label={`${header} — ${isActive && sortState.direction === 'asc' ? t('sortDescending') : t('sortAscending')}`}
                  >
                    {header}{indicator}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
            >
              {Array.from({ length: colCount }).map((_, colIdx) => {
                const cell = row[colIdx] ?? null;
                const display = typeof cell === 'number'
                  ? formatValue(cell, 'default')
                  : (cell ?? '—');
                return colIdx === 0 ? (
                  <td key={colIdx} scope="row" className="px-2 py-1.5 font-medium tabular-nums">
                    {display}
                  </td>
                ) : (
                  <td key={colIdx} className="px-2 py-1.5 tabular-nums">
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Summary row */}
          {table.summary && (
            <tr className="border-t-2 border-border bg-muted/50 font-semibold">
              <td scope="row" className="px-2 py-1.5">
                {t('summary')}
              </td>
              {Array.from({ length: colCount - 1 }).map((_, colIdx) => {
                const cell = table.summary![colIdx + 1] ?? null;
                const display = typeof cell === 'number'
                  ? formatValue(cell, 'default')
                  : (cell ?? '—');
                return (
                  <td key={colIdx + 1} className="px-2 py-1.5 tabular-nums">
                    {display}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Yearly report renderer
// ---------------------------------------------------------------------------

function YearlyReportTables({ rawText, period }: { rawText: string; period: string }) {
  const { t } = useTranslation('reports');
  const parsed = useMemo(() => parseYearlyReport(rawText), [rawText]);

  if (!parsed) {
    return (
      <pre className="overflow-x-auto rounded-md bg-muted/40 p-4 text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap">
        {rawText}
      </pre>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="yearly-temp-heading">
        <h3 id="yearly-temp-heading" className="text-sm font-semibold text-foreground mb-2">
          {t('yearlyTemp')}
        </h3>
        <YearlySubTable
          table={parsed.temperature}
          caption={`${t('yearlyTemp')} — ${period}`}
        />
      </section>

      <section aria-labelledby="yearly-precip-heading">
        <h3 id="yearly-precip-heading" className="text-sm font-semibold text-foreground mb-2">
          {t('yearlyPrecip')}
        </h3>
        <YearlySubTable
          table={parsed.precipitation}
          caption={`${t('yearlyPrecip')} — ${period}`}
        />
      </section>

      <section aria-labelledby="yearly-wind-heading">
        <h3 id="yearly-wind-heading" className="text-sm font-semibold text-foreground mb-2">
          {t('yearlyWind')}
        </h3>
        <YearlySubTable
          table={parsed.wind}
          caption={`${t('yearlyWind')} — ${period}`}
        />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ReportsPage component
// ---------------------------------------------------------------------------

export function ReportsPage() {
  const { t, i18n } = useTranslation('reports');
  const {
    data: reports,
    loading: indexLoading,
    error: indexError,
    refetch: indexRefetch,
  } = useReports();

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // 0 = "Annual" sentinel; null = nothing selected; 1-12 = month number
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [showRawText, setShowRawText] = useState(false);

  const isAnnual = selectedMonth === 0;

  // Always call both hooks; skip logic prevents unnecessary fetches.
  const {
    data: monthlyReport,
    loading: monthlyLoading,
    error: monthlyError,
    refetch: monthlyRefetch,
  } = useReport(selectedYear, isAnnual ? null : selectedMonth);

  const {
    data: yearlyReport,
    loading: yearlyLoading,
    error: yearlyError,
    refetch: yearlyRefetch,
  } = useYearlyReport(isAnnual ? selectedYear : null);

  const activeReport = isAnnual ? yearlyReport : monthlyReport;
  const reportLoading = isAnnual ? yearlyLoading : monthlyLoading;
  const reportError = isAnnual ? yearlyError : monthlyError;
  const reportRefetch = isAnnual ? yearlyRefetch : monthlyRefetch;

  // Derive available years from report index
  const availableYears = reports
    ? [...new Set(reports.map((r) => r.year))].sort((a, b) => b - a)
    : [];

  // Check if yearly reports exist for the selected year
  const hasYearlyReport =
    reports && selectedYear
      ? reports.some((r) => r.kind === 'yearly' && r.year === selectedYear)
      : false;

  // Derive available months for the selected year (only monthly entries)
  const availableMonths = reports && selectedYear
    ? reports
        .filter((r) => r.year === selectedYear && r.kind === 'monthly' && r.month != null)
        .map((r) => r.month as number)
        .sort((a, b) => b - a)
    : [];

  function handleYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const y = e.target.value ? Number(e.target.value) : null;
    setSelectedYear(y);
    setSelectedMonth(null);
    setShowRawText(false);
  }

  function handleMonthChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === '') {
      setSelectedMonth(null);
    } else {
      setSelectedMonth(Number(val));
    }
    setShowRawText(false);
  }

  // canFetch: a year and a month/annual selection have both been made
  const canFetch =
    selectedYear !== null && selectedMonth !== null;

  // Build period label for table captions and headings
  const periodLabel = useMemo(() => {
    if (!selectedYear) return '';
    if (isAnnual) return String(selectedYear);
    if (selectedMonth && selectedMonth >= 1) {
      return `${getMonthName(selectedMonth, i18n.language)} ${selectedYear}`;
    }
    return String(selectedYear);
  }, [selectedYear, selectedMonth, isAnnual, i18n.language]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t('title')}</h1>

      <Grid className="md:auto-rows-[auto]">
        <PageHeaderCard title={t('title')} info={t('intro')} icon={<FileText weight="duotone" />} />

        {/* Selector card */}
        <Card footprint="full">
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
                    {/* Year selector */}
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

                    {/* Month / Annual selector */}
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
                        disabled={!selectedYear || (availableMonths.length === 0 && !hasYearlyReport)}
                        className={[
                          'rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground min-h-[44px] md:min-h-0',
                          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                          (!selectedYear || (availableMonths.length === 0 && !hasYearlyReport))
                            ? 'opacity-60 cursor-not-allowed'
                            : '',
                        ].join(' ')}
                        aria-label={t('month.ariaLabel')}
                      >
                        <option value="">{t('month.placeholder')}</option>
                        {hasYearlyReport && (
                          <option value={0}>{t('annual')}</option>
                        )}
                        {availableMonths.map((m) => (
                          <option key={m} value={m}>{getMonthName(m, i18n.language)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </>
            )}

            {!canFetch && !indexLoading && !indexError && reports && reports.length > 0 && (
              <p className="text-sm text-muted-foreground">{t('noReportSelected')}</p>
            )}
          </CardContent>
        </Card>

        {/* Report content card */}
        {canFetch && (
          <Card footprint="full">
            <CardContent className="flex flex-col gap-4" aria-live="polite" aria-busy={reportLoading}>
              {reportLoading && (
                <>
                  <span className="sr-only" role="status">{t('loading.report')}</span>
                  <TileSkeleton className="h-64" />
                </>
              )}
              {reportError && (
                <TileError message={t('error.report')} onRetry={reportRefetch} />
              )}

              {!reportLoading && !reportError && activeReport && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-foreground">
                      {periodLabel}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRawText((v) => !v)}
                        className="inline-flex items-center min-h-[44px] md:min-h-0 px-2 text-sm text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                        aria-pressed={showRawText}
                      >
                        {showRawText ? t('viewTable') : t('viewRawText')}
                      </button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          triggerDownload(
                            activeReport.rawText,
                            'text/plain;charset=utf-8',
                            activeReport.filename,
                          );
                        }}
                        aria-label={t('download')}
                      >
                        <DownloadSimple aria-hidden="true" focusable="false" />
                        {t('download')}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const csvFilename = activeReport.filename.replace(/\.txt$/i, '.csv');
                          if (isAnnual) {
                            const parsed = parseYearlyReport(activeReport.rawText);
                            if (parsed) {
                              triggerDownload(buildYearlyCsv(parsed), 'text/csv;charset=utf-8', csvFilename);
                            }
                          } else {
                            const parsed = parseMonthlyReport(activeReport.rawText);
                            if (parsed) {
                              triggerDownload(buildMonthlyCsv(parsed), 'text/csv;charset=utf-8', csvFilename);
                            }
                          }
                        }}
                        aria-label={t('downloadCsv')}
                      >
                        <DownloadSimple aria-hidden="true" focusable="false" />
                        {t('downloadCsv')}
                      </Button>
                    </div>
                  </div>

                  {showRawText ? (
                    <pre className="overflow-x-auto rounded-md bg-muted/40 p-4 text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap">
                      {activeReport.rawText}
                    </pre>
                  ) : isAnnual ? (
                    <YearlyReportTables rawText={activeReport.rawText} period={periodLabel} />
                  ) : (
                    <MonthlyReportTable rawText={activeReport.rawText} period={periodLabel} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </Grid>
    </div>
  );
}

export default ReportsPage;
