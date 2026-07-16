// SurfingTab.tsx — Surfing activity tab content (MARINE-FIXIT-PLAN Phase 5 REDO).
//
// COMPLETE REWRITE — the previous implementation (commit 51ffd19) had seven
// defects identified by the lead:
//   1. Cards in bare flex column, not <Grid> — footprints did nothing
//   2. Score card missing rowSpan={2} (not a 2×2 hero)
//   3. windQualityScore: `case 'cross':` — API returns "Cross-shore" (capital C,
//      hyphen). Match never fired → score was always 0
//   4. waveHeightScore: `feet <= 2 → return 0` — 1.7 ft surf scored zero
//   5. Swell source: `multiSwell ?? spectralComponents` — fell back to raw NDBC
//   6. Energy display: `formatValue(energy, 'default')` → rounded to "0.0"
//   7. Wind quality label: case-mismatch prevented correct display
//
// Card order:
//   AlertsPanel (full width, outside Grid)
//   Grid {
//     Surf Score  footprint="wide"  rowSpan={2}  — 2×2 hero
//     Swell       footprint="wide"              — 2×1
//     Wind        footprint="wide"              — 2×1
//   }
//   Grid {
//     72-Hour Forecast  footprint="full"         — full width
//   }
//   Grid {
//     Tide Forecast     footprint="full"         — full width
//   }
//
// Data sources:
//   useSurfDetail(locationId)  — /surf/{id}: forecast[], tidePredictions[]
//   useMarineDetail(locationId) — /marine/{id}: observation (live wind)
//   useStation() — timezone for date/time formatting
//
// Swell rule (FAIL CONDITION): NEVER use data.spectralComponents. Only
// forecast[0].multiSwell. If null/empty → "No model swell data available".
//
// A11y (rules/coding.md §5):
//   - All card headings are <h3> via CardTitle as="h3"
//   - NumericScoreBadge: digit aria-hidden, sr-only "N of 5" before qualityLabel
//   - Color is never the only signal (always paired with number + text label)
//   - Scoring bars are aria-hidden (decorative); score number is visible
//   - Compass: role="img" + <title>; center stats have sr-only labels
//   - Swell list: primary swell has sr-only "primary swell" label
//   - Charts: ChartContainer (role=img + aria-label) + sr-only data table
//   - Tide arrows (↑↓) aria-hidden, always paired with "High"/"Low" text
//   - All interactive elements keyboard-reachable

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis } from 'recharts';
import { Waves, Wind } from '@phosphor-icons/react';
import { useSurfDetail, useMarineDetail, useStation } from '../../../hooks/useWeatherData';
import { formatValue } from '../../../utils/format';
import { formatNumber } from '../../../utils/format-number';
import { formatTime } from '../../../utils/format-date';
import { cardinalFromDegrees } from '../../../utils/wind';
import { Grid } from '../../../components/layout/grid';
import { ChartContainer } from '../../charts/chart-container';
import { HorizontalScrollNav } from '../../ui/horizontal-scroll-nav';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { MarineStatTile } from '../shared/MarineStatTile';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';
import { buildHourTicks } from './shared/hour-ticks';
import type {
  SpectralWaveComponent,
  SurfForecast,
  MarineAlertSummary,
  MarineForecastPoint,
  TidePrediction,
} from '../../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurfingTabProps {
  locationId: string;
  alerts?: MarineAlertSummary[];
}

// ---------------------------------------------------------------------------
// Alert filtering — DASHBOARD-MANUAL §12 "Activity-relevant alert filtering":
// Surfing shows marine zone alerts + beach hazard alerts. `alertType` is a
// closed 3-value server-side bucket — NOT a per-NWS-product-type string.
// ---------------------------------------------------------------------------

const SURFING_ALERT_TYPES = new Set(['marineZone', 'beachHazard']);

// ---------------------------------------------------------------------------
// Shared skeleton / error helpers
// ---------------------------------------------------------------------------

function TileSkeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`} aria-hidden="true" />;
}

function InlineError({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) {
  return (
    <div role="alert" className="flex flex-col gap-2 items-start" style={{ fontSize: 'var(--text-body)' }}>
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded focus:outline-none"
        style={{ fontSize: 'var(--text-label)' }}
      >
        {retryLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Numeric score badge — used in Surf Score hero and each forecast column.
// No star glyphs (MARINE-FIXIT-PLAN T5.1: numeric scores only).
// qualityStars arrives as 0–5 from the API; we clamp to [0,5] defensively.
// ---------------------------------------------------------------------------

/** 4–5 stars → green; 3 → amber; 1–2 → red. Color is always paired with
 *  the numeric score AND qualityLabel text — never the only signal. */
function qualityColorClasses(stars: number): string {
  const r = Math.round(stars);
  if (r >= 4) return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (r === 3) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
}

function NumericScoreBadge({
  stars,
  label,
  size,
  t,
}: {
  stars: number;
  label: string;
  size: 'lg' | 'sm';
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const clamped = Math.max(0, Math.min(5, Math.round(stars)));
  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-lg font-semibold ${qualityColorClasses(stars)} ${
        size === 'lg' ? 'px-4 py-3' : 'px-2 py-0.5 gap-1'
      }`}
      style={{ fontSize: size === 'lg' ? 'var(--text-body)' : 'var(--text-label)' }}
    >
      {/* Digit is aria-hidden; sr-only phrase carries the meaning to AT. */}
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-display, system-ui, sans-serif)',
          fontWeight: 700,
          fontSize: size === 'lg' ? 'var(--text-stat-tile)' : 'var(--text-body)',
          fontFeatureSettings: '"tnum"',
          lineHeight: 1,
        }}
      >
        {clamped}
      </span>
      <span className="sr-only">{t('qualitative.stars', { count: clamped })} — </span>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Scoring breakdown — weighted factor bars.
// The API returns qualityStars/qualityLabel (composed score) but NOT the
// individual factor breakdown. These UI-side approximations reconstruct
// approximate per-factor contributions from fields the API does provide.
// Each approximation is documented inline to track against surf_scorer.py.
// ---------------------------------------------------------------------------

/**
 * scoreBarFillColor — fill color for scoring progress bars.
 *
 * Color is never the sole signal: bars are aria-hidden. The visible score
 * number and label text above each bar carry the same information.
 * Contrast rationale (light / dark --muted track):
 *   - good   → green-700 / green-400  ≈ 4.7:1 / 8.2:1 against --muted
 *   - moderate → amber-700 / amber-400 ≈ 4.7:1 / 8.3:1 against --muted
 *   - poor (< 30): intentionally low-contrast against track — same precedent
 *     as --gauge-unfill in semi-circular-gauge.tsx (decorative/unfilled).
 */
function scoreBarFillColor(pct: number): string {
  if (pct > 60) return 'var(--gauge-fill-good, #15803d)';
  if (pct >= 30) return 'var(--gauge-fill-moderate, #b45309)';
  return 'var(--gauge-unfill)';
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between" style={{ fontSize: 'var(--text-label)' }}>
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground" style={{ fontFeatureSettings: '"tnum"' }}>
          {Math.round(pct)}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: 'var(--gauge-unfill)' }}
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: scoreBarFillColor(pct) }}
        />
      </div>
    </div>
  );
}

/**
 * windQualityScore — convert API windQuality string to a 0–100 score.
 *
 * FIX (FAIL CONDITION): the API returns "Cross-shore", "Offshore", etc. with
 * capital first letter and hyphens. The previous implementation used
 * `case 'cross':` which NEVER matched. Normalize before switching:
 *   quality.toLowerCase().replace(/-/g, '_')
 * so "Cross-shore" → "cross_shore" and "Cross-offshore" → "cross_offshore".
 */
function windQualityScore(quality: string | null): number {
  if (quality === null) return 0;
  const normalized = quality.toLowerCase().replace(/-/g, '_');
  switch (normalized) {
    case 'offshore':      return 100;
    case 'cross_offshore': return 80;
    case 'cross_shore':   return 50;
    case 'cross_onshore': return 30;
    case 'onshore':       return 10;
    default:              return 0;
  }
}

/** Period scoring: <6s poor, 6-8s short-period wind swell, 8-11s mid,
 *  11-14s good groundswell, 14+ great. */
function periodScore(period: number | null): number {
  if (period === null) return 0;
  if (period < 6) return 20;
  if (period < 8) return 40;
  if (period < 11) return 60;
  if (period < 14) return 80;
  return 100;
}

/**
 * waveHeightScore — graduated scale from 0ft=0 to 8ft+=100.
 *
 * FIX (FAIL CONDITION): the previous implementation scored 0 for any wave
 * ≤ 2ft, making Southern California summer surf (1–3ft) always read as
 * "no score". 1.7ft must score ~34, not 0.
 *
 * Control points: 0ft→0, 1ft→20, 2ft→40, 4ft→60, 6ft→80, 8ft→100.
 * Linear interpolation between each pair. Values ≥8ft cap at 100.
 *
 * waveHeightAtBreak is in the operator's configured display unit. The
 * 1/2/4/6/8ft thresholds are surf-culture imperial conventions, so metric
 * heights are converted back to feet before scoring.
 */
function waveHeightScore(height: number | null, unit: string): number {
  if (height === null) return 0;
  const feet = unit === 'm' ? height / 0.3048 : height;
  if (feet <= 0) return 0;
  if (feet >= 8) return 100;
  const breakpoints: [number, number][] = [
    [0, 0],
    [1, 20],
    [2, 40],
    [4, 60],
    [6, 80],
    [8, 100],
  ];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [x0, y0] = breakpoints[i];
    const [x1, y1] = breakpoints[i + 1];
    if (feet <= x1) {
      return y0 + ((feet - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 100;
}

// ---------------------------------------------------------------------------
// Swell component breakdown — ranked by energy (primary first).
// FIX: NEVER accept spectralComponents as a fallback. Only multiSwell.
// FIX: Energy values (0.002–0.008 m²/Hz) displayed with 4 decimal places,
//      NOT formatValue(energy, 'default') which rounds to "0.0".
// ---------------------------------------------------------------------------

const CLASSIFICATION_COLOR: Record<string, string> = {
  groundswell: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  swell:       'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  wind_swell:  'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300',
};

/** <8s → no quality tier (short-period wind chop).
 *  8–10s → normal; 11–13s → good; 14+ → great. */
function periodQualityTier(period: number): 'normal' | 'good' | 'great' | null {
  if (period < 8)  return null;
  if (period <= 10) return 'normal';
  if (period <= 13) return 'good';
  return 'great';
}

function SwellDirectionArrow({ directionDeg }: { directionDeg: number }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
      style={{ transform: `rotate(${directionDeg}deg)` }}
    >
      <path d="M4 0 L8 8 L4 6 L0 8 Z" fill="currentColor" />
    </svg>
  );
}

/**
 * SwellBreakdown — renders sorted-by-energy multiSwell components.
 *
 * Called ONLY with forecast[0].multiSwell. If that array is empty, the
 * Swell card shows "No model swell data available" — no NDBC fallback.
 *
 * Energy: formatNumber(energy, 4, locale) — locale-aware, 4 decimal places.
 * Previous code used formatValue(energy, 'default') → "0.0". FIXED.
 */
function SwellBreakdown({
  components,
  locale,
  heightUnit,
  periodUnit,
  t,
  tCommon,
}: {
  components: SpectralWaveComponent[];
  locale: string;
  heightUnit: string;
  periodUnit: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tCommon: (key: string) => string;
}) {
  if (components.length === 0) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('surfing.noModelSwellData')}
      </p>
    );
  }

  const ranked = [...components].sort((a, b) => b.energy - a.energy);

  return (
    <ul className="flex flex-col gap-2 list-none p-0 m-0">
      {ranked.map((c, i) => {
        const isPrimary = i === 0;
        const classKey = c.classification in CLASSIFICATION_COLOR ? c.classification : 'swell';
        const cardinal = cardinalFromDegrees(c.direction);
        const cardinalLabel = cardinal ? tCommon(`directions.${cardinal}`) : '—';
        const periodTier = periodQualityTier(c.period);

        return (
          <li
            key={i}
            className={`rounded-lg flex flex-col gap-2 ${isPrimary ? 'p-4' : 'p-3'} ${CLASSIFICATION_COLOR[classKey]}`}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className="font-semibold"
                style={{ fontSize: isPrimary ? 'var(--text-body)' : 'var(--text-label)' }}
              >
                {t(`surfing.classification.${classKey}`)}
                {isPrimary && <span className="sr-only"> — {t('surfing.primarySwell')}</span>}
              </span>
              <span
                className="inline-flex items-center gap-1"
                style={{ fontSize: isPrimary ? 'var(--text-body)' : 'var(--text-label)' }}
              >
                <SwellDirectionArrow directionDeg={c.direction} />
                {cardinalLabel}
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-x-4 gap-y-1">
              <div className="flex flex-col">
                <dt className="opacity-80" style={{ fontSize: 'var(--text-micro)' }}>
                  {t('surfing.height')}
                </dt>
                <dd
                  className="font-semibold"
                  style={{
                    fontSize: isPrimary ? 'var(--text-stat-tile)' : 'var(--text-label)',
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {formatValue(c.height, 'default', locale)} {heightUnit}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="opacity-80" style={{ fontSize: 'var(--text-micro)' }}>
                  {t('surfing.period')}
                </dt>
                <dd
                  className="font-semibold"
                  style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}
                >
                  {formatValue(c.period, 'default', locale)} {periodUnit}
                  {periodTier && (
                    <span className="font-normal opacity-80">
                      {' '}&mdash; {t(`surfing.periodQuality.${periodTier}`)}
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="opacity-80" style={{ fontSize: 'var(--text-micro)' }}>
                  {t('surfing.energy')}
                </dt>
                {/* FIX: 4 decimal places, locale-aware — NOT formatValue(energy, 'default') → "0.0" */}
                <dd
                  className="font-semibold"
                  style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}
                >
                  {formatNumber(c.energy, 4, locale)}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Swell direction compass — tick-ring SVG. Shows dominant swell direction
// from multiSwell (highest energy component). Folded into the Swell card.
// ---------------------------------------------------------------------------

const SWELL_CX = 210;
const SWELL_CY = 210;
const SWELL_R_OUTER = 175;
const SWELL_TICK_LEN = 24;
const SWELL_TICK_W_DIM = 4.5;
const SWELL_TICK_W_LIT = 6;
const SWELL_TICK_COUNT = 72; // every 5 degrees
const SWELL_LIT_HALF_RANGE = 8; // degrees either side of direction

const SWELL_COMPASS_LABEL_STYLE: CSSProperties = {
  fontFamily: "'Manrope', var(--font-sans, system-ui, sans-serif)",
  fontSize: 18,
  fontWeight: 600,
};

function SwellDirectionCompass({
  directionDeg,
  height,
  period,
  heightUnit,
  periodUnit,
  locale,
  t,
  tCommon,
}: {
  directionDeg: number | null;
  height: number | null;
  period: number | null;
  heightUnit: string;
  periodUnit: string;
  locale: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tCommon: (key: string) => string;
}) {
  if (directionDeg === null) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('surfing.noDirectionData')}
      </p>
    );
  }

  const cardinal = cardinalFromDegrees(directionDeg);
  const cardinalLabel = cardinal ? tCommon(`directions.${cardinal}`) : '—';
  const svgTitle = t('surfing.beachAlignmentAriaLabel', {
    direction: cardinalLabel,
    degrees: Math.round(directionDeg),
  });

  const ticks = Array.from({ length: SWELL_TICK_COUNT }, (_, i) => {
    const deg = (i / SWELL_TICK_COUNT) * 360;
    const rad = ((deg - 90) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const rInner = SWELL_R_OUTER - SWELL_TICK_LEN;
    const x1 = SWELL_CX + rInner * cosA;
    const y1 = SWELL_CY + rInner * sinA;
    const x2 = SWELL_CX + SWELL_R_OUTER * cosA;
    const y2 = SWELL_CY + SWELL_R_OUTER * sinA;
    const diff = Math.abs(((deg - directionDeg + 540) % 360) - 180);
    const lit = diff < SWELL_LIT_HALF_RANGE;
    return (
      <line
        key={i}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={lit ? 'var(--chart-2)' : 'var(--muted-foreground)'}
        strokeWidth={lit ? SWELL_TICK_W_LIT : SWELL_TICK_W_DIM}
        strokeLinecap="round"
        opacity={lit ? 1 : 0.38}
      />
    );
  });

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
      <svg
        viewBox="0 0 420 420"
        role="img"
        aria-labelledby="swell-compass-title"
        focusable={false as unknown as boolean}
        style={{ width: '100%', maxWidth: '7rem', height: 'auto', aspectRatio: '1 / 1', display: 'block' }}
      >
        <title id="swell-compass-title">{svgTitle}</title>
        <g aria-hidden="true">{ticks}</g>
        <text x={210} y={18}  textAnchor="middle" dominantBaseline="middle" fill="var(--muted-foreground)" style={SWELL_COMPASS_LABEL_STYLE} aria-hidden="true">N</text>
        <text x={402} y={210} textAnchor="middle" dominantBaseline="middle" fill="var(--muted-foreground)" style={SWELL_COMPASS_LABEL_STYLE} aria-hidden="true">E</text>
        <text x={210} y={402} textAnchor="middle" dominantBaseline="middle" fill="var(--muted-foreground)" style={SWELL_COMPASS_LABEL_STYLE} aria-hidden="true">S</text>
        <text x={18}  y={210} textAnchor="middle" dominantBaseline="middle" fill="var(--muted-foreground)" style={SWELL_COMPASS_LABEL_STYLE} aria-hidden="true">W</text>
      </svg>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '0.1rem',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', fontSize: 'var(--text-micro)', color: 'var(--muted-foreground)' }}>
          {Math.round(directionDeg)}°
          <span style={{ color: 'var(--foreground)', fontWeight: 600, marginLeft: '0.2rem' }}>
            {cardinalLabel}
          </span>
        </div>
        {height !== null && (
          <div
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontSize: 'var(--text-label)',
              fontWeight: 600,
              color: 'var(--foreground)',
              fontFeatureSettings: '"tnum"',
            }}
          >
            <span className="sr-only">{t('surfing.height')}: </span>
            {formatValue(height, 'default', locale)} {heightUnit}
          </div>
        )}
        {period !== null && (
          <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', fontSize: 'var(--text-micro)', color: 'var(--muted-foreground)' }}>
            <span className="sr-only">{t('surfing.period')}: </span>
            {formatValue(period, 'default', locale)} {periodUnit}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dominant swell helpers — derive direction/height/period from multiSwell
// (highest-energy component). Fallback to the forecast entry's own fields
// when multiSwell is empty (only for height/period; direction needs a
// component to exist, returns null otherwise).
// Plain functions (not hooks) — called after early returns, so no hooks here.
// ---------------------------------------------------------------------------

function dominantSwellDirection(components: SpectralWaveComponent[]): number | null {
  if (components.length === 0) return null;
  return components.reduce((best, c) => (c.energy > best.energy ? c : best), components[0]).direction;
}

function dominantSwellStats(
  components: SpectralWaveComponent[],
  fallbackEntry: SurfForecast | null,
): { height: number | null; period: number | null } {
  if (components.length > 0) {
    const dominant = components.reduce((best, c) => (c.energy > best.energy ? c : best), components[0]);
    return { height: dominant.height, period: dominant.period };
  }
  return { height: fallbackEntry?.waveHeightAtBreak ?? null, period: fallbackEntry?.period ?? null };
}

// ---------------------------------------------------------------------------
// Time-matching helpers for 72h forecast columns (T5.2).
// Closest-timestamp match on short arrays (a few dozen entries each).
// ---------------------------------------------------------------------------

function nearestForecastPoint(ts: number, points: MarineForecastPoint[]): MarineForecastPoint | null {
  if (points.length === 0) return null;
  return points.reduce((best, p) => {
    const bDiff = Math.abs(new Date(best.time).getTime() - ts);
    const diff  = Math.abs(new Date(p.time).getTime()    - ts);
    return diff < bDiff ? p : best;
  }, points[0]);
}

function nearestTideEvent(ts: number, predictions: TidePrediction[]): TidePrediction | null {
  const extrema = predictions.filter((p) => p.type === 'high' || p.type === 'low');
  if (extrema.length === 0) return null;
  return extrema.reduce((best, p) => {
    const bDiff = Math.abs(new Date(best.time).getTime() - ts);
    const diff  = Math.abs(new Date(p.time).getTime()    - ts);
    return diff < bDiff ? p : best;
  }, extrema[0]);
}

/** Station-local YYYY-MM-DD key for grouping. Uses 'en-US' only for the
 *  internal Map key — never rendered. Avoids toISOString() which gives UTC
 *  date, misgroups entries near local midnight. */
function stationDateKey(ts: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ts));
  const y = parts.find((p) => p.type === 'year')?.value  ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  const d = parts.find((p) => p.type === 'day')?.value   ?? '00';
  return `${y}-${m}-${d}`;
}

interface EnrichedForecastEntry {
  entry: SurfForecast;
  windPoint: MarineForecastPoint | null;
  tideEvent: TidePrediction | null;
}

interface ForecastDayGroup {
  key: string;
  label: string;
  items: EnrichedForecastEntry[];
}

/** Forecast entries arrive in chronological order → Map insertion already
 *  yields day-chronological groups. No extra sort needed. */
function groupForecastByDay(
  items: EnrichedForecastEntry[],
  locale: string,
  tz: string,
): ForecastDayGroup[] {
  const groups = new Map<string, EnrichedForecastEntry[]>();
  for (const item of items) {
    const ts = new Date(item.entry.time).getTime();
    const key = stationDateKey(ts, tz);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).map(([key, groupItems]) => ({
    key,
    label: new Intl.DateTimeFormat(locale, {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: tz,
    }).format(new Date(groupItems[0].entry.time)),
    items: groupItems,
  }));
}

// ---------------------------------------------------------------------------
// ForecastColumn — one 3–4 hour period's full data stack (T5.2).
//
// FIX: windQuality displayed as-is (API value is already human-readable:
// "Offshore", "Cross-shore", etc.). Previous i18n lookup used wrong keys.
//
// Per brief: weather icon + air temp per period — SurfForecast has neither
// field. Display "—" explicitly rather than silently omitting the row.
// ---------------------------------------------------------------------------

function ForecastColumn({
  item,
  locale,
  stationTz,
  heightUnit,
  periodUnit,
  windUnit,
  t,
  tCommon,
}: {
  item: EnrichedForecastEntry;
  locale: string;
  stationTz: string;
  heightUnit: string;
  periodUnit: string;
  windUnit: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tCommon: (key: string) => string;
}) {
  const { entry, windPoint, tideEvent } = item;

  const swellDirCardinal = cardinalFromDegrees(entry.direction);
  const swellDirLabel = swellDirCardinal ? tCommon(`directions.${swellDirCardinal}`) : '—';
  const windDirCardinal = cardinalFromDegrees(windPoint?.windDirection ?? null);
  const windDirLabel = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : '—';

  return (
    <div className="flex flex-col gap-1.5 rounded-lg px-3 py-2.5 shrink-0 w-[9rem] ring-1 ring-foreground/10">
      <span
        className="font-semibold text-center"
        style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}
      >
        {formatTime(new Date(entry.time), locale, stationTz)}
      </span>

      <div className="self-center">
        <NumericScoreBadge stars={entry.qualityStars} label={entry.qualityLabel} size="sm" t={t} />
      </div>

      <dl className="flex flex-col gap-1" style={{ fontSize: 'var(--text-micro)' }}>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('surfing.height')}</dt>
          <dd className="font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
            {formatValue(entry.waveHeightAtBreak, 'default', locale)} {heightUnit}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('surfing.period')}</dt>
          <dd className="font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
            {formatValue(entry.period, 'default', locale)} {periodUnit}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('surfing.direction')}</dt>
          <dd className="font-semibold">{swellDirLabel}</dd>
        </div>
        {/* windQuality: display as-is — already human-readable from API */}
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('surfing.windQualityTitle')}</dt>
          <dd className="font-semibold">{entry.windQuality ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('windSpeed')}</dt>
          <dd className="font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>
            {formatValue(windPoint?.windSpeed ?? null, 'wind', locale)} {windUnit}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('surfing.windDirection')}</dt>
          <dd className="font-semibold">{windDirLabel}</dd>
        </div>
        {/* Air temp — SurfForecast has no airTemp field; show '—' per brief
            (do NOT silently omit the row). */}
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('surfing.airTemp')}</dt>
          <dd className="font-semibold">—</dd>
        </div>
      </dl>

      {tideEvent && (
        <div
          className="flex items-center justify-center gap-1 rounded"
          style={{ fontSize: 'var(--text-micro)', background: 'var(--muted)', padding: '0.25rem 0.375rem' }}
        >
          <span aria-hidden="true">{tideEvent.type === 'high' ? '↑' : '↓'}</span>
          <span className="font-semibold">
            {tideEvent.type === 'high' ? t('tide.tideHigh') : t('tide.tideLow')}
          </span>
          <span style={{ fontFeatureSettings: '"tnum"' }}>
            {formatValue(tideEvent.height, 'default', locale)}{heightUnit}
          </span>
          <span style={{ fontFeatureSettings: '"tnum"' }}>
            {formatTime(new Date(tideEvent.time), locale, stationTz)}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wave face height chart — post-supplement breaking height (what surfers
// actually care about, not raw offshore Hs).
// ---------------------------------------------------------------------------

function WaveFaceHeightChart({
  forecast,
  locale,
  stationTz,
  heightUnit,
  ariaLabel,
  t,
}: {
  forecast: SurfForecast[];
  locale: string;
  stationTz: string;
  heightUnit: string;
  ariaLabel: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const points = useMemo(
    () =>
      forecast
        .map((f) => ({ ts: new Date(f.time).getTime(), height: f.waveHeightAtBreak }))
        .sort((a, b) => a.ts - b.ts),
    [forecast],
  );

  if (points.length === 0) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('surfing.noForecastData')}
      </p>
    );
  }

  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const ticks = buildHourTicks(minTs, maxTs);
  const tickFormatter = (ts: number) => formatTime(new Date(ts), locale, stationTz);

  return (
    <>
      <ChartContainer height={220} ariaLabel={ariaLabel}>
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
          <defs>
            <linearGradient id="surfingWaveFaceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  style={{ stopColor: 'var(--chart-2)', stopOpacity: 0.4 }} />
              <stop offset="95%" style={{ stopColor: 'var(--chart-2)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="ts"
            type="number"
            domain={[minTs, maxTs]}
            ticks={ticks}
            tickFormatter={tickFormatter}
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--muted-foreground)' }}
            height={28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-chart)', fontSize: 14, fill: 'var(--muted-foreground)' }}
            width={36}
            label={{
              value: heightUnit,
              angle: -90,
              position: 'insideLeft',
              style: { fontFamily: 'var(--font-chart)', fontSize: 12, fill: 'var(--muted-foreground)' },
            }}
          />
          <Area
            type="monotone"
            dataKey="height"
            stroke="var(--chart-2)"
            fill="url(#surfingWaveFaceGradient)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls
          />
        </AreaChart>
      </ChartContainer>

      {/* sr-only data table — WCAG 1.1.1 (rules/coding.md §5.5) */}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{t('surfing.srTimeColumn')}</th>
            <th scope="col">{t('surfing.srWaveFaceHeightColumn', { unit: heightUnit })}</th>
          </tr>
        </thead>
        <tbody>
          {forecast.map((f, i) => (
            <tr key={`${f.time}-${i}`}>
              <td>{formatTime(new Date(f.time), locale, stationTz)}</td>
              <td>{formatValue(f.waveHeightAtBreak, 'default', locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------
// SurfingTab — main export
// ---------------------------------------------------------------------------

export function SurfingTab({ locationId, alerts = [] }: SurfingTabProps) {
  const { t, i18n } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const locale = i18n.language;

  const { data, units, loading: surfLoading, error: surfError, refetch: refetchSurf } = useSurfDetail(locationId);
  const { data: marine, units: marineUnits, loading: marineLoading } = useMarineDetail(locationId);
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  const forecast       = data?.forecast       ?? [];
  const tidePredictions = data?.tidePredictions ?? [];
  const locationName   = data?.locationName   ?? '';

  // Enrich forecast entries with time-matched wind + nearest tide event.
  // Must run before any early returns (Rules of Hooks — useMemo is unconditional).
  // Stable references: depend on `data` / `marine` directly (not the `?? []`
  // fallback consts, which are new array literals each render and defeat memoization).
  const enrichedForecast = useMemo<EnrichedForecastEntry[]>(() => {
    const fc = data?.forecast        ?? [];
    const mf = marine?.forecast      ?? [];
    const tp = data?.tidePredictions ?? [];
    return fc.map((entry) => {
      const ts = new Date(entry.time).getTime();
      return {
        entry,
        windPoint: nearestForecastPoint(ts, mf),
        tideEvent: nearestTideEvent(ts, tp),
      };
    });
  }, [data, marine]);

  // ── Loading state ─────────────────────────────────────────────────────────
  // Both surf and marine data needed (Wind card depends on marine bundle).
  if (surfLoading || marineLoading) {
    return (
      <div className="flex flex-col gap-[var(--gap-grid)]">
        <span className="sr-only" role="status">{t('surfing.loading')}</span>
        <TileSkeleton className="h-40" />
        <TileSkeleton className="h-40" />
        <TileSkeleton className="h-24" />
        <TileSkeleton className="h-48" />
        <TileSkeleton className="h-48" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  // Surf is the primary source. A marine-bundle failure degrades the Wind
  // card gracefully (shows "—" for all stats) — it does NOT block the tab.
  if (surfError) {
    return (
      <InlineError
        message={t('surfing.unableToLoad')}
        onRetry={refetchSurf}
        retryLabel={tCommon('retry')}
      />
    );
  }

  if (!data) return null;

  // ── Unit labels ───────────────────────────────────────────────────────────
  const heightUnit = units?.waveHeightAtBreak ?? units?.waveHeight ?? units?.height ?? 'ft';
  const periodUnit = units?.period ?? t('surfing.secondsAbbr');
  const windUnit   = marineUnits?.windSpeed ?? 'kn';

  // ── Live wind observation (from marine bundle) ────────────────────────────
  const observation    = marine?.observation ?? null;
  const windDirCardinal = cardinalFromDegrees(observation?.windDirection ?? null);
  const windDirLabel   = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : '—';

  // ── Primary forecast entry (now-ish conditions) ───────────────────────────
  const primary = forecast[0] ?? null;

  // ── Swell components — ONLY from multiSwell (NO spectralComponents fallback)
  // FIX (FAIL CONDITION): `primary?.multiSwell ?? spectralComponents` was WRONG.
  // If multiSwell is null or empty, the Swell card shows "no model data".
  const swellComponents: SpectralWaveComponent[] = primary?.multiSwell ?? [];

  const dominantDirection = dominantSwellDirection(swellComponents);
  const dominantStats     = dominantSwellStats(swellComponents, primary);

  const swellDirCardinal = cardinalFromDegrees(primary?.direction ?? null);
  const swellDirLabel    = swellDirCardinal ? tCommon(`directions.${swellDirCardinal}`) : '—';

  // ── Scoring breakdown — UI-side approximations (API returns composed score only)
  const scoringFactors = primary
    ? [
        {
          key: 'waveHeight',
          weight: 35,
          score: waveHeightScore(primary.waveHeightAtBreak, heightUnit),
        },
        {
          key: 'wavePeriod',
          weight: 35,
          score: periodScore(primary.period),
        },
        {
          key: 'windQuality',
          weight: 20,
          score: windQualityScore(primary.windQuality),
        },
        {
          key: 'swellDominance',
          weight: 10,
          score: Math.max(0, Math.min(100, primary.swellDominance * 100)),
        },
      ]
    : [];

  // ── Forecast layout helpers ───────────────────────────────────────────────
  const isSinglePointForecast = forecast.length === 1;
  const hasMultiPointForecast = forecast.length >= 2;
  const dayGroups = hasMultiPointForecast
    ? groupForecastByDay(enrichedForecast, locale, stationTz)
    : [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">

      {/* 1. Active advisories — full width, above the card grid */}
      <AlertsPanel alerts={alerts} filterTypes={SURFING_ALERT_TYPES} />

      {/* 2–4. Score (2×2 hero) + Swell (2×1) + Wind (2×1) in a shared Grid.
       *
       * FIX (FAIL CONDITION): previous implementation had NO <Grid> wrapper —
       * cards were in a bare flex column, so footprint col-span classes had
       * zero effect. All three cards are now wrapped in <Grid>.
       *
       * At lg (4 cols):  Score cols 1–2 rows 1–8, Swell cols 3–4 rows 1–4,
       *                  Wind cols 3–4 rows 5–8.
       * At md (2 cols):  All three stack full-width (each spans 2 of 2 cols).
       * At sm (<768px):  All three auto-height stacked. */}
      <Grid>

        {/* ── Card 2: Surf Score — 2×2 HERO ────────────────────────────── */}
        {/* FIX (FAIL CONDITION): was `<Card footprint="wide">` — missing rowSpan={2}.
         *  Must be footprint="wide" rowSpan={2} for the 2×2 hero layout. */}
        <Card footprint="wide" rowSpan={2}>
          <CardHeader>
            <CardTitle as="h3">{t('surfing.scoreCardTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {primary === null ? (
              <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
                {t('surfing.noForecastData')}
              </p>
            ) : (
              <>
                {/* conditionsText — subtitle above the score badge */}
                <p className="font-semibold text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                  {primary.conditionsText}
                </p>

                {/* Numeric score badge — NOT star glyphs (MARINE-FIXIT-PLAN T5.1) */}
                <NumericScoreBadge
                  stars={primary.qualityStars}
                  label={primary.qualityLabel}
                  size="lg"
                  t={t}
                />

                {/* Weighted factor breakdown bars */}
                <div className="flex flex-col gap-3">
                  {scoringFactors.map((factor) => (
                    <ScoreBar
                      key={factor.key}
                      label={t('surfing.scoring.factorLabel', {
                        label:  t(`surfing.scoring.${factor.key}`),
                        weight: factor.weight,
                      })}
                      score={factor.score}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Card 3: Swell — 2×1 ─────────────────────────────────────── */}
        <Card footprint="wide">
          <CardHeader>
            <CardTitle as="h3">{t('surfing.swellCardTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {primary !== null && (
              <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
                <MarineStatTile
                  icon={<Waves aria-hidden="true" focusable="false" />}
                  label={t('waveHeight')}
                  value={formatValue(primary.waveHeightAtBreak, 'default', locale)}
                  unit={heightUnit}
                />
                <MarineStatTile
                  label={t('surfing.period')}
                  value={formatValue(primary.period, 'default', locale)}
                  unit={periodUnit}
                />
                <MarineStatTile
                  label={t('surfing.direction')}
                  value={swellDirLabel}
                />
              </dl>
            )}

            {/* Swell breakdown + compass side by side */}
            <div className="flex flex-col md:flex-row gap-4 items-start">
              <div className="flex-1 min-w-0">
                {/* FIX: ONLY multiSwell — never spectralComponents */}
                <SwellBreakdown
                  components={swellComponents}
                  locale={locale}
                  heightUnit={heightUnit}
                  periodUnit={periodUnit}
                  t={t}
                  tCommon={tCommon}
                />
              </div>
              {/* Compass only shown when multiSwell has data */}
              {swellComponents.length > 0 && (
                <div className="w-full md:w-32 shrink-0 flex justify-center">
                  <SwellDirectionCompass
                    directionDeg={dominantDirection}
                    height={dominantStats.height}
                    period={dominantStats.period}
                    heightUnit={heightUnit}
                    periodUnit={periodUnit}
                    locale={locale}
                    t={t}
                    tCommon={tCommon}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Card 4: Wind — 2×1 ──────────────────────────────────────── */}
        <Card footprint="wide">
          <CardHeader>
            <CardTitle as="h3">{t('surfing.windCardTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <MarineStatTile
                icon={<Wind aria-hidden="true" focusable="false" />}
                label={t('windSpeed')}
                value={formatValue(observation?.windSpeed ?? null, 'wind', locale)}
                unit={windUnit}
              />
              <MarineStatTile
                icon={<Wind aria-hidden="true" focusable="false" />}
                label={t('surfing.gust')}
                value={formatValue(observation?.windGust ?? null, 'wind', locale)}
                unit={windUnit}
              />
              <MarineStatTile
                label={t('surfing.windDirection')}
                value={windDirLabel}
              />
              {/* windQuality: display as-is — human-readable from API ("Offshore", "Cross-shore", …) */}
              <MarineStatTile
                label={t('surfing.windQualityTitle')}
                value={primary?.windQuality ?? '—'}
              />
            </dl>
          </CardContent>
        </Card>

      </Grid>

      {/* ── Card 5: 72-Hour Surf Forecast — full width ──────────────────── */}
      <Grid>
        <Card footprint="full">
          <CardHeader>
            <CardTitle as="h3">
              {isSinglePointForecast
                ? t('surfing.currentConditionsTitle')
                : t('surfing.forecastTimelineTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {forecast.length === 0 ? (
              <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
                {t('surfing.noForecastData')}
              </p>
            ) : isSinglePointForecast ? (
              <div className="w-fit">
                <ForecastColumn
                  item={enrichedForecast[0]}
                  locale={locale}
                  stationTz={stationTz}
                  heightUnit={heightUnit}
                  periodUnit={periodUnit}
                  windUnit={windUnit}
                  t={t}
                  tCommon={tCommon}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {dayGroups.map((group) => (
                  <div key={group.key} className="flex flex-col gap-2">
                    <p
                      className="text-muted-foreground font-semibold"
                      style={{ fontSize: 'var(--text-label)' }}
                    >
                      {group.label}
                    </p>
                    <HorizontalScrollNav
                      ariaLabel={t('surfing.forecastDayAriaLabel', { day: group.label })}
                    >
                      <div className="flex gap-2 px-1 py-1">
                        {group.items.map((item) => (
                          <ForecastColumn
                            key={item.entry.time}
                            item={item}
                            locale={locale}
                            stationTz={stationTz}
                            heightUnit={heightUnit}
                            periodUnit={periodUnit}
                            windUnit={windUnit}
                            t={t}
                            tCommon={tCommon}
                          />
                        ))}
                      </div>
                    </HorizontalScrollNav>
                  </div>
                ))}
              </div>
            )}

            {hasMultiPointForecast && (
              <div className="flex flex-col gap-2">
                <p
                  className="text-muted-foreground font-semibold"
                  style={{ fontSize: 'var(--text-label)' }}
                >
                  {t('surfing.waveFaceHeightTitle')}
                </p>
                <WaveFaceHeightChart
                  forecast={forecast}
                  locale={locale}
                  stationTz={stationTz}
                  heightUnit={heightUnit}
                  ariaLabel={t('surfing.waveFaceHeightAriaLabel', { location: locationName })}
                  t={t}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* ── Card 6: Tide Forecast — full width ──────────────────────────── */}
      <Grid>
        <Card footprint="full">
          <CardHeader>
            <CardTitle as="h3">{t('surfing.tideForecastTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <TideChart
              predictions={tidePredictions}
              locale={locale}
              stationTz={stationTz}
              heightUnit={heightUnit}
              ariaLabel={t('surfing.tideForecastAriaLabel', { location: locationName })}
            />
          </CardContent>
        </Card>
      </Grid>

    </div>
  );
}

export default SurfingTab;
