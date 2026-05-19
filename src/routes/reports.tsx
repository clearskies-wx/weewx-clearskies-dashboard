// reports.tsx — Reports page (/reports)
// Year/month selects (disabled) + placeholder message per task spec.

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';

export function ReportsPage() {
  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Reports</h1>

      <Card>
        <CardHeader>
          <CardTitle>NOAA Monthly Reports</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Year/month selects — disabled until wired to real API */}
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
                disabled
                className={[
                  'rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'text-muted-foreground cursor-not-allowed opacity-60',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                ].join(' ')}
                aria-label="Select report year"
              >
                <option value="">— Select year —</option>
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
                disabled
                className={[
                  'rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'text-muted-foreground cursor-not-allowed opacity-60',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                ].join(' ')}
                aria-label="Select report month"
              >
                <option value="">— Select month —</option>
              </select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            No NOAA reports found — Reports page will hide when wired to the API.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
