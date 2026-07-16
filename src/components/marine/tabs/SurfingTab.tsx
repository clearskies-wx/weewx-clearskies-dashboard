// SurfingTab.tsx — Surfing activity tab content (MARINE-FIXIT-PLAN T5.1/T5.2
// redesign of the Phase 7 F22 hero layout).
//
// Surfaces the surf scoring system (enrichment/surf_scorer.py) as four
// focused cards instead of one monolithic hero: a Surf Score card (numeric
// score + weighted scoring breakdown), a Swell card (wave/period/direction
// stats + ranked swell components + a compact direction compass), a Wind
// card (live marine observation wind data), and a data-rich day-grouped
// 72-hour forecast + wave face height chart. All sections use the shared
// Card/CardHeader/CardTitle/CardContent system and the shared
// MarineStatTile — no local Panel/StatTile functions (DESIGN-MANUAL §20).
//
// Card order (top to bottom):
//   1. Alerts (AlertsPanel, shared, unchanged)
//   2. Surf Score — conditionsText subtitle, prominent NUMERIC score (never
//      star glyphs) + qualityLabel, 4 weighted-factor scoring bars absorbed
//      below (wave height 35%, wave period 35%, wind quality 20%, swell
//      dominance 10%). The API does not return per-factor scores, so these
//      remain UI-side approximations documented inline next to each scoring
//      function.
//   3. Swell — wave height/period/direction stats, swell components ranked
//      by energy (prefers SurfForecast.multiSwell, the NWPS/WW3
//      model-processed breakdown; falls back to SurfDetailData's raw NDBC
//      spectralComponents when multiSwell is null), and a reduced-footprint
//      swell direction compass folded in as one element (not its own card).
//   4. Wind — live wind speed/gust/direction from MarineObservation
//      (useMarineDetail) plus the forecast-derived wind quality label.
//   5. 72-Hour Surf Forecast — day-grouped HorizontalScrollNav of per-period
//      columns (numeric score, wave height, swell period/direction, wind
//      quality/speed/direction time-matched from the marine bundle, nearest
//      tide event) + the wave face height area chart below.
//   6. Tide Forecast — TideChart (standalone, shared, unchanged).
//
// Data sources: useSurfDetail(locationId) (/surf/{id}) is the primary
// bundle (forecast, spectral components, tide predictions). useMarineDetail
// (/marine/{id}) is added in this redesign solely for live wind
// observation + the forecast points used to time-match wind onto the surf
// forecast timeline.
//
// Removed in this redesign: star-glyph rating (StarRating component
// deleted entirely — numeric scores only, MARINE-FIXIT-PLAN T5.1), the
// standalone Swell Components card and standalone compass card (both folded
// into the Swell card), the rip current risk badge and zoneForecast
// hazards text (no longer sourced — not part of the redesigned card set).
//
// A11y (rules/coding.md §5):
//   - Every Card section heading is a real <h3> (CardTitle as="h3"),
//     siblings of the tab/accordion h3 header above — no skipped levels.
//   - Numeric score: the digit is aria-hidden with an sr-only "N of 5
//     stars" phrase (reusing the existing qualitative.stars key) preceding
//     the visible qualityLabel text, so the accessible name isn't a bare
//     ambiguous number.
//   - Color is never the only signal: quality/scoring-bar color coding is
//     always paired with a translated text label or a visible number.
//   - Charts: ChartContainer (role="img" + aria-label) + sr-only data table.
//   - Swell direction compass: role="img" with a <title> summarizing the
//     dominant swell direction as text; the center overlay's height/period
//     readouts carry sr-only "Height"/"Period" labels so screen readers
//     don't hear ambiguous bare numbers.
//   - Primary swell's larger type size is a sighted-only cue — an sr-only
//     "primary swell" label on the first list item carries the same
//     information to screen reader users.
//   - Horizontal scroll strips use the shared HorizontalScrollNav pattern
//     (DESIGN-MANUAL §11) — round buttons + keyboard-scrollable region —
//     one per forecast day, each with a distinct aria-label naming the day.
//   - Tide arrow glyphs (↑/↓) are aria-hidden and always paired with the
//     translated "High"/"Low" text label — never the only signal.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis } from 'recharts';
import { Waves, Wind } from '@phosphor-icons/react';
import { useSurfDetail, useMarineDetail, useStation } from '../../../hooks/useWeatherData';
import { formatValue } from '../../../utils/format';
import { formatTime } from '../../../utils/format-date';
import { cardinalFromDegrees } from '../../../utils/wind';
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
// Shared small pieces (TileSkeleton/InlineError follow the same conventions
// established by BoatingTab.tsx / BeachSafetyTab.tsx so all four marine
// activity tabs read as one system).
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
        className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        style={{ fontSize: 'var(--text-label)' }}
      >
        {retryLabel}
      </button>
    </div>
  );
}

/** 4-5 stars → green (great), 3 → amber (fair), 1-2 → red (poor). Color is
 *  always paired with the numeric score + qualityLabel text — never alone. */
function qualityColorClasses(stars: number): string {
  const rounded = Math.round(stars);
  if (rounded >= 4) return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (rounded === 3) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
}

/** Renders a rounded/clamped quality score as a digit (aria-hidden) with an
 *  sr-only "N of 5 stars" phrase ahead of the visible qualityLabel — never
 *  star glyphs (MARINE-FIXIT-PLAN T5.1: numeric scores only). Shared between
 *  the Surf Score card and each forecast column so the two stay visually
 *  consistent. */
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
  const rounded = Math.max(0, Math.min(5, Math.round(stars)));
  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-lg font-semibold ${qualityColorClasses(stars)} ${
        size === 'lg' ? 'px-4 py-3' : 'px-2 py-0.5 gap-1'
      }`}
      style={{ fontSize: size === 'lg' ? 'var(--text-body)' : 'var(--text-label)' }}
    >
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
        {rounded}
      </span>
      <span className="sr-only">{t('qualitative.stars', { count: rounded })} — </span>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Scoring breakdown — 4 weighted factors. The API does not return per-factor
// scores (SurfForecast only carries the composed qualityStars/qualityLabel),
// so these are UI-side approximations from the fields the API does return.
// Each function documents its approximation so a future change to the real
// scorer weights (enrichment/surf_scorer.py) can be reconciled here too.
// ---------------------------------------------------------------------------

/** offshore (ideal) → cross-offshore → cross-shore → cross-onshore → onshore (worst). */
function windQualityScore(quality: string | null): number {
  switch (quality) {
    case 'offshore': return 100;
    case 'cross_offshore': return 80;
    case 'cross': return 50;
    case 'cross_onshore': return 30;
    case 'onshore': return 10;
    default: return 0;
  }
}

/** <6s poor, 6-8s short-period wind swell, 8-11s mid, 11-14s good groundswell, 14+ great. */
function periodScore(period: number | null): number {
  if (period === null) return 0;
  if (period < 6) return 20;
  if (period < 8) return 40;
  if (period < 11) return 60;
  if (period < 14) return 80;
  return 100;
}

/** waveHeightAtBreak is already in the operator's configured display unit —
 *  the 2ft/8ft thresholds are surf-culture imperial conventions, so meter
 *  readings are converted back to feet-equivalent before scoring. Values at
 *  or below 2ft score 0; 8ft and above cap at 100. */
function waveHeightScore(height: number | null, unit: string): number {
  if (height === null) return 0;
  const feet = unit === 'm' ? height / 0.3048 : height;
  if (feet <= 2) return 0;
  const score = ((feet - 2) / (8 - 2)) * 100;
  return Math.max(0, Math.min(100, score));
}

/**
 * Fill color per score tier. NOT a flat bg-green-500/bg-amber-500 pair —
 * those compute to ~2.0-2.1:1 against this theme's near-white light --muted
 * track (oklch(0.97 0 0)), below the 3:1 non-text-contrast floor (coding.md
 * §5.1). -700 (light) / -400 (dark) computes to ~4.7:1 / ~8.2:1 (green) and
 * ~4.7:1 / ~8.3:1 (amber) against light/dark --muted respectively — verified
 * by hand via the WCAG relative-luminance formula against this file's actual
 * oklch(0.97 0 0) / oklch(0.269 0 0) --muted tokens (src/index.css), since no
 * browser was available in this session to run a live contrast checker.
 * The <30% "muted" tier is intentionally low-contrast against its own
 * track — same precedent as this codebase's --gauge-unfill (semi-circular-
 * gauge.tsx: "rgba(0,0,0,0.22) on white ≈ #c5c5c5; sits at ~1.6:1 —
 * intentionally [decorative]"). Every bar is aria-hidden and paired with the
 * visible score number + label text above it, so the fill itself carries no
 * information a screen reader needs and a low-score "empty-looking" bar is
 * the correct visual signal, not a defect.
 */
function scoreBarFillColor(pct: number): string {
  if (pct > 60) return 'var(--gauge-fill-good, #16a34a)';
  if (pct >= 30) return 'var(--gauge-fill-moderate, #d97706)';
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
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--gauge-unfill)' }} aria-hidden="true">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: scoreBarFillColor(pct) }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swell breakdown — spectral components ranked by energy (primary first),
// classification color-coded, primary swell visually larger. Accepts either
// SurfForecast.multiSwell (preferred, NWPS/WW3 model-processed) or
// SurfDetailData.spectralComponents (raw NDBC fallback) — both share the
// SpectralWaveComponent shape, so the caller resolves which one to pass.
// ---------------------------------------------------------------------------

const CLASSIFICATION_COLOR: Record<string, string> = {
  groundswell: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  swell: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  wind_swell: 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300',
};

/** <8s: no tier (short-period wind chop). 8-10s normal, 11-13s good, 14+s great. */
function periodQualityTier(period: number): 'normal' | 'good' | 'great' | null {
  if (period < 8) return null;
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
        {t('surfing.noSpectralData')}
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
                  style={{ fontSize: isPrimary ? 'var(--text-stat-tile)' : 'var(--text-label)', fontFeatureSettings: '"tnum"' }}
                >
                  {formatValue(c.height, 'default', locale)} {heightUnit}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="opacity-80" style={{ fontSize: 'var(--text-micro)' }}>
                  {t('surfing.period')}
                </dt>
                <dd className="font-semibold" style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}>
                  {formatValue(c.period, 'default', locale)} {periodUnit}
                  {periodTier && (
                    <span className="font-normal opacity-80"> — {t(`surfing.periodQuality.${periodTier}`)}</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="opacity-80" style={{ fontSize: 'var(--text-micro)' }}>
                  {t('surfing.energy')}
                </dt>
                <dd className="font-semibold" style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}>
                  {formatValue(c.energy, 'default', locale)}
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
// Wind quality — plain translated label (no color badge; the Wind card and
// forecast columns render it via MarineStatTile / plain text per the T5.1
// spec, so no separate colored-pill component is needed here).
// ---------------------------------------------------------------------------

const WIND_QUALITY_KEYS = ['offshore', 'cross_offshore', 'cross', 'cross_onshore', 'onshore'];

function windQualityLabel(quality: string | null, t: (key: string) => string): string {
  if (quality === null) return t('surfing.noData');
  const key = WIND_QUALITY_KEYS.includes(quality) ? quality : 'cross';
  return t(`surfing.windQuality.${key}`);
}

// ---------------------------------------------------------------------------
// Swell direction compass — WindCompassCard tick-ring pattern (DASHBOARD-
// MANUAL §20 "Swell direction compass"), lit ticks in --chart-2 (distinct
// from wind's --primary). Folded into the Swell card at a reduced footprint
// per MARINE-FIXIT-PLAN T5.1 ("reduce compass visual footprint").
// ---------------------------------------------------------------------------

const SWELL_CX = 210;
const SWELL_CY = 210;
const SWELL_R_OUTER = 175;
const SWELL_TICK_LEN = 24;
const SWELL_TICK_W_DIM = 4.5;
const SWELL_TICK_W_LIT = 6;
const SWELL_TICK_COUNT = 72; // every 5 degrees
const SWELL_LIT_HALF_RANGE = 8; // degrees either side of direction

const SWELL_CARD_LABEL_STYLE: React.CSSProperties = {
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
  const svgTitle = t('surfing.beachAlignmentAriaLabel', { direction: cardinalLabel, degrees: Math.round(directionDeg) });

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
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
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
        <text x={210} y={18} textAnchor="middle" dominantBaseline="middle" fill="var(--muted-foreground)" style={SWELL_CARD_LABEL_STYLE} aria-hidden="true">
          N
        </text>
        <text x={402} y={210} textAnchor="middle" dominantBaseline="middle" fill="var(--muted-foreground)" style={SWELL_CARD_LABEL_STYLE} aria-hidden="true">
          E
        </text>
        <text x={210} y={402} textAnchor="middle" dominantBaseline="middle" fill="var(--muted-foreground)" style={SWELL_CARD_LABEL_STYLE} aria-hidden="true">
          S
        </text>
        <text x={18} y={210} textAnchor="middle" dominantBaseline="middle" fill="var(--muted-foreground)" style={SWELL_CARD_LABEL_STYLE} aria-hidden="true">
          W
        </text>
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
          <span style={{ color: 'var(--foreground)', fontWeight: 600, marginLeft: '0.2rem' }}>{cardinalLabel}</span>
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
// Helper: dominant swell (highest-energy component in the resolved
// multiSwell-or-spectralComponents array), falling back to the primary
// forecast entry's own direction/height/period fields when the array is
// empty. Plain functions, not hooks — called after SurfingTab's early
// returns, so they must not themselves call useMemo/useState (Rules of
// Hooks). The input arrays are short (a handful of swell components), so a
// plain reduce on every render is cheap enough that memoization isn't
// needed here.
// ---------------------------------------------------------------------------

function dominantSwellDirection(swellComponents: SpectralWaveComponent[], primary: SurfForecast | null): number | null {
  if (swellComponents.length > 0) {
    const dominant = swellComponents.reduce((best, c) => (c.energy > best.energy ? c : best), swellComponents[0]);
    return dominant.direction;
  }
  return primary?.direction ?? null;
}

function dominantSwellStats(
  swellComponents: SpectralWaveComponent[],
  primary: SurfForecast | null,
): { height: number | null; period: number | null } {
  if (swellComponents.length > 0) {
    const dominant = swellComponents.reduce((best, c) => (c.energy > best.energy ? c : best), swellComponents[0]);
    return { height: dominant.height, period: dominant.period };
  }
  return { height: primary?.waveHeightAtBreak ?? null, period: primary?.period ?? null };
}

// ---------------------------------------------------------------------------
// Time-matching helpers for the 72h forecast columns (T5.2). Simple
// closest-timestamp match — the marine bundle's forecast points and the
// tide predictions are both short arrays (a few dozen entries each), so a
// linear scan per forecast entry is cheap.
// ---------------------------------------------------------------------------

function nearestForecastPoint(ts: number, points: MarineForecastPoint[]): MarineForecastPoint | null {
  if (points.length === 0) return null;
  return points.reduce((best, p) => {
    const bestDiff = Math.abs(new Date(best.time).getTime() - ts);
    const diff = Math.abs(new Date(p.time).getTime() - ts);
    return diff < bestDiff ? p : best;
  }, points[0]);
}

function nearestTideEvent(ts: number, predictions: TidePrediction[]): TidePrediction | null {
  const extrema = predictions.filter((p) => p.type === 'high' || p.type === 'low');
  if (extrema.length === 0) return null;
  return extrema.reduce((best, p) => {
    const bestDiff = Math.abs(new Date(best.time).getTime() - ts);
    const diff = Math.abs(new Date(p.time).getTime() - ts);
    return diff < bestDiff ? p : best;
  }, extrema[0]);
}

/** Station-local YYYY-MM-DD grouping key. 'en-US' here is used only to
 *  extract numeric year/month/day parts for an internal Map key — it is
 *  never rendered, so it does not need to be the visitor's locale (unlike
 *  every *displayed* date string in this file, which always uses `locale`
 *  + `tz` together per DASHBOARD-MANUAL §2/§3). Deliberately not
 *  `.toISOString().split('T')[0]` — that derives a UTC date, not the
 *  station-local date, and would misgroup entries near local midnight. */
function stationDateKey(ts: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(ts),
  );
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  const d = parts.find((p) => p.type === 'day')?.value ?? '00';
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

/** Forecast entries arrive in chronological order, so Map insertion order
 *  already yields day-chronological groups — no separate sort needed. */
function groupForecastByDay(items: EnrichedForecastEntry[], locale: string, tz: string): ForecastDayGroup[] {
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
    label: new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz }).format(
      new Date(groupItems[0].entry.time),
    ),
    items: groupItems,
  }));
}

// ---------------------------------------------------------------------------
// Forecast column — one period's full data stack (T5.2). Shared between the
// single-point fallback and the day-grouped HorizontalScrollNav rendering.
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
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('surfing.windQualityTitle')}</dt>
          <dd className="font-semibold">{windQualityLabel(entry.windQuality, t)}</dd>
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
      </dl>

      {tideEvent && (
        <div
          className="flex items-center justify-center gap-1 rounded"
          style={{ fontSize: 'var(--text-micro)', background: 'var(--muted)', padding: '0.25rem 0.375rem' }}
        >
          <span aria-hidden="true">{tideEvent.type === 'high' ? '↑' : '↓'}</span>
          <span className="font-semibold">{tideEvent.type === 'high' ? t('tide.tideHigh') : t('tide.tideLow')}</span>
          <span style={{ fontFeatureSettings: '"tnum"' }}>
            {formatValue(tideEvent.height, 'default', locale)}
            {heightUnit}
          </span>
          <span style={{ fontFeatureSettings: '"tnum"' }}>{formatTime(new Date(tideEvent.time), locale, stationTz)}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wave face height chart — the post-supplement breaking height (NOT raw
// offshore Hs), which is the number surfers actually care about.
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
              <stop offset="5%" style={{ stopColor: 'var(--chart-2)', stopOpacity: 0.4 }} />
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
// SurfingTab
// ---------------------------------------------------------------------------

export function SurfingTab({ locationId, alerts = [] }: SurfingTabProps) {
  const { t, i18n } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const locale = i18n.language;

  const { data, units, loading: surfLoading, error: surfError, refetch: refetchSurf } = useSurfDetail(locationId);
  const { data: marine, units: marineUnits, loading: marineLoading } = useMarineDetail(locationId);
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  const forecast = data?.forecast ?? [];
  const spectralComponents = data?.spectralComponents ?? [];
  const tidePredictions = data?.tidePredictions ?? [];
  const locationName = data?.locationName ?? '';

  // Time-match wind + nearest tide event onto every surf forecast entry once,
  // up front (Rules of Hooks — useMemo must run unconditionally, before the
  // loading/error early returns below). Depend on `data`/`marine` directly
  // (stable references from the query hooks) rather than the `?? []`
  // fallback consts above, which are fresh array literals every render and
  // would defeat memoization (react-hooks/exhaustive-deps).
  const enrichedForecast = useMemo<EnrichedForecastEntry[]>(() => {
    const fc = data?.forecast ?? [];
    const mf = marine?.forecast ?? [];
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

  // Loading state: skeletons while EITHER surf or marine data is loading —
  // the Wind card depends on the marine bundle.
  if (surfLoading || marineLoading) {
    return (
      <div className="flex flex-col gap-[var(--gap-grid)]">
        <span className="sr-only" role="status">
          {t('surfing.loading')}
        </span>
        <TileSkeleton className="h-40" />
        <TileSkeleton className="h-40" />
        <TileSkeleton className="h-24" />
        <TileSkeleton className="h-48" />
        <TileSkeleton className="h-48" />
      </div>
    );
  }

  // Surf is the primary data source — a marine-bundle failure degrades the
  // Wind card gracefully (its stats read null → "—") rather than blocking
  // the whole tab.
  if (surfError) {
    return <InlineError message={t('surfing.unableToLoad')} onRetry={refetchSurf} retryLabel={tCommon('retry')} />;
  }

  if (!data) return null;

  const heightUnit = units?.waveHeightAtBreak ?? units?.waveHeight ?? units?.height ?? 'ft';
  const periodUnit = units?.period ?? t('surfing.secondsAbbr');
  const windUnit = marineUnits?.windSpeed ?? 'kn';

  const observation = marine?.observation ?? null;
  const windDirCardinal = cardinalFromDegrees(observation?.windDirection ?? null);
  const windDirLabel = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : '—';

  const primary = forecast[0] ?? null;

  // Prefer the model-processed multiSwell breakdown; fall back to raw NDBC
  // spectralComponents when the forecast doesn't carry one.
  const swellComponents: SpectralWaveComponent[] = primary?.multiSwell ?? spectralComponents;

  const dominantDirection = dominantSwellDirection(swellComponents, primary);
  const dominantStats = dominantSwellStats(swellComponents, primary);

  const swellDirCardinal = cardinalFromDegrees(primary?.direction ?? null);
  const swellDirLabel = swellDirCardinal ? tCommon(`directions.${swellDirCardinal}`) : '—';

  // Scoring breakdown factors — see the score-function comments above for
  // the approximation each one uses (the API doesn't return per-factor
  // scores, only the composed qualityStars/qualityLabel).
  const scoringFactors = primary
    ? [
        { key: 'waveHeight', weight: 35, score: waveHeightScore(primary.waveHeightAtBreak, heightUnit) },
        { key: 'wavePeriod', weight: 35, score: periodScore(primary.period) },
        { key: 'windQuality', weight: 20, score: windQualityScore(primary.windQuality) },
        { key: 'swellDominance', weight: 10, score: Math.max(0, Math.min(100, primary.swellDominance * 100)) },
      ]
    : [];

  const isSinglePointForecast = forecast.length === 1;
  const hasMultiPointForecast = forecast.length >= 2;
  const dayGroups = hasMultiPointForecast ? groupForecastByDay(enrichedForecast, locale, stationTz) : [];

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
      {/* 1. Active advisories — top, prominent */}
      <AlertsPanel alerts={alerts} />

      {/* 2. Surf Score — numeric score + qualityLabel, scoring breakdown absorbed below */}
      <Card footprint="wide">
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
              <p className="font-semibold text-foreground" style={{ fontSize: 'var(--text-body)' }}>
                {primary.conditionsText}
              </p>

              <NumericScoreBadge stars={primary.qualityStars} label={primary.qualityLabel} size="lg" t={t} />

              <div className="flex flex-col gap-3">
                {scoringFactors.map((factor) => (
                  <ScoreBar
                    key={factor.key}
                    label={t('surfing.scoring.factorLabel', {
                      label: t(`surfing.scoring.${factor.key}`),
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

      {/* 3. Swell — stats + ranked component breakdown + reduced-footprint compass */}
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
              <MarineStatTile label={t('surfing.direction')} value={swellDirLabel} />
            </dl>
          )}
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="flex-1 min-w-0">
              <SwellBreakdown
                components={swellComponents}
                locale={locale}
                heightUnit={heightUnit}
                periodUnit={periodUnit}
                t={t}
                tCommon={tCommon}
              />
            </div>
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
          </div>
        </CardContent>
      </Card>

      {/* 4. Wind — live observation from the marine bundle + forecast-derived wind quality */}
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
            <MarineStatTile label={t('surfing.windDirection')} value={windDirLabel} />
            <MarineStatTile label={t('surfing.windQualityTitle')} value={windQualityLabel(primary?.windQuality ?? null, t)} />
          </dl>
        </CardContent>
      </Card>

      {/* 5. 72-Hour Surf Forecast — day-grouped columns + wave face height chart */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">
            {isSinglePointForecast ? t('surfing.currentConditionsTitle') : t('surfing.forecastTimelineTitle')}
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
                  <p className="text-muted-foreground font-semibold" style={{ fontSize: 'var(--text-label)' }}>
                    {group.label}
                  </p>
                  <HorizontalScrollNav ariaLabel={t('surfing.forecastDayAriaLabel', { day: group.label })}>
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
              <p className="text-muted-foreground font-semibold" style={{ fontSize: 'var(--text-label)' }}>
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

      {/* 6. Tide chart — standalone, 72h (shared component) */}
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
    </div>
  );
}

export default SurfingTab;
