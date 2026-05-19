// records.tsx — Records page (/records)
// Semantic <table> with <thead>/<tbody>/<th scope> per coding §5.2.

import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { useRecords } from '../hooks/useWeatherData';

function formatDate(isoString: string | null): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('en-US', {
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

export function RecordsPage() {
  const [period, setPeriod] = useState<Period>('all-time');
  const { data: records, units, loading, error, refetch } = useRecords(period);

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto" aria-live="polite">
      <h1 className="text-2xl font-bold text-foreground">Records</h1>

      {/* Period selector */}
      <div className="flex gap-2" role="group" aria-label="Records period">
        <button
          type="button"
          aria-pressed={period === 'all-time'}
          onClick={() => setPeriod('all-time')}
          className={[
            'rounded-md px-4 py-2 text-sm font-medium',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            period === 'all-time'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/70',
          ].join(' ')}
        >
          All-Time
        </button>
        <button
          type="button"
          aria-pressed={period === 'ytd'}
          onClick={() => setPeriod('ytd')}
          className={[
            'rounded-md px-4 py-2 text-sm font-medium',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            period === 'ytd'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/70',
          ].join(' ')}
        >
          Year-to-Date
        </button>
      </div>

      {/* Operator narrative slot per ADR-024 */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 rounded-md px-3 py-2">
            Station operators can add custom notes about their records here via the Clear Skies
            configuration UI.
          </p>
        </CardContent>
      </Card>

      {loading && (
        <>
          <span className="sr-only" role="status">Loading records…</span>
          <TileSkeleton className="h-48" />
          <TileSkeleton className="h-48" />
        </>
      )}

      {error && <TileError message="Unable to load records" onRetry={refetch} />}

      {!loading && !error && records && (
        <>
          {/* Populated sections from API data */}
          {Object.entries(records.sections).map(([section, entries]) => (
            <Card key={section}>
              <CardHeader>
                <CardTitle className="capitalize">{section} Records</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" aria-label={`${section} records`}>
                    <thead>
                      <tr className="border-b border-border">
                        <th scope="col" className="pb-2 text-left font-semibold text-foreground pr-4">
                          Record
                        </th>
                        <th scope="col" className="pb-2 text-right font-semibold text-foreground pr-4">
                          Value
                        </th>
                        <th scope="col" className="pb-2 text-right font-semibold text-foreground">
                          Date Observed
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
                                title="Broken in the last 30 days"
                                aria-label="Recently broken record"
                              >
                                New
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
                            {formatDate(entry.observedAt)}
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
                No records available for this period.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default RecordsPage;
