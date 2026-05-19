// charts.tsx — Charts page (/charts)
// Tab strip + Recharts LineChart with sr-only data table fallback per coding §5.5.

import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// 24 mock temperature data points cycling 62–78°F
const CHART_DATA = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  temp: Math.round(62 + ((78 - 62) * Math.abs(Math.sin((i / 24) * Math.PI))) * 0.9 + (i % 3)),
}));

const TABS = ['Homepage', 'Monthly', 'Annual', 'Avg Climate'] as const;

export function ChartsPage() {
  // Simple uncontrolled active tab — "Homepage" is always active in this stub.
  // Full tab widget per ARIA APG Tabs pattern is deferred to phase 4 implementation.

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Charts</h1>

      {/* Tab strip — button group, not full ARIA tab widget yet */}
      <div
        role="group"
        aria-label="Chart group selection"
        className="flex gap-1 overflow-x-auto pb-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={tab === 'Homepage'}
            className={[
              'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'min-h-[36px]',
              tab === 'Homepage'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Temperature chart */}
      <Card>
        <CardHeader>
          <CardTitle>Temperature — Last 24 Hours</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Chart container with aria-label per coding §5.5 */}
          <div
            aria-label="Temperature over the last 24 hours"
            className="h-64 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={CHART_DATA}
                margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
              >
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11 }}
                  interval={3}
                  stroke="var(--color-muted-foreground)"
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  domain={['auto', 'auto']}
                  stroke="var(--color-muted-foreground)"
                  tickLine={false}
                  width={32}
                  tickFormatter={(v) => `${v}°`}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}°F`, 'Temperature']}
                  contentStyle={{
                    background: 'var(--color-popover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    color: 'var(--color-popover-foreground)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="temp"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Screen-reader-only data table per coding §5.5 */}
          <table className="sr-only">
            <caption>Temperature readings over the last 24 hours</caption>
            <thead>
              <tr>
                <th scope="col">Hour</th>
                <th scope="col">Temperature (°F)</th>
              </tr>
            </thead>
            <tbody>
              {CHART_DATA.map((point) => (
                <tr key={point.hour}>
                  <td>{point.hour}</td>
                  <td>{point.temp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
