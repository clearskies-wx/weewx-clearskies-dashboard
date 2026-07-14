// SurfingTab.tsx — Surfing activity tab content (Phase 7 T7.1/T7.2/T7.3,
// DASHBOARD-MANUAL §12 "Tab content — Surfing (F22 redesign)").
//
// Surfaces the surf scoring system (enrichment/surf_scorer.py) via a hero
// conditions summary, a weighted scoring breakdown, the 72h forecast
// timeline + wave face height chart, a ranked swell-component breakdown,
// a WindCompassCard-style swell direction compass, and the standalone tide
// chart. All sections use the shared Card/CardHeader/CardTitle/CardContent
// system and the shared MarineStatTile — no local Panel/StatTile functions
// (DESIGN-MANUAL §20).
//
// Panel order (top to bottom), matching DASHBOARD-MANUAL §12 exactly:
//   1. Alerts (AlertsPanel, shared, unchanged)
//   2. Current Conditions Hero — conditionsText headline, star rating +
//      qualityLabel, stat grid (wave height at break, period, wind quality
//      badge, water temp from zoneForecast), rip current risk badge
//   3. Scoring Breakdown — 4 weighted-factor bars (wave height 35%, wave
//      period 35%, wind quality 20%, swell dominance 10%). The API does not
//      return per-factor scores, so these are UI-side approximations
//      documented inline next to each scoring function.
//   4. 72-Hour Surf Forecast Timeline — ForecastTimeline + WaveFaceHeightChart
//   5. Swell Components — ranked by energy, primary swell visually larger
//   6. Swell Direction Compass — WindCompassCard tick-ring pattern, --chart-2
//   7. Tide Forecast — TideChart (standalone, shared)
//
// Data source: useSurfDetail(locationId) (/surf/{id}) — a single bundle
// covering forecast, zoneForecast (NWS Surf Zone Forecast), spectral
// components, and tide predictions. No separate tide fetch is needed (unlike
// BoatingTab/BeachSafetyTab) since SurfDetailData already carries
// tidePredictions.
//
// Removed in this redesign (DASHBOARD-MANUAL §12): standalone "Conditions"
// card (wind quality + beach alignment — consolidated into the hero),
// standalone rip current alert banner at the bottom (rip current is now a
// status badge in the hero; zoneForecast.hazardsText, when present, moves
// into the hero alongside the badge instead of being dropped), the "General
// Weather" panel (UV index has no home in the redesigned tab per the manual;
// water temp moves into the hero stat grid).
//
// A11y (rules/coding.md §5):
//   - Every Card section heading is a real <h3> (CardTitle as="h3"),
//     siblings of the tab/accordion h3 header above — no skipped levels.
//   - Star ratings: Unicode glyphs are aria-hidden; the wrapping element
//     carries a translated aria-label ("N of 5 stars") — glyphs alone are
//     not accessible text.
//   - Color is never the only signal: quality/wind-quality/rip-current/
//     scoring-bar color coding is always paired with a translated text
//     label or a visible number.
//   - Charts: ChartContainer (role="img" + aria-label) + sr-only data table.
//   - Swell direction compass: role="img" with a <title> summarizing the
//     dominant swell direction as text; the center overlay's height/period
//     readouts carry sr-only "Height"/"Period" labels so screen readers
//     don't hear ambiguous bare numbers.
//   - Primary swell's larger type size is a sighted-only cue — an sr-only
//     "primary swell" label on the first list item carries the same
//     information to screen reader users (coding.md §5: never let a purely
//     visual differentiator be the only signal).
//   - Horizontal scroll strip uses the shared HorizontalScrollNav pattern
//     (DESIGN-MANUAL §11) — round buttons + keyboard-scrollable region.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis } from 'recharts';
import { Waves, Thermometer } from '@phosphor-icons/react';
import { useSurfDetail, useStation } from '../../../hooks/useWeatherData';
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
import type { SpectralWaveComponent, SurfForecast, MarineAlertSummary } from '../../../api/types';

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

// ---------------------------------------------------------------------------
// StarRating — Unicode ★/☆ glyphs, decorative; the wrapping <span> carries
// the translated accessible name (reuses the existing "qualitative.stars"
// key already used by marine.tsx's tab-header qualitative label).
// ---------------------------------------------------------------------------

function StarRating({ stars, t }: { stars: number; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const rounded = Math.max(0, Math.min(5, Math.round(stars)));
  return (
    // role="img" is required here, not decorative flourish: a plain <span>
    // has an implicit ARIA role of "generic", and aria-label has no effect
    // on generic elements per the ARIA-in-HTML spec — axe-core's
    // aria-prohibited-attr rule flags this (confirmed live during T7.3
    // verification). "img" is a naming-container role, so the translated
    // "N of 5 stars" label actually reaches the accessibility tree.
    <span
      role="img"
      aria-label={t('qualitative.stars', { count: rounded })}
      className="text-foreground"
      style={{ fontSize: 'var(--text-label)', letterSpacing: '0.05em' }}
    >
      <span aria-hidden="true">{'★'.repeat(rounded)}{'☆'.repeat(5 - rounded)}</span>
    </span>
  );
}

/** 4-5 stars → green (great), 3 → amber (fair), 1-2 → red (poor). Color is
 *  always paired with the star glyphs + qualityLabel text — never alone. */
function qualityColorClasses(stars: number): string {
  const rounded = Math.round(stars);
  if (rounded >= 4) return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (rounded === 3) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
}

// ---------------------------------------------------------------------------
// 72-hour forecast timeline — horizontal scroll strip of star-rated cells
// ---------------------------------------------------------------------------

function ForecastTimeline({
  forecast,
  locale,
  stationTz,
  t,
}: {
  forecast: SurfForecast[];
  locale: string;
  stationTz: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (forecast.length === 0) {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('surfing.noForecastData')}
      </p>
    );
  }

  // A single forecast point isn't a "72-hour" timeline — render it as one
  // conditions card instead of a one-item horizontal scroll strip (the
  // section title above already switches to "Current Surf Conditions" for
  // this case; see SurfingTab's isSinglePointForecast).
  if (forecast.length === 1) {
    const entry = forecast[0];
    return (
      <div
        className={`flex flex-col items-center gap-1.5 rounded-lg px-4 py-3 w-fit ${qualityColorClasses(entry.qualityStars)}`}
      >
        <span className="font-semibold" style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}>
          {formatTime(new Date(entry.time), locale, stationTz)}
        </span>
        <StarRating stars={entry.qualityStars} t={t} />
        <span className="text-center" style={{ fontSize: 'var(--text-body)' }}>
          {entry.qualityLabel}
        </span>
      </div>
    );
  }

  return (
    <HorizontalScrollNav ariaLabel={t('surfing.forecastTimelineAriaLabel')}>
      <div className="flex gap-2 px-1 py-1">
        {forecast.map((entry) => (
          <div
            key={entry.time}
            className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2 shrink-0 min-w-[5.5rem] ${qualityColorClasses(entry.qualityStars)}`}
          >
            <span className="font-semibold" style={{ fontSize: 'var(--text-label)', fontFeatureSettings: '"tnum"' }}>
              {formatTime(new Date(entry.time), locale, stationTz)}
            </span>
            <StarRating stars={entry.qualityStars} t={t} />
            <span className="text-center" style={{ fontSize: 'var(--text-micro)' }}>
              {entry.qualityLabel}
            </span>
          </div>
        ))}
      </div>
    </HorizontalScrollNav>
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
// classification color-coded, primary swell visually larger.
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
// Wind quality badge — offshore (ideal, green) / cross (amber) / onshore
// (poor, red), always paired with the translated label text.
// ---------------------------------------------------------------------------

const WIND_QUALITY_COLOR: Record<string, string> = {
  offshore: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  cross_offshore: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  cross: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  cross_onshore: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  onshore: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function WindQualityBadge({ quality, t }: { quality: string | null; t: (key: string) => string }) {
  if (quality === null) {
    return (
      <span className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
        {t('surfing.noData')}
      </span>
    );
  }
  const key = quality in WIND_QUALITY_COLOR ? quality : 'cross';
  return (
    <span
      className={`inline-flex w-fit items-center rounded px-2.5 py-1 font-semibold ${WIND_QUALITY_COLOR[key]}`}
      style={{ fontSize: 'var(--text-label)' }}
    >
      {t(`surfing.windQuality.${key}`)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Rip current risk badge — low (green) / moderate (amber) / high (red),
// always paired with the translated risk-level text.
// ---------------------------------------------------------------------------

const RIP_RISK_COLOR: Record<string, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  moderate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function RipCurrentBadge({ riskKey, t }: { riskKey: string; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const key = riskKey in RIP_RISK_COLOR ? riskKey : 'moderate';
  return (
    <span
      role={key === 'high' ? 'alert' : undefined}
      className={`inline-flex w-fit items-center rounded px-2.5 py-1 font-semibold ${RIP_RISK_COLOR[key]}`}
      style={{ fontSize: 'var(--text-label)' }}
    >
      {t('surfing.ripCurrentRiskLabel', { level: t(`surfing.ripCurrentRisk.${key}`) })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Swell direction compass — WindCompassCard tick-ring pattern (DASHBOARD-
// MANUAL §20 "Swell direction compass"), lit ticks in --chart-2 (distinct
// from wind's --primary), rendered ~160px within a "tile" Card.
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
        style={{ width: '100%', maxWidth: '10rem', height: 'auto', aspectRatio: '1 / 1', display: 'block' }}
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
        <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', fontSize: 'var(--text-label)', color: 'var(--muted-foreground)' }}>
          {Math.round(directionDeg)}°
          <span style={{ color: 'var(--foreground)', fontWeight: 600, marginLeft: '0.2rem' }}>{cardinalLabel}</span>
        </div>
        {height !== null && (
          <div
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontSize: 'var(--text-body)',
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
          <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', fontSize: 'var(--text-label)', color: 'var(--muted-foreground)' }}>
            <span className="sr-only">{t('surfing.period')}: </span>
            {formatValue(period, 'default', locale)} {periodUnit}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SurfingTab
// ---------------------------------------------------------------------------

export function SurfingTab({ locationId, alerts = [] }: SurfingTabProps) {
  const { t, i18n } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const locale = i18n.language;

  const { data, units, loading, error, refetch } = useSurfDetail(locationId);
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  if (loading) {
    return (
      <div className="flex flex-col gap-[var(--gap-grid)]">
        <span className="sr-only" role="status">
          {t('surfing.loading')}
        </span>
        <TileSkeleton className="h-32" />
        <TileSkeleton className="h-24" />
        <TileSkeleton className="h-48" />
        <TileSkeleton className="h-48" />
      </div>
    );
  }

  if (error) {
    return <InlineError message={t('surfing.unableToLoad')} onRetry={refetch} retryLabel={tCommon('retry')} />;
  }

  if (!data) return null;

  const { forecast, zoneForecast, spectralComponents, tidePredictions, locationName } = data;

  const heightUnit = units?.waveHeightAtBreak ?? units?.waveHeight ?? units?.height ?? 'ft';
  const periodUnit = units?.period ?? t('surfing.secondsAbbr');
  const tempUnit = units?.waterTemp ?? units?.temperature ?? '';

  const primary = forecast[0] ?? null;

  const ripRiskKey = zoneForecast?.ripCurrentRisk?.toLowerCase() ?? null;
  const hazardsText = zoneForecast?.hazardsText ?? null;

  // A single forecast point isn't a 72h timeline — the section title and the
  // wave face height chart both change behavior for this case.
  const isSinglePointForecast = forecast.length === 1;
  const hasMultiPointForecast = forecast.length >= 2;

  // Dominant swell (highest-energy spectral component, falling back to the
  // primary forecast entry) drives both the scoring-adjacent hero and the
  // swell direction compass.
  const dominantDirection = dominantSwellDirection(spectralComponents, forecast);
  const dominantStats = dominantSwellStats(spectralComponents, forecast);

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

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
      {/* 1. Active advisories — top, prominent */}
      <AlertsPanel alerts={alerts} />

      {/* 2. Current Conditions Hero */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">{t('surfing.currentConditionsHeroTitle')}</CardTitle>
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

              <span
                className={`inline-flex w-fit items-center gap-2 rounded px-2.5 py-1 font-semibold ${qualityColorClasses(primary.qualityStars)}`}
                style={{ fontSize: 'var(--text-label)' }}
              >
                <StarRating stars={primary.qualityStars} t={t} />
                {primary.qualityLabel}
              </span>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
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
                <div className="flex flex-col gap-0.5">
                  <dt className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
                    {t('surfing.windQualityTitle')}
                  </dt>
                  <dd>
                    <WindQualityBadge quality={primary.windQuality} t={t} />
                  </dd>
                </div>
                <MarineStatTile
                  icon={<Thermometer aria-hidden="true" focusable="false" />}
                  label={t('waterTemp')}
                  value={formatValue(zoneForecast?.waterTemp ?? null, 'temperature', locale)}
                  unit={tempUnit}
                />
              </dl>

              {ripRiskKey !== null && (
                <div className="flex flex-col gap-2">
                  <RipCurrentBadge riskKey={ripRiskKey} t={t} />
                  {hazardsText && (
                    <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
                      {hazardsText}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 3. Scoring Breakdown
          DEFERRED: beach alignment and directional exposure multipliers
          (MARINE-COMPLETE-REMEDIATION-PLAN.md T7.1 line 978). The backend
          surf_scorer.py computes _beach_alignment() but does not expose it
          on SurfForecast — pending API field addition. */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">{t('surfing.scoringBreakdownTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {scoringFactors.length === 0 ? (
            <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
              {t('surfing.noForecastData')}
            </p>
          ) : (
            scoringFactors.map((factor) => (
              <ScoreBar
                key={factor.key}
                label={t('surfing.scoring.factorLabel', {
                  label: t(`surfing.scoring.${factor.key}`),
                  weight: factor.weight,
                })}
                score={factor.score}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* 4. 72-Hour Surf Forecast Timeline + wave face height chart */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">
            {isSinglePointForecast ? t('surfing.currentConditionsTitle') : t('surfing.forecastTimelineTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ForecastTimeline forecast={forecast} locale={locale} stationTz={stationTz} t={t} />
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

      {/* 5. Swell Components — ranked by energy, primary swell larger */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h3">{t('surfing.swellBreakdownTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <SwellBreakdown
            components={spectralComponents}
            locale={locale}
            heightUnit={heightUnit}
            periodUnit={periodUnit}
            t={t}
            tCommon={tCommon}
          />
        </CardContent>
      </Card>

      {/* 6. Swell Direction Compass — WindCompassCard tick-ring pattern */}
      <Card footprint="tile">
        <CardHeader>
          <CardTitle as="h3">{t('surfing.swellCompassTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
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
        </CardContent>
      </Card>

      {/* 7. Tide chart — standalone, 72h (shared component) */}
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

// ---------------------------------------------------------------------------
// Helper: dominant swell direction (highest-energy spectral component,
// falling back to the first forecast entry's direction field). Plain
// function, not a hook — SurfingTab calls it after its loading/error/no-data
// early returns, so it must not itself call useMemo/useState (Rules of
// Hooks — DASHBOARD-MANUAL §9 "React hooks constraint"). The input arrays
// are short (a handful of spectral components, 72 hourly forecast entries),
// so a plain reduce on every render is cheap enough that memoization isn't
// needed here.
// ---------------------------------------------------------------------------

function dominantSwellDirection(
  spectralComponents: SpectralWaveComponent[],
  forecast: SurfForecast[],
): number | null {
  if (spectralComponents.length > 0) {
    const dominant = spectralComponents.reduce((best, c) => (c.energy > best.energy ? c : best), spectralComponents[0]);
    return dominant.direction;
  }
  return forecast[0]?.direction ?? null;
}

/** Same "highest-energy component, else first forecast entry" selection as
 *  dominantSwellDirection, but returns height/period for the swell direction
 *  compass's center overlay. Kept as a separate function (rather than
 *  extending dominantSwellDirection's return shape) so existing callers of
 *  dominantSwellDirection are unaffected. */
function dominantSwellStats(
  spectralComponents: SpectralWaveComponent[],
  forecast: SurfForecast[],
): { height: number | null; period: number | null } {
  if (spectralComponents.length > 0) {
    const dominant = spectralComponents.reduce((best, c) => (c.energy > best.energy ? c : best), spectralComponents[0]);
    return { height: dominant.height, period: dominant.period };
  }
  const first = forecast[0];
  return { height: first?.waveHeightAtBreak ?? null, period: first?.period ?? null };
}

export default SurfingTab;
