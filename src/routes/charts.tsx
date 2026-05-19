import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const CHART_DATA = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  temp: Math.round(62 + ((78 - 62) * Math.abs(Math.sin((i / 24) * Math.PI))) * 0.9 + (i % 3)),
}));

const TABS = ['Homepage', 'Monthly', 'Annual', 'Avg Climate'] as const;

export function ChartsPage() {
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Charts</h1>

      {/* Tab strip */}
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
                : 'bg-muted text-foreground hover:bg-muted/70',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Temperature chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Temperature — Last 24 Hours</CardTitle>
          <button
            type="button"
            onClick={() => setShowTable((prev) => !prev)}
            aria-pressed={showTable}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded px-1 py-0.5"
          >
            {showTable ? 'Show chart' : 'Show data table'}
          </button>
        </CardHeader>
        <CardContent>
          {showTable ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Temperature readings over the last 24 hours</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="py-2 px-3 text-left font-medium text-muted-foreground">Hour</th>
                    <th scope="col" className="py-2 px-3 text-right font-medium text-muted-foreground">Temperature (°F)</th>
                  </tr>
                </thead>
                <tbody>
                  {CHART_DATA.map((point) => (
                    <tr key={point.hour} className="border-b border-border last:border-0">
                      <td className="py-1.5 px-3 text-foreground">{point.hour}</td>
                      <td className="py-1.5 px-3 text-right text-foreground" style={{ fontFeatureSettings: '"tnum"' }}>{point.temp}°F</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div
                role="figure" aria-label="Temperature over the last 24 hours"
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
                      formatter={(value) => [typeof value === "number" ? `${value}°F` : String(value), "Temperature"]}
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

              {/* sr-only fallback for screen readers when chart is visible */}
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ChartsPage;
