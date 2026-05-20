import { useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useArchive, useStation } from '../hooks/useWeatherData';

const TABS = [
  { id: 'homepage', label: 'Homepage' },
  { id: 'averageclimate', label: 'Average Climate' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'annual', label: 'Annual' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const RANGES = ['1d', '3d', '7d', '30d', '90d'] as const;
type RangeId = (typeof RANGES)[number];

function rangeToFromParam(range: RangeId): string {
  const now = new Date();
  const map: Record<RangeId, number> = {
    '1d': 1,
    '3d': 3,
    '7d': 7,
    '30d': 30,
    '90d': 90,
  };
  const days = map[range];
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return from.toISOString();
}

function formatXAxisHour(isoString: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true,
    timeZone,
  }).format(new Date(isoString));
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
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

export function ChartsPage() {
  const { data: station } = useStation();
  const tz = station?.timezone ?? 'UTC';
  const [activeTab, setActiveTab] = useState<TabId>('homepage');
  const [activeRange, setActiveRange] = useState<RangeId>('1d');
  const [showTable, setShowTable] = useState(false);
  const [tabsCanScrollRight, setTabsCanScrollRight] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabScrollRef = useRef<HTMLDivElement | null>(null);

  // Detect whether the tab row overflows so we can show a fade indicator
  useLayoutEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;

    function checkOverflow() {
      if (!el) return;
      setTabsCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }

    checkOverflow();
    el.addEventListener('scroll', checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkOverflow);
      ro.disconnect();
    };
  }, []);

  // useMemo so that archiveFrom only changes when activeRange changes, not on every render.
  // Without this, rangeToFromParam returns a new Date() each render, producing a new ISO
  // string every millisecond. That string flows into useArchive's deps array, triggering
  // a refetch on every render → setLoading(true) → re-render → new string → infinite loop.
  const archiveFrom = useMemo(() => rangeToFromParam(activeRange), [activeRange]);
  const { data: archiveData, loading: archiveLoading, error: archiveError, refetch: archiveRefetch } = useArchive({
    from: archiveFrom,
  });

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      if (e.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
      else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = TABS.length - 1;

      if (nextIndex !== null) {
        e.preventDefault();
        setActiveTab(TABS[nextIndex].id);
        tabRefs.current[nextIndex]?.focus();
      }
    },
    []
  );

  const chartData = (archiveData ?? []).map((record) => ({
    timestamp: record.timestamp,
    temp: record.outTemp,
  }));

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <h1 className="sr-only">Charts</h1>

      {/* WAI-ARIA Tabs */}
      <div className="relative">
        <div
          ref={tabScrollRef}
          role="tablist"
          aria-label="Chart group selection"
          className="flex gap-1 overflow-x-auto pb-1"
        >
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={[
                'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'min-h-[44px] md:min-h-0',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-muted/70',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Scroll fade indicator — visible only when content overflows right */}
        {tabsCanScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent"
          />
        )}
      </div>

      {/* Homepage Tab Panel */}
      <div
        role="tabpanel"
        id="panel-homepage"
        aria-labelledby="tab-homepage"
        hidden={activeTab !== 'homepage'}
      >
        {/* Range Selector */}
        <div
          className="flex gap-1 mb-4"
          role="group"
          aria-label="Time range selection"
        >
          {RANGES.map((range) => (
            <Button
              key={range}
              type="button"
              variant={activeRange === range ? 'default' : 'outline'}
              size="sm"
              aria-pressed={activeRange === range}
              onClick={() => setActiveRange(range)}
              className="min-h-[44px] md:min-h-0"
            >
              {range}
            </Button>
          ))}
        </div>

        {/* Temperature Chart Card */}
        <Card aria-busy={archiveLoading}>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-heading text-base leading-snug font-medium">Temperature — Last {activeRange}</h2>
            <button
              type="button"
              onClick={() => setShowTable((prev) => !prev)}
              aria-pressed={showTable}
              className="inline-flex items-center min-h-[44px] md:min-h-0 px-3 py-2 text-sm text-muted-foreground rounded-md border border-border hover:text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {showTable ? 'Show chart' : 'Show data table'}
            </button>
          </CardHeader>
          <CardContent>
            {archiveLoading ? (
              <>
                <span className="sr-only" role="status">Loading chart data…</span>
                <TileSkeleton className="h-[350px]" />
              </>
            ) : archiveError ? (
              <TileError message="Unable to load chart data" onRetry={archiveRefetch} />
            ) : archiveData && archiveData.length > 0 ? (
              showTable ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Temperature readings over the selected range</caption>
                    <thead>
                      <tr className="border-b border-border">
                        <th scope="col" className="py-2 px-3 text-left font-medium text-muted-foreground">Time</th>
                        <th scope="col" className="py-2 px-3 text-right font-medium text-muted-foreground">Temperature (°F)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archiveData.map((record) => (
                        <tr key={record.timestamp} className="border-b border-border last:border-0">
                          <td className="py-1.5 px-3 text-foreground">{formatXAxisHour(record.timestamp, tz)}</td>
                          <td className="py-1.5 px-3 text-right text-foreground font-[tabular-nums]">{record.outTemp}°F</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <div
                    role="figure"
                    aria-label={`Temperature over the last ${activeRange}`}
                    className="h-[350px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--color-border)"
                          opacity={0.5}
                        />
                        <XAxis
                          dataKey="timestamp"
                          tickFormatter={(v) => formatXAxisHour(v, tz)}
                          tick={{ fontSize: 11 }}
                          interval={7}
                          stroke="var(--color-muted-foreground)"
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          domain={['auto', 'auto']}
                          stroke="var(--color-muted-foreground)"
                          tickLine={false}
                          width={40}
                          tickFormatter={(v) => `${v}°`}
                          unit="°F"
                        />
                        <Tooltip
                          formatter={(value) => [
                            typeof value === 'number' ? `${value}°F` : String(value),
                            'Temperature',
                          ]}
                          labelFormatter={(label) => formatXAxisHour(String(label), tz)}
                          contentStyle={{
                            background: 'var(--color-popover)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px',
                            color: 'var(--color-popover-foreground)',
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="temp"
                          name="Temperature"
                          stroke="var(--color-primary)"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={!reducedMotion}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* sr-only data table for screen readers when chart is visible */}
                  <table className="sr-only">
                    <caption>Temperature readings over the selected range</caption>
                    <thead>
                      <tr>
                        <th scope="col">Time</th>
                        <th scope="col">Temperature (°F)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archiveData.map((record) => (
                        <tr key={record.timestamp}>
                          <td>{formatXAxisHour(record.timestamp, tz)}</td>
                          <td>{record.outTemp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">No chart data available for this range.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Average Climate Tab Panel */}
      <div
        role="tabpanel"
        id="panel-averageclimate"
        aria-labelledby="tab-averageclimate"
        hidden={activeTab !== 'averageclimate'}
      >
        <h2 className="sr-only">Average Climate Charts</h2>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Coming soon — Average Climate charts will be available when historical data is connected.
          </CardContent>
        </Card>
      </div>

      {/* Monthly Tab Panel */}
      <div
        role="tabpanel"
        id="panel-monthly"
        aria-labelledby="tab-monthly"
        hidden={activeTab !== 'monthly'}
      >
        <h2 className="sr-only">Monthly Charts</h2>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Coming soon — Monthly charts will be available when historical data is connected.
          </CardContent>
        </Card>
      </div>

      {/* Annual Tab Panel */}
      <div
        role="tabpanel"
        id="panel-annual"
        aria-labelledby="tab-annual"
        hidden={activeTab !== 'annual'}
      >
        <h2 className="sr-only">Annual Charts</h2>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Coming soon — Annual charts will be available when historical data is connected.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ChartsPage;
