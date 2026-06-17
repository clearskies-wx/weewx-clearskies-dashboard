// solar-radiation-card.tsx — Solar Radiation tile for the Now page (T2c.3).
//
// Layout (P7): Recharts AreaChart above (~70%), icon + current value centered below.
//
// Chart:
//   - Rolling 24h window: right edge = current time, left edge = 24h ago.
//   - `radiation` field: orange line (#f7a35c), no fill.
//   - `maxSolarRad` field: yellow area fill (rgba(255,200,50,0.35)) — clear-sky max.
//   - X-axis: compact time ticks (Lexend font). Y-axis: hidden (values implied by chart shape).
//   - Empty archive → "No data" placeholder.
//
// Below chart:
//   - Phosphor sun inline SVG (22px, aria-hidden) + radiation.formatted (Outfit 600, 18px).
//
// A11y (WCAG 2.1 AA — rules/coding.md §5):
//   - Chart container role="img" + aria-label summary.
//   - <table class="sr-only"> fallback for chart data.
//   - Icon is aria-hidden; adjacent text carries meaning.
//   - aria-live="polite" on live value region (SSE updates).
//   - aria-busy on card during loading.
//   - Color not the sole signal: chart lines have distinct shape AND label differences
//     (one is a line, one is a filled area — distinct even without color).
//
// Per ADR-042: zero client-side unit math.
//   - radiation.formatted rendered verbatim.
//   - radiation.label used for unit string.
//   - maxSolarRad is archive field (raw number, W/m²) — no unit conversion needed
//     since it is purely a chart overlay shape, never presented as a standalone value.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from 'recharts';
import { asConverted } from '../api/types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from './ui/card';
import type { Observation, ArchiveRecord } from '../api/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rolling window width in milliseconds (24 hours). */
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Orange: chart radiation line color. */
const COLOR_RADIATION = '#f7a35c';

/** Yellow fill for clear-sky max area. */
const COLOR_MAX_FILL = 'rgba(255,200,50,0.35)';
const COLOR_MAX_STROKE = 'rgba(255,200,50,0.6)';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartPoint {
  ts: number;
  radiation: number | null;
  maxSolarRad: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildChartData(archive: ArchiveRecord[]): ChartPoint[] {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  return archive
    .map((rec) => ({
      ts: new Date(rec.timestamp).getTime(),
      radiation: typeof rec.radiation === 'number' ? rec.radiation : null,
      maxSolarRad: typeof rec.maxSolarRad === 'number' ? rec.maxSolarRad : null,
    }))
    .filter((pt) => pt.ts >= windowStart && pt.ts <= now)
    .sort((a, b) => a.ts - b.ts);
}

/** Format a unix-ms timestamp as a compact time label (e.g. "6a", "12p", "6p"). */
function fmtAxisTime(ts: number): string {
  const h = new Date(ts).getHours();
  if (h === 0) return '12a';
  if (h === 6) return '6a';
  if (h === 12) return '12p';
  if (h === 18) return '6p';
  return '';
}

/** Build hour-boundary ticks for the rolling 24h window. */
function buildTicks(now: number): number[] {
  const windowStart = now - WINDOW_MS;
  const ticks: number[] = [];
  const d = new Date(windowStart);
  const h = d.getHours();
  const nextSix = Math.ceil(h / 6) * 6;
  d.setMinutes(0, 0, 0);
  d.setHours(nextSix);
  for (let t = d.getTime(); t <= now; t += 6 * 3600 * 1000) {
    ticks.push(t);
  }
  return ticks;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SolarSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-32"
      aria-hidden="true"
    />
  );
}

function SolarError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
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
// Sun icon — Phosphor "Sun" fill (path from task spec, 256×256 viewBox)
// aria-hidden: adjacent text carries the accessible meaning.
// ---------------------------------------------------------------------------

function SunIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      style={{ opacity: 0.7, flexShrink: 0 }}
    >
      <path
        fill="currentColor"
        d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Chart component
// ---------------------------------------------------------------------------

interface SolarChartProps {
  data: ChartPoint[];
}

function SolarChart({ data }: SolarChartProps) {
  const { t } = useTranslation('now');
  const now = Date.now();

  const ticks = useMemo(() => buildTicks(now), [now]);

  // Build sr-only table rows — every ~4 data points for brevity
  const srRows = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 8)) === 0);

  if (data.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm text-center py-4"
        aria-label={t('solarRadiationCard.noData')}
      >
        {t('solarRadiationCard.noData')}
      </p>
    );
  }

  const yMax = Math.max(
    ...data.flatMap((d) => [d.radiation, d.maxSolarRad]).filter((v): v is number => v !== null),
    100, // minimum scale
  );

  return (
    <>
      {/* Chart — role="img" wraps for screen-reader summary */}
      <div
        role="img"
        aria-label={t('solarRadiationCard.chartAriaLabel')}
        style={{ flex: 1, minWidth: 0, minHeight: 0, maxHeight: 'var(--card-content-max)', width: '100%', height: '100%' }}
      >
        <ResponsiveContainer width="99%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 6 }}>
            {/* Clear-sky theoretical max — yellow fill area */}
            <Area
              type="monotone"
              dataKey="maxSolarRad"
              stroke={COLOR_MAX_STROKE}
              strokeWidth={1}
              fill={COLOR_MAX_FILL}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* Actual radiation — orange line, no fill */}
            <Area
              type="monotone"
              dataKey="radiation"
              stroke={COLOR_RADIATION}
              strokeWidth={2}
              fill="none"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />

            <XAxis
              dataKey="ts"
              type="number"
              domain={[now - WINDOW_MS, now]}
              ticks={ticks}
              tickFormatter={fmtAxisTime}
              tickLine={false}
              axisLine={false}
              tick={{
                fontFamily: 'var(--font-chart)',
                fontSize: 14,
                fill: 'var(--muted-foreground)',
              }}
              interval={0}
              scale="time"
              height={15}
            />

            <YAxis
              domain={[0, yMax * 1.1]}
              tick={false}
              axisLine={false}
              tickLine={false}
              width={1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Screen-reader fallback table — inline sr-only styles (table sr-only ghost text fix). */}
      <div style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', margin: '-1px', padding: 0, border: 0 }}>
        <table>
          <caption>{t('solarRadiationCard.srCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Solar Radiation (W/m²)</th>
            </tr>
          </thead>
          <tbody>
            {srRows.map((row) => {
              const timeStr = new Intl.DateTimeFormat(undefined, {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              }).format(new Date(row.ts));
              return (
                <tr key={row.ts}>
                  <td>{timeStr}</td>
                  <td>{row.radiation !== null ? Math.round(row.radiation) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SolarRadiationCardProps {
  observation: Observation | null;
  todayArchive: ArchiveRecord[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SolarRadiationCard({
  observation,
  todayArchive,
  loading = false,
  error = null,
  onRetry,
}: SolarRadiationCardProps) {
  const { t } = useTranslation('now');

  const radiationCV = asConverted(observation?.radiation ?? null);
  const radiationFormatted = radiationCV?.formatted ?? '—';
  const radiationLabel = radiationCV?.label ?? '';

  const chartData = useMemo(
    () => buildChartData(todayArchive),
    [todayArchive],
  );

  return (
    <Card footprint="tile" aria-busy={loading} className="min-h-[var(--card-row)]">
      <CardHeader>
        {/* Title: text-only per ADR-050 (no title icon on C4 tiles). Manrope 600 via font-heading. */}
        <CardTitle as="h2">{t('solarRadiationCard.title')}</CardTitle>
      </CardHeader>

      <CardContent className="gap-1">
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loading.solarUv')}</span>
            <SolarSkeleton />
          </>
        ) : error ? (
          <SolarError
            message={t('error.solarUv')}
            onRetry={onRetry ?? (() => undefined)}
          />
        ) : (
          <>
            {/* Upper ~70%: chart */}
            <SolarChart data={chartData} />

            {/* Lower: icon + value, centered */}
            <div
              aria-live="polite"
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
              }}
            >
              <SunIcon size={22} />

              {/* Value — aria-label carries the accessible form with unit */}
              <span
                aria-label={
                  radiationCV !== null
                    ? `${t('solarRadiationCard.title')}: ${radiationFormatted}${radiationLabel ? ' ' + radiationLabel.trim() : ''}`
                    : t('solarRadiationCard.title')
                }
                style={{
                  fontFamily: 'var(--font-display, system-ui, sans-serif)',
                  fontWeight: 600,
                  fontSize: 'var(--text-stat-tile)',
                  color: 'var(--foreground)',
                  letterSpacing: '-0.01em',
                  fontFeatureSettings: '"tnum"',
                  lineHeight: 1,
                }}
              >
                {radiationFormatted}
              </span>

              {radiationLabel && (
                <span
                  aria-hidden="true"
                  style={{
                    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                    fontWeight: 400,
                    fontSize: 'var(--text-label)',
                    color: 'var(--muted-foreground)',
                    lineHeight: 1,
                  }}
                >
                  {radiationLabel.trim()}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
