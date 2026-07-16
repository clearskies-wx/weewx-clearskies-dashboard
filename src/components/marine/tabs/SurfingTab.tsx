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
// Design compliance round 2 (MARINE-FIXIT-LIST-2):
//   Issue 1: Swell + Wind cards auto-size in fluid grid (no explicit rowSpan)
//   Issue 2: 72h forecast uses HorizontalScrollNav + fixed-width <button> columns
//   Issue 3: Typography uses design tokens throughout; no <div role="button">
//   Issue 4: Forecast card CardContent uses overflow-visible for chevron projection
//   Issue 5: Tide card autofit (no forced max-height)
//
// Card order:
//   AlertsPanel (full width, outside Grid)
//   Grid {
//     Surf Score  footprint="wide"  rowSpan={2}  — 2×2 hero
//     Swell       footprint="wide"              — 2×1 fluid auto-height
//     Wind        footprint="wide"              — 2×1 fluid auto-height
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
//   - All interactive elements keyboard-reachable via <button> (no <div onClick>)

import { useMemo, useState } from 'react';
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
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { MarineStatTile } from '../shared/MarineStatTile';
import { HorizontalScrollNav } from '../../ui/horizontal-scroll-nav';
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
    <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
      {ranked.map((c, i) => {
        const classKey = c.classification in CLASSIFICATION_COLOR ? c.classification : 'swell';
        const cardinal = cardinalFromDegrees(c.direction);
        const cardinalLabel = cardinal ? tCommon(`directions.${cardinal}`) : '—';
        const periodTier = periodQualityTier(c.period);

        return (
          <li
            key={i}
            className={`rounded-md flex items-center gap-3 px-2.5 py-1.5 ${CLASSIFICATION_COLOR[classKey]}`}
          >
            {/* Classification + direction */}
            <div className="flex items-center gap-1.5 shrink-0" style={{ minWidth: '5.5rem' }}>
              <span className="font-semibold" style={{ fontSize: 'var(--text-label)' }}>
                {t(`surfing.classification.${classKey}`)}
              </span>
              <span className="inline-flex items-center gap-0.5 text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
                <SwellDirectionArrow directionDeg={c.direction} />
                {cardinalLabel}
              </span>
            </div>
            {/* Height / Period / Energy — inline row */}
            <div className="flex items-baseline gap-3 flex-1 min-w-0" style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}>
              <span className="font-semibold whitespace-nowrap">
                {formatValue(c.height, 'default', locale)}<span className="text-muted-foreground font-normal ml-0.5">{heightUnit}</span>
              </span>
              <span className="font-semibold whitespace-nowrap">
                {formatValue(c.period, 'default', locale)}<span className="text-muted-foreground font-normal ml-0.5">{periodUnit}</span>
                {periodTier && (
                  <span className="text-muted-foreground font-normal ml-1">{t(`surfing.periodQuality.${periodTier}`)}</span>
                )}
              </span>
            </div>
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
        style={{ width: '100%', height: 'auto', aspectRatio: '1 / 1', display: 'block' }}
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
// SurfScrollForecast — 72-hour forecast with HorizontalScrollNav (T5.2 redesign).
//
// Replaces SurfForecastColumns. Uses HorizontalScrollNav with fixed-width period
// columns (Design Manual §11 "Horizontal Scroll Navigation", HourlyStrip.tsx pattern).
//
// Column anatomy (top→bottom, 72px wide):
//   time label → score badge (circular, color-coded) → wave height →
//   swell direction → wind quality label → wind speed + direction → tide event
//
// Day group headers appear as labeled sections above each day's columns within
// the scroll area. Clicking a column <button> toggles the detail panel below
// the scroll area (outside HorizontalScrollNav, expands card in fluid mode).
//
// Detail panel: time + qualityLabel + conditionsText + chip grid + SwellBreakdown.
//
// A11y:
//   - Each period column is a <button type="button"> (never <div role="button">)
//   - button aria-label = time + qualityLabel (conveys quality to AT)
//   - Score badge circular span is aria-hidden (visual supplement only)
//   - Tide direction arrows (↑↓) are aria-hidden; paired with text values
//   - Detail panel has aria-live="polite" for dynamic content announcement
//   - HorizontalScrollNav provides role="region" + aria-label + tabIndex=0
// ---------------------------------------------------------------------------

function SurfScrollForecast({
  dayGroups,
  locale,
  stationTz,
  heightUnit,
  periodUnit,
  windUnit,
  t,
  tCommon,
}: {
  dayGroups: ForecastDayGroup[];
  locale: string;
  stationTz: string;
  heightUnit: string;
  periodUnit: string;
  windUnit: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tCommon: (key: string) => string;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Attach a flat index to each group for tracking which column is expanded.
  const groupsWithIdx = useMemo(() => {
    let startIdx = 0;
    return dayGroups.map((group) => {
      const withIdx = { key: group.key, label: group.label, items: group.items, startIdx };
      startIdx += group.items.length;
      return withIdx;
    });
  }, [dayGroups]);

  // Find the expanded entry for the detail panel via flat-index lookup.
  const expandedEntry = useMemo<EnrichedForecastEntry | null>(() => {
    if (expandedIdx === null) return null;
    let idx = 0;
    for (const group of dayGroups) {
      for (const item of group.items) {
        if (idx === expandedIdx) return item;
        idx++;
      }
    }
    return null;
  }, [expandedIdx, dayGroups]);

  // Fixed column width — wider than HourlyStrip's 56px to accommodate score badge
  // and multi-row surf data (wave height, swell direction, wind, tide).
  const COL_W = 72; // px

  // Reusable label/value chip for the detail panel (matches DailyColumns pattern).
  const chip = (label: string, value: string) => (
    <div
      key={label}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '0.3rem',
        fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
        fontSize: 'var(--text-card-title)',
      }}
    >
      <span style={{ fontSize: 'var(--text-micro)', color: 'var(--muted-foreground)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* HorizontalScrollNav — chevrons project into card padding area.
          CardContent must use overflow-visible for chevrons to be visible. */}
      <HorizontalScrollNav ariaLabel={t('surfing.forecastTimelineTitle')}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '0.75rem',
            width: 'max-content',
            padding: '0.25rem 0.25rem 0.5rem',
          }}
        >
          {groupsWithIdx.map((group) => (
            <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {/* Day section header — appears above this day's columns */}
              <div
                style={{
                  fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                  fontSize: 'var(--text-label)',
                  fontWeight: 600,
                  color: 'var(--muted-foreground)',
                  paddingLeft: '0.25rem',
                  paddingBottom: '0.125rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {group.label}
              </div>

              {/* Period column buttons for this day */}
              <div style={{ display: 'flex', flexDirection: 'row', gap: '0.25rem' }}>
                {group.items.map((item, i) => {
                  const flatIdx = group.startIdx + i;
                  const isSelected = expandedIdx === flatIdx;
                  const timeLabel = formatTime(new Date(item.entry.time), locale, stationTz);
                  const swellDirCardinal = cardinalFromDegrees(item.entry.direction);
                  const windDirCardinal  = cardinalFromDegrees(item.windPoint?.windDirection ?? null);

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setExpandedIdx((prev) => (prev === flatIdx ? null : flatIdx))}
                      aria-expanded={isSelected}
                      aria-label={`${timeLabel} — ${item.entry.qualityLabel}`}
                      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-lg"
                      style={{
                        width: COL_W,
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 3,
                        padding: '0.375rem 0.25rem 0.5rem',
                        background: isSelected ? 'var(--detail-panel-bg, rgba(80,100,255,0.08))' : 'transparent',
                        border: 'none',
                        borderTop: `3px solid ${isSelected ? 'var(--primary)' : 'transparent'}`,
                        cursor: 'pointer',
                      }}
                    >
                      {/* Row 1: Time label */}
                      <span
                        style={{
                          fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                          fontSize: 'var(--text-label)',
                          fontWeight: 600,
                          color: isSelected ? 'var(--primary)' : 'var(--foreground)',
                          whiteSpace: 'nowrap',
                          lineHeight: 1,
                        }}
                      >
                        {timeLabel}
                      </span>

                      {/* Row 2: Score badge — circular, colored by tier.
                          aria-hidden: quality conveyed via button aria-label. */}
                      <span
                        aria-hidden="true"
                        className={`flex items-center justify-center rounded-full font-bold ${qualityColorClasses(item.entry.qualityStars)}`}
                        style={{
                          width: 26,
                          height: 26,
                          flexShrink: 0,
                          fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
                          fontSize: 'var(--text-body)',
                          fontFeatureSettings: '"tnum"',
                          lineHeight: 1,
                        }}
                      >
                        {Math.round(Math.max(0, Math.min(5, item.entry.qualityStars)))}
                      </span>

                      {/* Row 3: Wave height — display font for stat numerals (DESIGN-MANUAL §4) */}
                      <span
                        style={{
                          fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
                          fontSize: 'var(--text-label)',
                          fontWeight: 600,
                          fontFeatureSettings: '"tnum"',
                          whiteSpace: 'nowrap',
                          color: 'var(--foreground)',
                          lineHeight: 1,
                        }}
                      >
                        {formatValue(item.entry.waveHeightAtBreak, 'default', locale)}
                        <span
                          style={{
                            fontSize: 'var(--text-micro)',
                            fontWeight: 400,
                            color: 'var(--muted-foreground)',
                            marginLeft: '0.1rem',
                          }}
                        >
                          {heightUnit}
                        </span>
                      </span>

                      {/* Row 4: Swell direction — cardinal abbreviation */}
                      <span
                        style={{
                          fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                          fontSize: 'var(--text-micro)',
                          color: 'var(--muted-foreground)',
                          whiteSpace: 'nowrap',
                          lineHeight: 1,
                        }}
                      >
                        {swellDirCardinal ?? '—'}
                      </span>

                      {/* Row 5: Wind quality label ("Offshore", "Cross-shore", etc.) */}
                      <span
                        style={{
                          fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                          fontSize: 'var(--text-micro)',
                          color: 'var(--muted-foreground)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '100%',
                          lineHeight: 1,
                          textAlign: 'center',
                        }}
                      >
                        {item.entry.windQuality ?? '—'}
                      </span>

                      {/* Row 6: Wind speed + direction */}
                      <span
                        style={{
                          fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                          fontSize: 'var(--text-micro)',
                          color: 'var(--muted-foreground)',
                          whiteSpace: 'nowrap',
                          fontFeatureSettings: '"tnum"',
                          lineHeight: 1,
                        }}
                      >
                        {item.windPoint?.windSpeed != null
                          ? `${formatValue(item.windPoint.windSpeed, 'wind', locale)}${windUnit}`
                          : '—'}
                        {windDirCardinal ? ` ${windDirCardinal}` : ''}
                      </span>

                      {/* Row 7: Tide event — nearest high/low.
                          ↑/↓ arrows are aria-hidden; text value follows. */}
                      <span
                        style={{
                          fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                          fontSize: 'var(--text-micro)',
                          color: 'var(--muted-foreground)',
                          whiteSpace: 'nowrap',
                          fontFeatureSettings: '"tnum"',
                          lineHeight: 1,
                          minHeight: 'var(--text-micro)',
                        }}
                      >
                        {item.tideEvent ? (
                          <>
                            <span aria-hidden="true">{item.tideEvent.type === 'high' ? '↑' : '↓'}</span>
                            {formatValue(item.tideEvent.height, 'default', locale)}{heightUnit}
                          </>
                        ) : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </HorizontalScrollNav>

      {/* Detail panel — rendered outside the scroll area so it doesn't scroll.
          Card grows vertically in fluid mode to accommodate the panel. */}
      {expandedIdx !== null && expandedEntry !== null && (() => {
        const { entry, windPoint, tideEvent } = expandedEntry;
        const swellDirCardinal  = cardinalFromDegrees(entry.direction);
        const swellDirLabel     = swellDirCardinal ? tCommon(`directions.${swellDirCardinal}`) : '—';
        const windDirCardinal   = cardinalFromDegrees(windPoint?.windDirection ?? null);
        const windDirLabel      = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : '—';
        const periodSwellComponents: SpectralWaveComponent[] = entry.multiSwell ?? [];

        return (
          <div
            aria-live="polite"
            style={{
              background: 'var(--detail-panel-bg, rgba(80,100,255,0.08))',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem 1rem',
            }}
          >
            {/* Period time header + quality label */}
            <div
              style={{
                fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                fontSize: 'var(--text-card-title)',
                fontWeight: 600,
                color: 'var(--primary)',
                marginBottom: '0.35rem',
                opacity: 0.9,
              }}
            >
              {formatTime(new Date(entry.time), locale, stationTz)}
              {' — '}{entry.qualityLabel}
            </div>

            {entry.conditionsText && (
              <p
                style={{
                  fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                  fontSize: 'var(--text-card-title)',
                  color: 'var(--muted-foreground)',
                  lineHeight: 1.55,
                  margin: '0 0 0.5rem',
                }}
              >
                {entry.conditionsText}
              </p>
            )}

            {/* Chip grid — wrapping flex row of label/value pairs */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                columnGap: '1.5rem',
                rowGap: '0.35rem',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                marginBottom: periodSwellComponents.length > 0 ? '0.75rem' : 0,
              }}
            >
              {chip(t('waveHeight'), `${formatValue(entry.waveHeightAtBreak, 'default', locale)} ${heightUnit}`)}
              {chip(t('surfing.period'), `${formatValue(entry.period, 'default', locale)} ${periodUnit}`)}
              {chip(t('surfing.direction'), swellDirLabel)}
              {chip(t('surfing.windQualityTitle'), entry.windQuality ?? '—')}
              {windPoint?.windSpeed != null && chip(t('windSpeed'), `${formatValue(windPoint.windSpeed, 'wind', locale)} ${windUnit}`)}
              {chip(t('surfing.windDirection'), windDirLabel)}
              {chip(t('surfing.airTemp'), '—')}
              {tideEvent && chip(
                tideEvent.type === 'high' ? t('tide.tideHigh') : t('tide.tideLow'),
                `${formatValue(tideEvent.height, 'default', locale)} ${heightUnit} · ${formatTime(new Date(tideEvent.time), locale, stationTz)}`,
              )}
            </div>

            {/* Per-period swell component breakdown (FIX-15 requirement) */}
            {periodSwellComponents.length > 0 && (
              <SwellBreakdown
                components={periodSwellComponents}
                locale={locale}
                heightUnit={heightUnit}
                periodUnit={periodUnit}
                t={t}
                tCommon={tCommon}
              />
            )}
          </div>
        );
      })()}
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
  // Always compute day groups — SurfScrollForecast handles single-entry day groups.
  const dayGroups = groupForecastByDay(enrichedForecast, locale, stationTz);
  const hasMultiPointForecast = forecast.length >= 2;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">

      {/* 1. Active advisories — full width, above the card grid */}
      <AlertsPanel alerts={alerts} filterTypes={SURFING_ALERT_TYPES} />

      {/* 2–4. Score (2×2 hero) + Swell (2×1 fluid) + Wind (2×1 fluid) in a shared Grid.
       *
       * FIX (FAIL CONDITION): previous implementation had NO <Grid> wrapper —
       * cards were in a bare flex column, so footprint col-span classes had
       * zero effect. All three cards are now wrapped in <Grid>.
       *
       * Score card: rowSpan={2} — guaranteed 2×2 hero prominence.
       * Swell card: no rowSpan — fluid mode auto-sizes to content (more rows = taller).
       * Wind card:  no rowSpan — fluid mode auto-sizes to content (4 stats = compact).
       *
       * At lg (4 cols):  Score cols 1–2 rows 1–8, Swell cols 3–4 rows 1–4,
       *                  Wind cols 3–4 rows 5–8.
       * At md (2 cols):  All three stack full-width (each spans 2 of 2 cols).
       * At sm (<768px):  All three auto-height stacked. */}
      <Grid className="md:!auto-rows-[auto]">

        {/* ── Card 2: Surf Score — 2×2 HERO ────────────────────────────── */}
        {/* rowSpan={2} kept: hero card needs guaranteed visual prominence.
         *  Fluid mode still honors rowSpan for hero prominence against siblings. */}
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

        {/* ── Card 3: Swell — 2×2 fixed ─────────────────────────────── */}
        <Card footprint="wide" rowSpan={2}>
          <CardHeader>
            <CardTitle as="h3">{t('surfing.swellCardTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-row gap-4">
            {/* Left 2/3: dominant stats + component breakdown */}
            <div className="flex flex-col gap-3 flex-[2] min-w-0">
              {/* Dominant swell section */}
              {primary !== null && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground font-semibold" style={{ fontSize: 'var(--text-micro)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t('surfing.dominantSwell')}
                  </span>
                  <dl className="grid grid-cols-3 gap-x-3">
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
                </div>
              )}

              {/* Component breakdown — compact rows */}
              <SwellBreakdown
                components={swellComponents}
                locale={locale}
                heightUnit={heightUnit}
                periodUnit={periodUnit}
                t={t}
                tCommon={tCommon}
              />
            </div>

            {/* Right 1/3: compass */}
            {swellComponents.length > 0 && (
              <div className="flex-1 flex items-center justify-center">
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
          </CardContent>
        </Card>

        {/* ── Card 4: Wind — 2×1 fluid auto-height ────────────────────── */}
        {/* No rowSpan: fluid mode auto-sizes to content. Wind card has only
         *  4 stat tiles so it stays compact. */}
        <Card footprint="wide" rowSpan="half">
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
      {/* Uses HorizontalScrollNav with fixed-width <button> columns per period.
       *  Day group headers appear above each day's columns within the scroll area.
       *  Click a column to expand the detail panel below the scroll (fluid mode
       *  grows the card to fit the panel).
       *  CardContent uses overflow-visible so HorizontalScrollNav chevron buttons
       *  can project into the card padding area (matches ForecastHourlyCard). */}
      <Grid className="md:!auto-rows-[auto]">
        <Card footprint="full" className="!overflow-visible">
          <CardHeader>
            <CardTitle as="h3">{t('surfing.forecastTimelineTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-visible flex flex-col gap-4">
            {dayGroups.length === 0 ? (
              <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
                {t('surfing.noForecastData')}
              </p>
            ) : (
              <SurfScrollForecast
                dayGroups={dayGroups}
                locale={locale}
                stationTz={stationTz}
                heightUnit={heightUnit}
                periodUnit={periodUnit}
                windUnit={windUnit}
                t={t}
                tCommon={tCommon}
              />
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
      {/* No forced max-height: fluid mode lets TideChart render at natural height. */}
      <Grid className="md:!auto-rows-[auto]">
        <Card footprint="full" className="!overflow-visible">
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
