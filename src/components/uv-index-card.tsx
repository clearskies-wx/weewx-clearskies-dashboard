// uv-index-card.tsx — UV Index tile for the Now page (T2c.4).
//
// Layout (P7): Recharts AreaChart above (~70%), custom UV icon + now/peak values centered below.
//
// Chart:
//   - Fixed daily window: midnight to midnight (NOT rolling).
//   - Predicted bell curve: UV(t) = uvIndexMax * sin²(π*(t-rise)/(set-rise)) using almanac
//     sunrise/sunset + todayForecast.uvIndexMax; area fill with EPA severity gradient
//     (SVG linearGradient, vertical, green at bottom → purple at top).
//   - ReferenceDot marks the current observed UV reading at the current time.
//   - Y-axis: 0–12 (UV scale), ticks at 0/4/8/12.
//   - X-axis: fixed daily window ticks (midnight, 6am, noon, 6pm, midnight+1).
//
// Below chart: flex row, center-justified:
//   - Custom UV icon: Phosphor sun shape with "UV" text knocked out of the center circle.
//   - Two value groups (Now / Peak) with a dot separator between them.
//     Each group: severity dot (color) + value + category abbreviation + label below.
//
// A11y (WCAG 2.1 AA — rules/coding.md §5):
//   - Color is NEVER the sole signal — each severity has both a color chip and a text label.
//   - Chart: role="img" + aria-label, <table class="sr-only"> fallback.
//   - Severity dot is aria-hidden; text label carries accessible meaning.
//   - aria-live="polite" on the value block (SSE live updates for current UV).
//   - aria-busy on card during loading.
//   - UV icon is aria-hidden (decorative; adjacent labels describe values).
//
// Per ADR-042: zero client-side unit math.
//   - UV.formatted from observation rendered verbatim where available.
//   - UV field from archive is raw number (dimensionless index) — no conversion needed.
//
// UV utilities: src/utils/uv.ts — UV_SEGMENTS, getUvSegment(), getUvLabel().
//
// DataBag pattern (T0B.2): card self-extracts from:
//   dataBag["/api/v1/current"]  (observation)
//   dataBag["/api/v1/forecast"] (todayForecast.uvIndexMax)
//   dataBag["/api/v1/almanac"]  (sunrise/sunset)
// onRetry removed — page container manages data freshness in the DataBag model.

import { useMemo, useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceDot,
  ResponsiveContainer,
} from 'recharts';
import { asConverted } from '../api/types';
import { getUvSegment } from '../utils/uv';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from './ui/card';
import type { Observation, AlmanacSnapshot, ForecastBundle } from '../api/types';
import type { CardComponentProps } from '../lib/card-registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// UV_Y_MAX and UV_Y_TICKS were removed in favour of dynamic computation
// (see buildYAxisScale below). Y-axis max is now one unit above the peak UV
// forecast value so the curve fills the chart height rather than sitting flat.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UvChartPoint {
  ts: number;
  uv: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * stationMidnightMs — computes the Unix timestamp (ms) of today's midnight in
 * the station's local timezone (ADR-075 T3.8).
 *
 * Strategy: format today's date as "YYYY-MM-DD" in the station tz, then parse
 * it as a UTC midnight ISO string. The difference from true UTC midnight is the
 * station's UTC offset, which positions the window correctly on the UTC timeline.
 */
function stationMidnightMs(stationTz: string): number {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: stationTz }).format(Date.now());
  return new Date(todayStr + 'T00:00:00Z').getTime();
}

/**
 * buildUvBellCurve — synthesises a predicted UV day curve from forecast data.
 *
 * Formula (EPA sinusoidal model):
 *   UV(t) = uvIndexMax * sin²(π * (t − sunrise) / (sunset − sunrise))
 *   for t ∈ [sunrise, sunset]; 0 outside that window.
 *
 * Points are generated every 15 minutes from midnight to midnight (97 points).
 * When sunrise/sunset strings are unavailable, sensible defaults are used
 * (06:00–20:00 local time) so the chart always renders a curve shape.
 *
 * @param uvIndexMax   Forecast UV peak for the day (from /forecast daily[0]).
 * @param sunriseIso   ISO-8601 string for today's sunrise, or null.
 * @param sunsetIso    ISO-8601 string for today's sunset, or null.
 * @param stationTz    IANA timezone for the station (ADR-075 T3.8).
 */
function buildUvBellCurve(
  uvIndexMax: number | null,
  sunriseIso: string | null,
  sunsetIso: string | null,
  stationTz: string,
): UvChartPoint[] {
  const peak = uvIndexMax ?? 0;

  // When peak UV is unknown or zero (e.g. forecast not yet loaded after a page refresh,
  // or genuinely zero overnight), return a flat-zero curve spanning the full day window
  // rather than an empty array. This keeps the chart frame and axes visible so the
  // ReferenceDot for the current observed UV reading can still render immediately.
  // UvChart shows "No data" only when BOTH data is empty AND currentUv is null —
  // so this flat baseline is the correct fallback when observation data may exist.
  if (peak <= 0) {
    // ADR-075 T3.8: midnight is station-local, not browser-local.
    const midnightFlatMs = stationMidnightMs(stationTz);
    const endFlatMs = midnightFlatMs + 24 * 60 * 60 * 1000;
    const FLAT_INTERVAL_MS = 15 * 60 * 1000;
    const flatPoints: UvChartPoint[] = [];
    for (let ts = midnightFlatMs; ts <= endFlatMs; ts += FLAT_INTERVAL_MS) {
      flatPoints.push({ ts, uv: 0 });
    }
    return flatPoints;
  }

  // ADR-075 T3.8: midnight is station-local, not browser-local.
  const midnightMs = stationMidnightMs(stationTz);
  const endMs = midnightMs + 24 * 60 * 60 * 1000;

  // Parse sunrise/sunset — fall back to 06:00/20:00 local when unavailable
  // or when the timestamps fall outside today's window. useSmartAlmanac
  // switches to tomorrow's sun data after sunset+2hr, which puts sunrise
  // past the chart's midnight-to-midnight range and zeros the entire curve.
  const defaultRise = midnightMs + 6 * 3600 * 1000;
  const defaultSet  = midnightMs + 20 * 3600 * 1000;
  let sunriseMs = sunriseIso ? new Date(sunriseIso).getTime() : defaultRise;
  let sunsetMs  = sunsetIso  ? new Date(sunsetIso).getTime()  : defaultSet;
  if (Number.isNaN(sunriseMs) || sunriseMs < midnightMs || sunriseMs > endMs) {
    sunriseMs = defaultRise;
  }
  if (Number.isNaN(sunsetMs) || sunsetMs < midnightMs || sunsetMs > endMs) {
    sunsetMs = defaultSet;
  }

  const spanMs = sunsetMs - sunriseMs;

  const INTERVAL_MS = 15 * 60 * 1000; // 15-minute steps
  const points: UvChartPoint[] = [];

  for (let ts = midnightMs; ts <= endMs; ts += INTERVAL_MS) {
    let uv: number;
    if (peak <= 0 || spanMs <= 0 || ts < sunriseMs || ts > sunsetMs) {
      uv = 0;
    } else {
      const ratio = (ts - sunriseMs) / spanMs; // 0 → 1 across the day
      uv = peak * Math.pow(Math.sin(Math.PI * ratio), 2);
      // Round to 1 decimal — matches the precision of a UV index reading.
      uv = Math.round(uv * 10) / 10;
    }
    points.push({ ts, uv });
  }

  return points;
}

/**
 * Returns the daily-window domain and ticks (midnight to next midnight).
 * ADR-075 T3.8: midnight is computed in station timezone, not browser timezone.
 */
function buildDailyDomainAndTicks(stationTz: string): { domain: [number, number]; ticks: number[] } {
  const midnightMs = stationMidnightMs(stationTz);
  const endMs = midnightMs + 24 * 60 * 60 * 1000;

  return {
    domain: [midnightMs, endMs],
    ticks: [0, 6, 12, 18, 24].map((h) => midnightMs + h * 3600 * 1000),
  };
}

function fmtDailyAxisTime(ts: number): string {
  const h = new Date(ts).getHours();
  if (h === 0) return '12a';
  if (h === 6) return '6a';
  if (h === 12) return '12p';
  if (h === 18) return '6p';
  return '';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UvSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-32"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Custom UV icon — Phosphor sun shape with "UV" text knocked out of the center.
//
// ViewBox: 0 0 256 256 (matches Phosphor icon system).
// Sun rays: 8 filled rectangles rotated around center.
// Center circle: stroke-only ring (no fill) — "UV" text sits centered inside.
// "UV" text: Outfit 700, knocked out (white on transparent so it reads over any bg).
//
// aria-hidden: this is a decorative graphic; the adjacent value+label text carries
// all accessible information.
// ---------------------------------------------------------------------------

function UvIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
    >
      {/* Sun rays — 8 rectangles rotated around center */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <rect
          key={deg}
          x="120"
          y="8"
          width="16"
          height="38"
          rx="8"
          fill="currentColor"
          transform={`rotate(${deg} 128 128)`}
        />
      ))}

      {/* Center circle — stroke-only ring (no fill, so background shows through) */}
      <circle
        cx="128"
        cy="128"
        r="64"
        fill="none"
        stroke="currentColor"
        strokeWidth="14"
      />

      {/* "UV" text — Outfit 700, centered in the ring */}
      <text
        x="128"
        y="142"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="var(--font-display, system-ui, sans-serif)"
        fontWeight="700"
        fontSize="46"
        letterSpacing="-1"
      >
        UV
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Severity dot — WCAG-adjusted EPA color chip.
// aria-hidden: the sibling text label conveys the category (WCAG 1.4.1).
// ---------------------------------------------------------------------------

function SeverityDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '0.6rem',
        height: '0.6rem',
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
        alignSelf: 'center',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// UV value group — "Now" or "Peak"
// ---------------------------------------------------------------------------

interface UvValueGroupProps {
  /** The UV index numeric value (null = unavailable). */
  uv: number | null;
  /** Translated label string for the UV severity level. */
  levelLabel: string;
  /** "Now" or "Peak" — translated sub-label shown below the value. */
  subLabel: string;
  /** Abbreviated category text (max ~4 chars) shown next to the value. */
  categoryAbbr: string;
}

function UvValueGroup({ uv, levelLabel, subLabel, categoryAbbr }: UvValueGroupProps) {
  const segment = getUvSegment(uv);
  const dotColor = segment?.color ?? '#888';

  return (
    // Group carries the full accessible description via aria-label
    <div
      aria-label={
        uv !== null
          ? `${subLabel}: UV ${uv}, ${levelLabel}`
          : `${subLabel}: not available`
      }
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.1rem',
      }}
    >
      {/* Value row: dot + number + abbreviation */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        <SeverityDot color={dotColor} />
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--font-display, system-ui, sans-serif)',
            fontWeight: 600,
            fontSize: 'var(--text-secondary)',
            color: 'var(--foreground)',
            fontFeatureSettings: '"tnum"',
            lineHeight: 1,
          }}
        >
          {uv !== null ? uv : '—'}
        </span>
        {uv !== null && categoryAbbr && (
          <span
            aria-hidden="true"
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontWeight: 400,
              fontSize: 'var(--text-micro)',
              color: 'var(--muted-foreground)',
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            {categoryAbbr}
          </span>
        )}
      </div>

      {/* Sub-label: "Now" / "Peak" */}
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
          fontWeight: 400,
          fontSize: 'var(--text-micro)',
          color: 'var(--muted-foreground)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          lineHeight: 1,
        }}
      >
        {subLabel}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UV Chart component
// ---------------------------------------------------------------------------

interface UvChartProps {
  data: UvChartPoint[];
  /** Current observed UV value for the ReferenceDot. */
  currentUv: number | null;
  /** Stable gradient ID to avoid collision when multiple charts on page. */
  gradientId: string;
  /** Forecast peak UV — used to compute dynamic Y-axis max and ticks. */
  peakUv: number | null;
  /** IANA timezone identifier for the station (ADR-075 T3.8). */
  stationTz: string;
}

function UvChart({ data, currentUv, gradientId, peakUv, stationTz }: UvChartProps) {
  const { t } = useTranslation('now');
  const { domain, ticks } = useMemo(() => buildDailyDomainAndTicks(stationTz), [stationTz]);

  // Dynamic Y-axis: one unit above the forecast peak, minimum ceiling of 4.
  // e.g. peakUv=9 → yMax=10, ticks=[0,2,4,6,8,10]
  // e.g. peakUv=5 → yMax=6,  ticks=[0,2,4,6]
  const yMax = Math.max(Math.ceil((peakUv ?? 0) + 1), 4);
  const yTicks = Array.from(
    { length: Math.ceil(yMax / 2) + 1 },
    (_, i) => i * 2,
  ).filter((t) => t <= yMax);

  // Build sr-only table rows — every ~4 data points
  const srRows = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 8)) === 0);

  // Current time — X coordinate for the ReferenceDot (observed UV now).
  // Memoised so it doesn't shift on every render within the same mount.
  const nowTs = useMemo(() => Date.now(), []);

  // Show "No data" only when there is genuinely nothing to display:
  // no bell curve AND no current observation. When we have a currentUv but the
  // forecast hasn't loaded yet, buildUvBellCurve returns a flat-zero baseline
  // (never an empty array), so this branch is reserved for true no-data states
  // (nighttime with no UV sensor, sensor offline, etc.).
  if (data.length === 0 && currentUv === null) {
    return (
      <p
        className="text-muted-foreground text-center py-4"
        style={{ fontSize: 'var(--text-body)' }}
        aria-label={t('uvIndexCard.noData')}
      >
        {t('uvIndexCard.noData')}
      </p>
    );
  }

  return (
    <>
      {/* Chart — role="img" wraps for screen-reader summary */}
      {/* margin.top on AreaChart adds space inside the SVG between the card title and the chart
          area. The Recharts margin is the correct mechanism here — it pushes content down within
          the SVG rather than creating a CSS gap between the title and the chart container. */}
      <div role="img" aria-label={t('uvIndexCard.chartAriaLabel')} style={{ flex: 1, minWidth: 0, minHeight: 0, maxHeight: 'var(--card-content-max)', width: '100%', height: '100%' }}>
        <ResponsiveContainer width="99%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 12, bottom: 0, left: 12 }}>
            <defs>
              {/*
                Vertical linearGradient: EPA UV severity colors.
                y1=1 (bottom, UV=0 → Low green) to y2=0 (top, UV=12 → Extreme purple).
                Gradient stops correspond to the EPA band edges (0–12 scale mapped to 0–100%).
              */}
              <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0" gradientUnits="objectBoundingBox">
                {/* Low (0–2): ~0–17% of scale */}
                <stop offset="0%" stopColor="#1A7A1A" stopOpacity={0.8} />
                {/* Moderate (3–5): ~25–42% */}
                <stop offset="25%" stopColor="#B8A000" stopOpacity={0.8} />
                {/* High (6–7): ~50–58% */}
                <stop offset="50%" stopColor="#C45E00" stopOpacity={0.85} />
                {/* Very High (8–10): ~67–83% */}
                <stop offset="67%" stopColor="#CC0000" stopOpacity={0.85} />
                {/* Extreme (11+): ~92–100% */}
                <stop offset="92%" stopColor="#6B2D8B" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#6B2D8B" stopOpacity={0.9} />
              </linearGradient>
            </defs>

            {/* UV area with EPA gradient fill */}
            <Area
              type="monotone"
              dataKey="uv"
              stroke="rgba(100,100,200,0.6)"
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />

            <XAxis
              dataKey="ts"
              type="number"
              domain={domain}
              ticks={ticks}
              tickFormatter={fmtDailyAxisTime}
              tickLine={false}
              axisLine={false}
              tick={{
                fontFamily: 'var(--font-chart)',
                fontSize: 11,
                fill: 'var(--muted-foreground)',
              }}
              interval={0}
              scale="time"
              height={24}
            />

            <YAxis
              domain={[0, yMax]}
              ticks={yTicks}
              tickLine={false}
              axisLine={false}
              tick={{
                fontFamily: 'var(--font-chart)',
                fontSize: 11,
                fill: 'var(--muted-foreground)',
              }}
              width={16}
            />

            {/* ReferenceDot: marks current observed UV on the chart at the current time */}
            {currentUv !== null && (
              <ReferenceDot
                x={nowTs}
                y={currentUv}
                r={5}
                fill={getUvSegment(currentUv)?.color ?? '#888'}
                stroke="var(--background)"
                strokeWidth={1.5}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Screen-reader fallback table — inline sr-only styles (table sr-only ghost text fix). */}
      <div style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', margin: '-1px', padding: 0, border: 0 }}>
        <table>
          <caption>{t('uvIndexCard.srCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">UV Index</th>
            </tr>
          </thead>
          <tbody>
            {srRows.map((row) => {
              const timeStr = new Intl.DateTimeFormat(undefined, {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: stationTz,
              }).format(new Date(row.ts));
              return (
                <tr key={row.ts}>
                  <td>{timeStr}</td>
                  <td>{row.uv !== null ? row.uv : '—'}</td>
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
// Dot separator between Now and Peak groups
// ---------------------------------------------------------------------------

function GroupSeparator() {
  return (
    <span
      aria-hidden="true"
      style={{
        color: 'var(--muted-foreground)',
        fontSize: 'var(--text-stat-label)',
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      ·
    </span>
  );
}

// ---------------------------------------------------------------------------
// Legacy props interface — kept for any non-Now-page callers.
// ---------------------------------------------------------------------------

export interface UvIndexCardProps {
  observation: Observation | null;
  /** Today's daily forecast — used to show the forecast UV peak and for the predicted bell curve. */
  todayForecast: { uvIndexMax?: number | null } | null;
  /** Almanac sunrise time (ISO-8601 string) — shapes the bell curve left edge. Null = use 06:00 default. */
  sunrise: string | null;
  /** Almanac sunset time (ISO-8601 string) — shapes the bell curve right edge. Null = use 20:00 default. */
  sunset: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** IANA timezone identifier for the station (ADR-075 T3.8). */
  stationTz?: string;
}

// ---------------------------------------------------------------------------
// Core render logic (shared by both prop shapes)
// ---------------------------------------------------------------------------

function UvIndexCardContent({
  observation,
  todayForecast,
  sunrise,
  sunset,
  loading = false,
  error = null,
  stationTz = 'UTC',
}: Omit<UvIndexCardProps, 'onRetry'>) {
  const { t } = useTranslation('now');

  // Stable gradient ID — avoids SVG ID collisions if multiple instances on page.
  // useId() returns a stable server/client-consistent identifier (React 18+).
  const gradientId = `uv-grad-${useId().replace(/:/g, '')}`;

  // Current observed UV — normalise via asConverted (ADR-042)
  const uvCV = asConverted(observation?.UV ?? null);
  const currentUv = uvCV?.value ?? null;

  // Current UV category
  const currentSegment = getUvSegment(currentUv);
  const currentLevelLabel = currentSegment !== null ? t(currentSegment.labelKey) : '';
  // Abbreviated: first word of the label (e.g. "Very High" → "Very" is too long; use label key abbreviations)
  const currentAbbr = currentSegment?.label ?? '';

  // Forecast UV peak
  const forecastUv = todayForecast?.uvIndexMax ?? null;
  const forecastSegment = getUvSegment(forecastUv);
  const forecastLevelLabel = forecastSegment !== null ? t(forecastSegment.labelKey) : '';
  const forecastAbbr = forecastSegment?.label ?? '';

  const chartData = useMemo(
    () => buildUvBellCurve(forecastUv, sunrise, sunset, stationTz),
    [forecastUv, sunrise, sunset, stationTz],
  );

  return (
    <Card footprint="tile" aria-busy={loading} className="min-h-[var(--card-row)]">
      <CardHeader>
        {/* Title: text-only per ADR-050 (no title icon on C4 tiles). Manrope 600 via font-heading. */}
        <CardTitle as="h2">{t('uvIndexCard.title')}</CardTitle>
      </CardHeader>

      <CardContent className="gap-1">
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loading.solarUv')}</span>
            <UvSkeleton />
          </>
        ) : error ? (
          <p
            role="alert"
            className="text-muted-foreground"
            style={{ fontSize: 'var(--text-body)' }}
          >
            {t('error.solarUv')}
          </p>
        ) : (
          <>
            {/* Upper ~70%: chart */}
            <UvChart
              data={chartData}
              currentUv={currentUv}
              gradientId={gradientId}
              peakUv={forecastUv}
              stationTz={stationTz}
            />

            {/* Lower: custom UV icon + Now/Peak value groups */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                flexShrink: 0,
              }}
            >
              {/* Custom UV icon — 36px tall, decorative, aria-hidden */}
              <span className="text-muted-foreground"><UvIcon size={36} /></span>

              {/* Now / Peak value groups with dot separator — aria-live for SSE updates */}
              <div
                aria-live="polite"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <UvValueGroup
                  uv={currentUv}
                  levelLabel={currentLevelLabel}
                  subLabel={t('uvIndexCard.nowLabel')}
                  categoryAbbr={currentAbbr}
                />

                <GroupSeparator />

                <UvValueGroup
                  uv={forecastUv}
                  levelLabel={forecastLevelLabel}
                  subLabel={t('uvIndexCard.peakLabel')}
                  categoryAbbr={forecastAbbr}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DataBag-aware component (CardComponentProps — T0B.2 contract)
// ---------------------------------------------------------------------------

export function UvIndexCard(props: CardComponentProps): React.ReactElement;
export function UvIndexCard(props: UvIndexCardProps): React.ReactElement;
export function UvIndexCard(props: CardComponentProps | UvIndexCardProps): React.ReactElement {
  if ('dataBag' in props) {
    // DataBag path — self-extract from /api/v1/current, /api/v1/forecast, /api/v1/almanac
    const currentData = props.dataBag['/api/v1/current'] as {
      data?: Observation | null;
      loading?: boolean;
      error?: unknown;
    } | undefined;
    const forecastData = props.dataBag['/api/v1/forecast'] as {
      data?: ForecastBundle | null;
    } | undefined;
    const almanacData = props.dataBag['/api/v1/almanac'] as {
      data?: AlmanacSnapshot | null;
    } | undefined;

    const todayForecast = forecastData?.data?.daily?.[0] ?? null;
    const sunrise = almanacData?.data?.sun?.rise ?? null;
    const sunset = almanacData?.data?.sun?.set ?? null;

    return (
      <UvIndexCardContent
        observation={currentData?.data ?? null}
        todayForecast={todayForecast}
        sunrise={sunrise}
        sunset={sunset}
        loading={currentData?.loading ?? true}
        error={currentData?.error ? 'error' : null}
        stationTz={props.stationTz}
      />
    );
  }
  // Legacy path — explicit props
  return (
    <UvIndexCardContent
      observation={props.observation}
      todayForecast={props.todayForecast}
      sunrise={props.sunrise}
      sunset={props.sunset}
      loading={props.loading}
      error={props.error}
      stationTz={props.stationTz}
    />
  );
}

export default UvIndexCard;

// Re-export UV utilities for callers that need them alongside this component.
export { UV_SEGMENTS, getUvSegment } from '../utils/uv';
