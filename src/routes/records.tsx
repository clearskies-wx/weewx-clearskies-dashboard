// records.tsx — Records page (/records)
// Semantic <table> with <thead>/<tbody>/<th scope> per coding §5.2.

import { useMockData } from '../mock/index';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';

function formatDate(isoString: string | null): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(isoString));
}

export function RecordsPage() {
  const { records, units } = useMockData();

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Records</h1>
      <p className="text-sm text-muted-foreground">
        Period: <span className="font-medium text-foreground capitalize">{records.period}</span>
      </p>

      {Object.entries(records.sections).map(([section, entries]) => (
        <Card key={section}>
          <CardHeader>
            <CardTitle className="capitalize">{section} Records</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Semantic table per coding §5.2 */}
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
                          ? `${entry.value} ${units.outTemp ?? ''}`
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
    </div>
  );
}
