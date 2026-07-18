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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
// Recharts imports removed — WaveFaceHeightChart replaced by inline SVG trend
import { Info, Waves, Timer, Compass, X, Thermometer, Drop, Snowflake } from '@phosphor-icons/react';
import { useSurfDetail, useMarineDetail, useStation, useObservation, useForecast } from '../../../hooks/useWeatherData';
import { WindSymbol } from '../../forecast/WindSymbol';
import { toWmoCode } from '../../../utils/weather-code';
import { selectWeatherIcon } from '../../../utils/icon-selection';
import { asConverted } from '../../../api/types';
import { WeatherIcon } from '../../weather-icon';
import { UvIndex } from '../../icons/uv-index';
import { formatValue } from '../../../utils/format';
// formatNumber available if energy display is re-added
// // Energy display removed — formatNumber no longer needed
// import { formatNumber } from '../../../utils/format-number';
import { formatTime } from '../../../utils/format-date';
import { cardinalFromDegrees } from '../../../utils/wind';
import { Grid } from '../../../components/layout/grid';
// ChartContainer import removed — no Recharts charts remain in this file
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
// MarineStatTile available for future use — swell card uses icon-left inline layout
// import { MarineStatTile } from '../shared/MarineStatTile';
import { HorizontalScrollNav } from '../../ui/horizontal-scroll-nav';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';
// buildHourTicks import removed — no longer needed without WaveFaceHeightChart
import type {
  SpectralWaveComponent,
  SurfForecast,
  MarineAlertSummary,
  MarineForecastPoint,
  HourlyForecastPoint,
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

function scoreTierColor(score: number): string {
  const r = Math.round(Math.max(0, Math.min(5, score)));
  if (r >= 5) return 'var(--score-5)';
  if (r >= 4) return 'var(--score-4)';
  if (r >= 3) return 'var(--score-3)';
  if (r >= 2) return 'var(--score-2)';
  return 'var(--score-1)';
}

function StarRating({
  score,
  label,
  size,
}: {
  score: number;
  label: string;
  size: 'lg' | 'sm';
}) {
  const clamped = Math.max(0, Math.min(5, Math.round(score)));
  const color = scoreTierColor(score);
  const starSize = size === 'lg' ? 28 : 16;
  const gap = size === 'lg' ? '0.25rem' : '0.15rem';

  return (
    <div className="flex flex-col" style={{ gap: size === 'lg' ? '0.375rem' : '0.2rem' }}>
      <div className="flex items-center" style={{ gap }} aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <svg key={i} width={starSize} height={starSize} viewBox="0 0 24 24" fill={i < clamped ? color : 'var(--muted-foreground)'} opacity={i < clamped ? 1 : 0.25}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
          </svg>
        ))}
      </div>
      <span className="sr-only">{clamped} of 5 — </span>
      <span style={{ fontSize: size === 'lg' ? 'var(--text-body)' : 'var(--text-label)', color, fontWeight: 600 }}>
        {label}
      </span>
    </div>
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
  return scoreTierColor(Math.round(pct / 20));
}


function ScoreBar({ label, score }: { label: string; score: number }) {
  const isNegative = score < 0;
  const absPct = Math.max(0, Math.min(100, Math.abs(score)));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between" style={{ fontSize: 'var(--text-label)' }}>
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground" style={{ fontFeatureSettings: '"tnum"' }}>
          {isNegative ? `−${Math.round(absPct)}` : Math.round(score)}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: 'var(--gauge-unfill)' }}
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${absPct}%`,
            background: isNegative ? 'var(--score-1)' : scoreBarFillColor(score),
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surf Score explainer modal — explains the 5-star scoring system.
//
// A11y (DESIGN-MANUAL §16):
//   - role="dialog" + aria-modal="true" on the content div
//   - aria-labelledby references modal heading
//   - Focus moves to close button on open; restored to trigger on close (caller)
//   - Escape key closes via document keydown listener
//   - Tab focus trap: Tab/Shift-Tab cycles within modal
//   - Backdrop click closes
//   - ≥44px touch target on close button (WCAG 2.5.8)
//
// Surface treatment (DESIGN-MANUAL §8):
//   - Overlay: rgba(0,0,0,0.60) + blur(4px)
//   - Modal content: .card-glass + blur(16px) + ring-1 ring-foreground/10
// ---------------------------------------------------------------------------

const EXPLAINER_FACTORS: ReadonlyArray<{ key: string; weight: string | null }> = [
  { key: 'waveHeight',     weight: '35%' },
  { key: 'wavePeriod',     weight: '35%' },
  { key: 'windQuality',    weight: '20%' },
  { key: 'swellDominance', weight: '10%' },
  { key: 'beachAlignment', weight: null  }, // penalty, not a weighted factor
];

function ScoringExplainerModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('marine');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Move focus to close button when modal opens
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      // Focus trap: Tab / Shift-Tab cycles within the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'rgba(0,0,0,0.60)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scoring-explainer-title"
        className="relative card-glass rounded-xl ring-1 ring-foreground/10 max-w-lg w-full"
        style={{
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        {/* Modal header */}
        <div
          className="sticky top-0 flex items-center justify-between border-b border-border card-glass"
          style={{ padding: 'var(--card-pad)', paddingBottom: '0.75rem' }}
        >
          <h2
            id="scoring-explainer-title"
            className="font-heading font-semibold"
            style={{ fontSize: 'var(--text-card-title)' }}
          >
            {t('surfing.scoringExplainer.title')}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('surfing.scoringExplainer.close')}
            className="shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus:outline-none rounded ml-2"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex flex-col gap-4" style={{ padding: 'var(--card-pad)' }}>
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
            {t('surfing.scoringExplainer.intro')}
          </p>

          <div className="flex flex-col gap-3">
            {EXPLAINER_FACTORS.map((f) => (
              <div key={f.key} className="flex flex-col gap-0.5">
                <span className="font-semibold text-foreground" style={{ fontSize: 'var(--text-label)' }}>
                  {t(`surfing.scoring.${f.key}`)}
                  {f.weight !== null
                    ? <span className="text-muted-foreground font-normal"> ({f.weight})</span>
                    : <span className="text-muted-foreground font-normal"> ({t('surfing.scoring.penalty')})</span>
                  }
                </span>
                <p className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
                  {t(`surfing.scoringExplainer.${f.key}`)}
                </p>
              </div>
            ))}
          </div>

          <p
            className="text-muted-foreground border-t border-border pt-3"
            style={{ fontSize: 'var(--text-label)' }}
          >
            {t('surfing.scoringExplainer.tiers')}
          </p>
        </div>
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

/**
 * computeEntryScore — compute a 0-100 total score from a single SurfForecast entry.
 *
 * Uses the same weighted-factor formula as the Surf Score hero card. Returns
 * the total score (XX/100) used for the forecast column score row.
 */
function computeEntryScore(
  entry: SurfForecast,
  heightUnit: string,
  surfHeightDisplay?: 'face' | 'hawaiian' | null,
): number {
  const displayH = getDisplayHeight(entry, surfHeightDisplay ?? null);
  const raw = {
    waveHeight:     entry.scoring?.waveHeight     ?? waveHeightScore(displayH, heightUnit),
    wavePeriod:     entry.scoring?.wavePeriod     ?? periodScore(entry.period),
    windQuality:    entry.scoring?.windQuality    ?? windQualityScore(entry.windQuality),
    swellDominance: entry.scoring?.swellDominance ?? Math.max(0, Math.min(100, entry.swellDominance * 100)),
    beachAlignment: entry.scoring?.beachAlignment ?? 50,
  };
  const subtotal =
    Math.round(raw.waveHeight     * 0.35) +
    Math.round(raw.wavePeriod     * 0.35) +
    Math.round(raw.windQuality    * 0.20) +
    Math.round(raw.swellDominance * 0.10);
  return Math.round(subtotal * raw.beachAlignment / 100);
}

// ---------------------------------------------------------------------------
// SWAN display helpers (Phase 5 T5.1 / T5.2)
// ---------------------------------------------------------------------------

/**
 * getDisplayHeight — return the display-appropriate wave height for an entry.
 *
 * Uses the operator's configured surfHeightDisplay preference:
 *   "face"     → breakingFaceHeight (trough-to-crest, standard surf scale)
 *   "hawaiian" → breakingHawaiianHeight (back-of-wave, ~0.5× face height)
 *   null/other → breakingFaceHeight preferred, waveHeightAtBreak as fallback
 *
 * Falls back to waveHeightAtBreak when SWAN fields are null — e.g. when
 * SWAN is unavailable and WW3 provides the fallback data.
 */
function getDisplayHeight(
  entry: SurfForecast,
  surfHeightDisplay: 'face' | 'hawaiian' | null,
): number | null {
  if (surfHeightDisplay === 'hawaiian') {
    return entry.breakingHawaiianHeight ?? entry.waveHeightAtBreak ?? null;
  }
  return entry.breakingFaceHeight ?? entry.waveHeightAtBreak ?? null;
}

/**
 * formatRelativeTime — format a past UTC ISO-8601 timestamp as a human-readable
 * relative string (e.g. "34 minutes ago") using Intl.RelativeTimeFormat.
 * Returns null when dateStr is null or unparseable.
 */
function formatRelativeTime(dateStr: string | null | undefined, locale: string): string | null {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return null;
  const diffMs = then - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (absSec < 60)   return rtf.format(Math.round(diffSec), 'second');
  if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (absSec < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

/**
 * nearshoreModelDisplayName — map the API's nearshoreModel identifier to a
 * human-readable display name. Only "swan" is currently issued.
 */
function nearshoreModelDisplayName(modelId: string | null | undefined): string {
  if (modelId === 'swan') return 'SWAN';
  return modelId ?? '';
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
  const fs = 'var(--text-label)';

  return (
    <table className="w-full border-collapse" style={{ fontSize: fs, fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)' }}>
      <thead>
        <tr>
          <th className="text-left text-muted-foreground font-semibold pb-1.5 pr-2" style={{ fontSize: 'var(--text-micro)' }}>{t('surfing.swellType')}</th>
          <th className="text-left text-muted-foreground font-semibold pb-1.5 pr-2" style={{ fontSize: 'var(--text-micro)' }}>{t('surfing.direction')}</th>
          <th className="text-right text-muted-foreground font-semibold pb-1.5 pr-2" style={{ fontSize: 'var(--text-micro)' }}>{t('surfing.height')}</th>
          <th className="text-right text-muted-foreground font-semibold pb-1.5" style={{ fontSize: 'var(--text-micro)' }}>{t('surfing.period')}</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((c, i) => {
          const classKey = c.classification in CLASSIFICATION_COLOR ? c.classification : 'swell';
          const cardinal = cardinalFromDegrees(c.direction);
          const cardinalLabel = cardinal ? tCommon(`directions.${cardinal}`) : '—';
          const periodTier = periodQualityTier(c.period);

          return (
            <tr key={i} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
              <td className="py-1 pr-2 font-semibold whitespace-nowrap">{t(`surfing.classification.${classKey}`)}</td>
              <td className="py-1 pr-2 whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  <SwellDirectionArrow directionDeg={c.direction} />
                  {cardinalLabel}
                </span>
              </td>
              <td className="py-1 pr-2 text-right font-semibold whitespace-nowrap" style={{ fontFeatureSettings: '"tnum"' }}>
                {formatValue(c.height, 'default', locale)} <span className="text-muted-foreground font-normal">{heightUnit}</span>
              </td>
              <td className="py-1 text-right font-semibold whitespace-nowrap" style={{ fontFeatureSettings: '"tnum"' }}>
                {formatValue(c.period, 'default', locale)} <span className="text-muted-foreground font-normal">{periodUnit}</span>
                {periodTier && <span className="text-muted-foreground font-normal ml-1">{t(`surfing.periodQuality.${periodTier}`)}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
  t,
  tCommon,
}: {
  directionDeg: number | null;
  height?: number | null;
  period?: number | null;
  heightUnit?: string;
  periodUnit?: string;
  locale?: string;
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
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)', fontSize: 'var(--text-stat-tile)', fontWeight: 600, color: 'var(--foreground)', fontFeatureSettings: '"tnum"' }}>
          {Math.round(directionDeg)}°
        </div>
        <div style={{ fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)', fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--foreground)' }}>
          {cardinalLabel}
        </div>
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

// dominantSwellStats removed — height/period now shown only in the component table

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

/** 1.5h threshold for hourly forecast matching — surf periods are 3-6h apart
 *  so a 1.5h window captures the nearest hourly slot cleanly. */
const HOURLY_MATCH_THRESHOLD_MS = 1.5 * 60 * 60 * 1000;

function nearestHourlyPoint(ts: number, hours: HourlyForecastPoint[]): HourlyForecastPoint | null {
  if (hours.length === 0) return null;
  let best: HourlyForecastPoint | null = null;
  let bestDiff = Infinity;
  for (const h of hours) {
    const diff = Math.abs(new Date(h.validTime).getTime() - ts);
    if (diff <= HOURLY_MATCH_THRESHOLD_MS && diff < bestDiff) {
      best = h;
      bestDiff = diff;
    }
  }
  return best;
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
  /** Nearest HourlyForecastPoint within 1.5h — for weather icon, air temp, precip, wind rows. */
  hourlyPoint: HourlyForecastPoint | null;
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
// SurfScrollForecast — 72-hour forecast, redesigned to match HourlyStrip.
//
// Layout: row-major (each row spans ALL columns), like HourlyStrip.tsx.
// Wrapped in HorizontalScrollNav. Columns are 72px wide.
//
// Row order and section grouping:
//   Section 1 — Header + Score (transparent):
//     Row 1: Time label (<button> per column — the a11y interaction target)
//     Row 2: Score 0-100 (aria-hidden, visual supplement to time button label)
//   Section 2 — Weather (bg-muted/15 subtle tint):
//     Row 3: WeatherIcon (time-matched from useForecast hourly)
//     Row 4: Air temp (time-matched from useForecast hourly)
//     Row 5: Precip % with drop/snowflake icon
//     Row 6: WindSymbol (time-matched from useForecast hourly)
//   Section 3 — Surf conditions (transparent):
//     Row 7:  Wind quality ("Offshore", "Cross-shore", etc.)
//     Row 8:  Water temp (from marine.forecast[].waterTemp, time-matched)
//     Row 9:  Wave height trend — single SVG polyline spanning all columns
//     Row 10: Dom direction (cardinal)
//     Row 11: Period (seconds)
//     Row 12: Energy (swellDominance × 100)
//
// A11y:
//   - Time row cells are <button type="button"> with aria-expanded + aria-label
//   - All other rows are display-only <div> (non-interactive)
//   - Score span is aria-hidden (AT uses the time button label for context)
//   - Wave height trend SVG is aria-hidden (decorative chart)
//   - WeatherIcon, WindSymbol both render with aria-hidden internally
//   - Detail panel uses aria-live="polite"
//   - HorizontalScrollNav provides role="region" + aria-label
// ---------------------------------------------------------------------------

const SURF_COL_W = 72; // px — matches task spec
const ROW_HEADER_W = 80; // px — fixed left column for row labels

const SURF_CELL_BASE: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const WAVE_CHART_H = 140; // px — wave height chart area

const SURF_ROW_H = {
  time:        24,
  score:       28,
  icon:        40,
  airTemp:     24,
  precip:      22,
  wind:        40,
  windQuality: 34,
  waterTemp:   22,
  waveValues:  22,
  trendSvg:    WAVE_CHART_H,
  direction:   22,
  period:      22,
  energy:      22,
} as const;

const ROW_HEADER_STYLE: React.CSSProperties = {
  width: ROW_HEADER_W,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  paddingRight: '0.5rem',
  fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
  fontSize: 'var(--text-micro)',
  fontWeight: 500,
  color: 'var(--muted-foreground)',
  whiteSpace: 'nowrap',
};

const SECTION_DIVIDER: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  marginTop: '0.35rem',
  marginBottom: '0.35rem',
};

const WAVE_BLUE = '#3b82f6';
const WAVE_BLUE_FILL = 'rgba(59, 130, 246, 0.15)';

const DETAIL_PANEL_BG = 'var(--detail-panel-bg, rgba(80,100,255,0.08))';

function SurfScrollForecast({
  dayGroups,
  locale,
  stationTz,
  heightUnit,
  periodUnit,
  windUnit,
  tempUnit,
  surfHeightDisplay,
  t,
  tCommon,
}: {
  dayGroups: ForecastDayGroup[];
  locale: string;
  stationTz: string;
  heightUnit: string;
  periodUnit: string;
  windUnit: string;
  tempUnit: string;
  /** Operator-configured height display preference; null defaults to face height. */
  surfHeightDisplay: 'face' | 'hawaiian' | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tCommon: (key: string) => string;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Attach a flat index to each group for expanded-state tracking.
  const groupsWithIdx = useMemo(() => {
    let startIdx = 0;
    return dayGroups.map((group) => {
      const withIdx = { key: group.key, label: group.label, items: group.items, startIdx };
      startIdx += group.items.length;
      return withIdx;
    });
  }, [dayGroups]);

  // Resolve the expanded entry for the detail panel.
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

  // Detail panel chip renderer.
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

  // Flatten all items across day groups for the unified wave height chart.
  const allItems = useMemo(() => dayGroups.flatMap((g) => g.items), [dayGroups]);
  const allWaveHeights = allItems.map((it) => getDisplayHeight(it.entry, surfHeightDisplay));
  const validAllH = allWaveHeights.filter((h): h is number => h != null && !isNaN(h));
  const globalMaxH = validAllH.length > 0 ? Math.max(...validAllH) : 1;
  const trendH = SURF_ROW_H.trendSvg;
  const totalCols = allItems.length;


  // Helper: render a row of data cells across all day groups (no header — that's added by the caller).
  function renderRow(
    rowKey: string,
    height: number,
    renderCell: (item: EnrichedForecastEntry, flatIdx: number, isSelected: boolean) => React.ReactNode,
    extraStyle?: React.CSSProperties,
  ) {
    return (
      <div key={rowKey} style={{ display: 'flex', flexDirection: 'row', ...extraStyle }}>
        {groupsWithIdx.map((group) =>
          group.items.map((item, i) => {
            const flatIdx = group.startIdx + i;
            const isSelected = expandedIdx === flatIdx;
            return (
              <div
                key={flatIdx}
                style={{
                  width: SURF_COL_W,
                  height,
                  ...SURF_CELL_BASE,
                  background: isSelected ? DETAIL_PANEL_BG : 'transparent',
                }}
              >
                {renderCell(item, flatIdx, isSelected)}
              </div>
            );
          }),
        )}
      </div>
    );
  }

  // Build the cell text style (reused across many rows).
  const microText: React.CSSProperties = {
    fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
    fontSize: 'var(--text-micro)',
    color: 'var(--muted-foreground)',
    lineHeight: 1,
  };

  const tempUnitLabel = tempUnit ? tempUnit.replace(/^\s+/, '') : '°';

  // Y-axis: 0–12 ft minimum, auto-scales above if data exceeds 12.
  const Y_AXIS_MIN = 12;
  const yMax = Math.max(Y_AXIS_MIN, Math.ceil(globalMaxH + 1));
  const TREND_PAD_TOP = 6;
  const TREND_PAD_BOT = 2;
  const chartDrawH = trendH - TREND_PAD_TOP - TREND_PAD_BOT;

  function hToY(h: number | null): number {
    if (h == null || isNaN(h)) return TREND_PAD_TOP + chartDrawH;
    return TREND_PAD_TOP + chartDrawH - (h / yMax) * chartDrawH;
  }

  // Y-axis tick interval: every 3 units for readability.
  const yTickInterval = yMax <= 15 ? 3 : yMax <= 30 ? 5 : 10;

  // Build smooth cubic bezier path for the wave curve.
  function buildSmoothPath(items: EnrichedForecastEntry[]): string {
    const pts = items.map((item, i) => ({
      x: i * SURF_COL_W + SURF_COL_W / 2,
      y: hToY(getDisplayHeight(item.entry, surfHeightDisplay)),
    }));
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  }

  // Build area fill path (curve + baseline at bottom).
  function buildAreaPath(items: EnrichedForecastEntry[]): string {
    const curvePath = buildSmoothPath(items);
    if (!curvePath || items.length === 0) return '';
    const lastX = (items.length - 1) * SURF_COL_W + SURF_COL_W / 2;
    const firstX = SURF_COL_W / 2;
    const baseY = TREND_PAD_TOP + chartDrawH;
    return `${curvePath} L${lastX},${baseY} L${firstX},${baseY} Z`;
  }

  // Y-axis tick values at regular intervals.
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += yTickInterval) yTicks.push(v);

  // Row header helper.
  function rowHeader(height: number, label?: string) {
    return (
      <div style={{ ...ROW_HEADER_STYLE, height }}>
        {label && <span>{label}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Row headers + scrollable content side-by-side. The header column is
          position:sticky so it stays visible while the data scrolls. */}
      <HorizontalScrollNav ariaLabel={t('surfing.forecastTimelineTitle')}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            width: 'max-content',
            padding: '0 0.25rem 0.5rem',
          }}
        >
          {/* ── Fixed row header column ── */}
          <div
            style={{
              width: ROW_HEADER_W,
              flexShrink: 0,
              position: 'sticky',
              left: 0,
              zIndex: 2,
              background: 'rgb(var(--card-glass))',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderRight: '1px solid var(--border)',
            }}
          >
            {rowHeader(22)}
            {/* Score */}
            {rowHeader(SURF_ROW_H.time)}
            {rowHeader(SURF_ROW_H.score, t('surfing.scoreLabel', { defaultValue: 'Score' }))}
            <div style={SECTION_DIVIDER} />
            {/* Current Conditions */}
            {rowHeader(SURF_ROW_H.icon)}
            {rowHeader(SURF_ROW_H.airTemp, t('surfing.airTempLabel', { defaultValue: 'Air Temp' }))}
            {rowHeader(SURF_ROW_H.precip, t('surfing.precipLabel', { defaultValue: 'Precip' }))}
            {rowHeader(SURF_ROW_H.wind, t('surfing.windLabel', { defaultValue: 'Wind' }))}
            {rowHeader(SURF_ROW_H.windQuality, t('surfing.windQualityLabel', { defaultValue: 'Quality' }))}
            <div style={SECTION_DIVIDER} />
            {/* Swells */}
            {rowHeader(SURF_ROW_H.waterTemp, t('surfing.waterTempLabel', { defaultValue: 'Water' }))}
            {/* Wave chart Y-axis labels in the header column */}
            <div style={{ ...ROW_HEADER_STYLE, height: SURF_ROW_H.trendSvg, flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: TREND_PAD_TOP, paddingBottom: TREND_PAD_BOT }}>
              {[...yTicks].reverse().map((v) => (
                <span key={v} style={{ fontSize: '9px', lineHeight: 1, color: 'var(--muted-foreground)', fontFeatureSettings: '"tnum"' }}>
                  {v}
                </span>
              ))}
            </div>
            {rowHeader(SURF_ROW_H.waveValues, t('surfing.swellHeightLabel', { defaultValue: 'Swell Height' }))}
            {rowHeader(SURF_ROW_H.direction, t('surfing.directionLabel', { defaultValue: 'Direction' }))}
            {rowHeader(SURF_ROW_H.period, t('surfing.periodLabel', { defaultValue: 'Period' }))}
            {rowHeader(SURF_ROW_H.energy, t('surfing.energyLabel', { defaultValue: 'Power' }))}
          </div>

          {/* ── Scrollable data columns ── */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Day labels */}
            <div style={{ display: 'flex', flexDirection: 'row', height: 22 }}>
              {groupsWithIdx.map((group) => (
                <div
                  key={group.key}
                  style={{
                    width: group.items.length * SURF_COL_W,
                    fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                    fontSize: 'var(--text-label)',
                    fontWeight: 600,
                    color: 'var(--muted-foreground)',
                    paddingLeft: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {group.label}
                </div>
              ))}
            </div>

            {/* ── Score section ── */}

            {/* Time buttons */}
            <div style={{ display: 'flex', flexDirection: 'row' }}>
              {groupsWithIdx.map((group) =>
                group.items.map((item, i) => {
                  const flatIdx = group.startIdx + i;
                  const isSelected = expandedIdx === flatIdx;
                  const timeLabel = formatTime(new Date(item.entry.time), locale, stationTz);
                  return (
                    <button
                      key={flatIdx}
                      type="button"
                      onClick={() => setExpandedIdx((prev) => (prev === flatIdx ? null : flatIdx))}
                      aria-expanded={isSelected}
                      aria-label={`${timeLabel} — ${item.entry.qualityLabel}`}
                      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm"
                      style={{
                        width: SURF_COL_W,
                        height: SURF_ROW_H.time,
                        ...SURF_CELL_BASE,
                        background: isSelected ? DETAIL_PANEL_BG : 'transparent',
                        border: 'none',
                        borderTop: `2px solid ${isSelected ? 'var(--primary)' : 'transparent'}`,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                        fontSize: 'var(--text-label)',
                        fontWeight: 600,
                        color: isSelected ? 'var(--primary)' : 'var(--muted-foreground)',
                        whiteSpace: 'nowrap',
                        lineHeight: 1,
                      }}>
                        {timeLabel}
                      </span>
                    </button>
                  );
                }),
              )}
            </div>

            {/* Score */}
            {renderRow('score', SURF_ROW_H.score, (item) => {
              const score = computeEntryScore(item.entry, heightUnit, surfHeightDisplay);
              return (
                <span aria-hidden="true" style={{
                  fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
                  fontSize: 'var(--text-body)',
                  fontWeight: 700,
                  fontFeatureSettings: '"tnum"',
                  lineHeight: 1,
                  color: scoreBarFillColor(score),
                }}>
                  {score}
                </span>
              );
            })}

            <div style={SECTION_DIVIDER} />

            {/* ── Current Conditions ── */}

            {renderRow('icon', SURF_ROW_H.icon, (item) => {
              const hp = item.hourlyPoint;
              const iconResult = hp
                ? selectWeatherIcon({
                    weatherCode: toWmoCode(hp.weatherCode),
                    precipProbability: hp.precipProbability,
                    cloudCover: hp.cloudCover,
                    isNight: false,
                  })
                : null;
              return iconResult
                ? <WeatherIcon code={iconResult.code} isNight={iconResult.isNight} size={28} />
                : <span style={microText}>—</span>;
            })}

            {renderRow('airTemp', SURF_ROW_H.airTemp, (item) => {
              const hp = item.hourlyPoint;
              return (
                <span style={{
                  fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
                  fontSize: 'var(--text-label)',
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  lineHeight: 1,
                }}>
                  {hp?.outTemp != null ? `${Math.round(hp.outTemp)}${tempUnitLabel}` : '—'}
                </span>
              );
            })}

            {renderRow('precip', SURF_ROW_H.precip, (item) => {
              const hp = item.hourlyPoint;
              const isSnow = hp?.precipType === 'snow';
              return (
                <span style={{ display: 'flex', alignItems: 'center', gap: 2, ...microText }}>
                  {isSnow ? <Snowflake aria-hidden="true" size={8} /> : <Drop aria-hidden="true" size={8} />}
                  {hp?.precipProbability != null ? `${hp.precipProbability}%` : '—'}
                </span>
              );
            })}

            {renderRow('wind', SURF_ROW_H.wind, (item) => {
              const hp = item.hourlyPoint;
              return <WindSymbol bearing={hp?.windDir ?? null} speed={hp?.windSpeed != null ? Math.round(hp.windSpeed) : 0} size={20} />;
            }, { overflow: 'visible' })}

            {renderRow('windQuality', SURF_ROW_H.windQuality, (item) => (
              <span style={{ ...microText, textAlign: 'center', lineHeight: 1.2, maxWidth: `${SURF_COL_W - 6}px` }}>
                {item.entry.windQuality ?? '—'}
              </span>
            ))}

            <div style={SECTION_DIVIDER} />

            {/* ── Swells ── */}

            {renderRow('waterTemp', SURF_ROW_H.waterTemp, (item) => {
              const wt = item.windPoint?.waterTemp ?? null;
              return <span style={microText}>{wt != null ? `${wt.toFixed(1)}${tempUnitLabel}` : '—'}</span>;
            })}

            {/* Wave height chart — smooth curve with blue area fill, Y-axis */}
            <div style={{ height: trendH, width: totalCols * SURF_COL_W, flexShrink: 0 }}>
              <svg
                viewBox={`0 0 ${totalCols * SURF_COL_W} ${trendH}`}
                width={totalCols * SURF_COL_W}
                height={trendH}
                aria-hidden="true"
                focusable={false as unknown as boolean}
                style={{ display: 'block' }}
              >
                {/* Y-axis gridlines */}
                {yTicks.map((v) => {
                  const y = hToY(v);
                  return (
                    <line key={v} x1={0} y1={y} x2={totalCols * SURF_COL_W} y2={y}
                      stroke="var(--border)" strokeWidth={0.5} strokeDasharray={v === 0 ? 'none' : '2,3'} />
                  );
                })}
                {/* Area fill */}
                <path d={buildAreaPath(allItems)} fill={WAVE_BLUE_FILL} />
                {/* Smooth curve */}
                <path d={buildSmoothPath(allItems)} fill="none" stroke={WAVE_BLUE} strokeWidth={2} />
                {/* Dots */}
                {allItems.map((item, i) => {
                  const x = i * SURF_COL_W + SURF_COL_W / 2;
                  const y = hToY(getDisplayHeight(item.entry, surfHeightDisplay));
                  return <circle key={i} cx={x} cy={y} r={2.5} fill={WAVE_BLUE} />;
                })}
              </svg>
            </div>

            {/* Wave height values row — uses breakingFaceHeight or breakingHawaiianHeight
                 per surfHeightDisplay; falls back to waveHeightAtBreak when SWAN
                 fields are absent (WW3 fallback data). */}
            {renderRow('waveValues', SURF_ROW_H.waveValues, (item) => {
              const val = getDisplayHeight(item.entry, surfHeightDisplay);
              return (
                <span style={{
                  fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
                  fontSize: 'var(--text-label)',
                  fontWeight: 600,
                  fontFeatureSettings: '"tnum"',
                  color: 'var(--foreground)',
                  lineHeight: 1,
                }}>
                  {val != null && !isNaN(val) ? `${formatValue(val, 'default', locale)} ${heightUnit}` : '—'}
                </span>
              );
            })}

            {renderRow('direction', SURF_ROW_H.direction, (item) => {
              const cardinal = cardinalFromDegrees(item.entry.direction);
              return <span style={microText}>{cardinal ?? '—'}</span>;
            })}

            {renderRow('period', SURF_ROW_H.period, (item) => (
              <span style={microText}>{item.entry.period != null ? `${Math.round(item.entry.period)}s` : '—'}</span>
            ))}

            {renderRow('energy', SURF_ROW_H.energy, (item) => {
              const energy = Math.round(item.entry.swellDominance * 100);
              return <span style={microText}>{energy}%</span>;
            })}
          </div>
        </div>
      </HorizontalScrollNav>

      {/* Detail panel — outside the scroll area; grows the card vertically.
          aria-live="polite" announces content changes to screen readers. */}
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
              background: DETAIL_PANEL_BG,
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
              {chip(t('surfing.swellHeightStatLabel', { defaultValue: 'Swell Height' }), `${formatValue(entry.swellHeight ?? entry.waveHeightAtBreak, 'default', locale)} ${heightUnit}`)}
              {chip(t('surfing.faceBreakHeightLabel', { defaultValue: 'Breaking Face Height' }), `${formatValue(getDisplayHeight(entry, surfHeightDisplay), 'default', locale)} ${heightUnit}`)}
              {chip(t('surfing.period'), `${formatValue(entry.period, 'default', locale)} ${periodUnit}`)}
              {chip(t('surfing.direction'), swellDirLabel)}
              {chip(t('surfing.windQualityTitle'), entry.windQuality ?? '—')}
              {windPoint?.windSpeed != null && chip(t('windSpeed'), `${formatValue(windPoint.windSpeed, 'wind', locale)} ${windUnit}`)}
              {chip(t('surfing.windDirection'), windDirLabel)}
              {tideEvent && chip(
                tideEvent.type === 'high' ? t('tide.tideHigh') : t('tide.tideLow'),
                `${formatValue(tideEvent.height, 'default', locale)} ${heightUnit} · ${formatTime(new Date(tideEvent.time), locale, stationTz)}`,
              )}
            </div>

            {/* Per-period swell component breakdown */}
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

// WaveFaceHeightChart removed — wave height is now shown as an inline SVG
// polyline trend within the 72-hour forecast scroll columns (row 9).

// ---------------------------------------------------------------------------
// WaterThermometerIcon — local inline SVG: thermometer + water drop.
//
// Represents water temperature in the Current Conditions card.
// Not a shared component (scope rule: no new files). 24×24 default.
// A11y: aria-hidden + focusable=false — label text is in sibling span/dt.
// ---------------------------------------------------------------------------

function WaterThermometerIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable={false as unknown as boolean}
    >
      {/* Thermometer: open-bottom tube (left area of icon) */}
      <path d="M7 14V6a1.5 1.5 0 0 1 3 0v8" />
      {/* Thermometer bulb */}
      <circle cx="8.5" cy="17.5" r="2.5" />
      {/* Water drop (right area): tip at top, rounded at bottom */}
      <path d="M17.5 7l2.5 5a3 3 0 0 1-5 0l2.5-5z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// NearshoreModelIndicator — T5.2 data source indicator for the 72h forecast.
//
// Displays: "Model: SWAN" + "Last model run: X minutes ago" + an
// accessible info disclosure that explains what SWAN is.
//
// A11y:
//   - All text in --text-micro, color: --muted-foreground (decorative metadata)
//   - <details>/<summary> provides native keyboard access (Tab → Enter to toggle)
//   - summary has a visible focus ring via focus-visible:ring-2
//   - The info panel uses role="status" so AT announces it politely on open
//   - Color is not the only signal (text labels carry the full meaning)
//   - Renders null when nearshoreModel is absent (WW3 fallback, no SWAN data)
// ---------------------------------------------------------------------------

function NearshoreModelIndicator({
  nearshoreModel,
  lastRunTime,
  locale,
  t,
}: {
  nearshoreModel: string | null | undefined;
  lastRunTime: string | null | undefined;
  locale: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (!nearshoreModel) return null;

  const modelLabel = nearshoreModelDisplayName(nearshoreModel);
  const relativeTime = formatRelativeTime(lastRunTime, locale);

  const metaStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
    fontSize: 'var(--text-micro)',
    color: 'var(--muted-foreground)',
    lineHeight: 1.4,
  };

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        paddingTop: '0.5rem',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.375rem',
      }}
    >
      {/* "Model: SWAN" */}
      <span style={metaStyle}>
        {t('surfing.nearshoreModel', { model: modelLabel })}
      </span>

      {/* Separator dot */}
      {relativeTime && (
        <>
          <span aria-hidden="true" style={{ ...metaStyle, opacity: 0.5 }}>·</span>
          {/* "Last model run: 34 minutes ago" */}
          <span style={metaStyle}>
            {t('surfing.lastModelRun', { time: relativeTime })}
          </span>
        </>
      )}

      {/* Info disclosure — accessible via keyboard (Tab + Enter/Space) */}
      <details style={{ display: 'inline-block', position: 'relative' }}>
        <summary
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            listStyle: 'none',
            color: 'var(--muted-foreground)',
            minWidth: '24px',
            minHeight: '24px',
          }}
          aria-label={t('surfing.modelTooltipTitle')}
        >
          <Info size={12} aria-hidden="true" />
        </summary>
        {/* Tooltip panel — appears below the info icon */}
        <div
          role="status"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            zIndex: 20,
            background: 'var(--popover)',
            color: 'var(--popover-foreground)',
            border: '1px solid var(--border)',
            borderRadius: '0.375rem',
            padding: '0.625rem 0.75rem',
            maxWidth: '280px',
            width: 'max-content',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
            fontSize: 'var(--text-micro)',
          }}
        >
          <p
            className="font-semibold mb-1"
            style={{ color: 'var(--foreground)', fontSize: 'var(--text-label)' }}
          >
            {t('surfing.modelTooltipTitle')}
          </p>
          <p style={{ color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            {t('surfing.modelTooltip')}
          </p>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SurfingTab — main export
// ---------------------------------------------------------------------------

export function SurfingTab({ locationId, alerts = [] }: SurfingTabProps) {
  const { t, i18n } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const locale = i18n.language;

  // ── Scoring explainer modal ───────────────────────────────────────────────
  const [showExplainer, setShowExplainer] = useState(false);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const handleCloseExplainer = useCallback(() => {
    setShowExplainer(false);
    // Restore focus to the trigger button (DESIGN-MANUAL §16)
    infoButtonRef.current?.focus();
  }, []);

  const { data, units, loading: surfLoading, error: surfError, refetch: refetchSurf } = useSurfDetail(locationId);
  const { data: marine, units: marineUnits, loading: marineLoading } = useMarineDetail(locationId);
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';
  // Station/forecast-provider observation — air temp, weather icon, UV index.
  // NOT marine data. Does not gate the loading spinner: the card degrades
  // gracefully (shows '—') while obsData is loading or if the station is offline.
  const obsData = useObservation();
  // Hourly forecast — used for weather icon, air temp, precip, wind rows in
  // the 72-hour surf forecast card. Does NOT gate the loading spinner; the
  // forecast scroll degrades gracefully (shows '—') while forecast is loading.
  const { data: forecastData } = useForecast({ hours: 72 });

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
    const hf = forecastData?.hourly  ?? [];
    return fc.map((entry) => {
      const ts = new Date(entry.time).getTime();
      return {
        entry,
        windPoint:   nearestForecastPoint(ts, mf),
        hourlyPoint: nearestHourlyPoint(ts, hf),
        tideEvent:   nearestTideEvent(ts, tp),
      };
    });
  }, [data, marine, forecastData]);

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

  // ── SWAN display preference (T5.1) ───────────────────────────────────────
  // "face" → breakingFaceHeight (trough-to-crest)
  // "hawaiian" → breakingHawaiianHeight (back-of-wave ~0.5×)
  // null → default to "face" behavior
  const surfHeightDisplay = data.surfHeightDisplay ?? null;

  // ── Live wind observation (from marine bundle) ────────────────────────────
  const observation    = marine?.observation ?? null;
  const windDirCardinal = cardinalFromDegrees(observation?.windDirection ?? null);
  const windDirLabel   = windDirCardinal ? tCommon(`directions.${windDirCardinal}`) : '—';

  // ── Primary forecast entry (closest to NOW, not time 0 from model start) ──
  const primary = forecast.length > 0
    ? forecast.reduce((best, entry) => {
        const bestDiff = Math.abs(new Date(best.time).getTime() - Date.now());
        const diff = Math.abs(new Date(entry.time).getTime() - Date.now());
        return diff < bestDiff ? entry : best;
      }, forecast[0])
    : null;

  // ── Swell components — nearest entry WITH multiSwell data.
  // Not every forecast entry has spectral decomposition: full SWAN runs (4×/day)
  // produce multiSwell; hourly quick updates do not. Find the entry closest to
  // NOW that actually carries multiSwell, falling back to the first entry with it.
  const swellSourceEntry = (() => {
    const withSwell = forecast.filter((e) => e.multiSwell && e.multiSwell.length > 0);
    if (withSwell.length === 0) return null;
    const now = Date.now();
    return withSwell.reduce((best, e) => {
      const bestDiff = Math.abs(new Date(best.time).getTime() - now);
      const diff = Math.abs(new Date(e.time).getTime() - now);
      return diff < bestDiff ? e : best;
    }, withSwell[0]);
  })();
  const swellComponents: SpectralWaveComponent[] = swellSourceEntry?.multiSwell ?? [];

  const dominantDirection = dominantSwellDirection(swellComponents);

  const swellDirCardinal = cardinalFromDegrees(primary?.direction ?? null);
  const swellDirLabel    = swellDirCardinal ? tCommon(`directions.${swellDirCardinal}`) : '—';

  // ── Scoring breakdown — weighted contributions to the total score.
  // Each factor's bar shows its weighted contribution (raw × weight/100),
  // not the raw 0-100 score. Beach alignment is a penalty: it shows the
  // negative amount subtracted from the weighted subtotal.
  // totalScore = subtotal × (beachAlignment/100), displayed as XX/100.
  const scoringBreakdown = (() => {
    if (!primary) return { factors: [] as { key: string; weight: number | null; score: number }[], totalScore: 0 };

    const raw = {
      waveHeight: primary.scoring?.waveHeight ?? waveHeightScore(getDisplayHeight(primary, surfHeightDisplay), heightUnit),
      wavePeriod: primary.scoring?.wavePeriod ?? periodScore(primary.period),
      windQuality: primary.scoring?.windQuality ?? windQualityScore(primary.windQuality),
      swellDominance: primary.scoring?.swellDominance ?? Math.max(0, Math.min(100, primary.swellDominance * 100)),
      beachAlignment: primary.scoring?.beachAlignment ?? 50,
    };

    const weighted = {
      waveHeight: Math.round(raw.waveHeight * 0.35),
      wavePeriod: Math.round(raw.wavePeriod * 0.35),
      windQuality: Math.round(raw.windQuality * 0.20),
      swellDominance: Math.round(raw.swellDominance * 0.10),
    };

    const subtotal = weighted.waveHeight + weighted.wavePeriod + weighted.windQuality + weighted.swellDominance;
    const alignmentMultiplier = raw.beachAlignment / 100;
    const totalScore = Math.round(subtotal * alignmentMultiplier);
    const penaltyAmount = totalScore - subtotal;

    return {
      factors: [
        { key: 'waveHeight', weight: 35 as number | null, score: weighted.waveHeight },
        { key: 'wavePeriod', weight: 35 as number | null, score: weighted.wavePeriod },
        { key: 'windQuality', weight: 20 as number | null, score: weighted.windQuality },
        { key: 'swellDominance', weight: 10 as number | null, score: weighted.swellDominance },
        { key: 'beachAlignment', weight: null as number | null, score: penaltyAmount },
      ],
      totalScore,
    };
  })();

  // ── Current conditions — station/forecast provider (NOT marine) ──────────
  // weatherCode: from station Observation (conditions engine, optional field).
  // daytime: from scene.daytime (SceneDescriptor on ObservationHookResult).
  // airTemp: converted numeric value; unit embedded in ConvertedValue.label.
  // UV: from station Observation.UV (ConvertedValue | number | null).
  // waterTemp: from marine observation (already fetched for Wind card).
  const currentConditionCode  = obsData.data?.weatherCode ?? null;
  const currentDaytime        = obsData.scene?.daytime ?? true;
  const airTempCV             = asConverted(obsData.data?.outTemp ?? null);
  const airTempValue          = airTempCV?.value != null ? airTempCV.formatted : '—';
  const airTempUnit           = airTempCV?.value != null ? (airTempCV.label ?? '') : '';
  const dewpointCV            = asConverted(obsData.data?.dewpoint ?? null);
  const dewpointValue         = dewpointCV?.value != null ? dewpointCV.formatted : '—';
  const dewpointUnit          = dewpointCV?.value != null ? (dewpointCV.label ?? '') : '';
  const uvCV                  = asConverted(obsData.data?.UV ?? null);
  const uvValue               = uvCV?.value != null ? String(Math.round(uvCV.value)) : '—';
  const waterTempValue        = marine?.observation?.waterTemp != null
    ? formatValue(marine.observation.waterTemp, 'temperature', locale)
    : '—';
  const waterTempUnit         = marine?.observation?.waterTemp != null
    ? (marineUnits?.temperature ?? marineUnits?.waterTemp ?? '')
    : '';

  // ── Forecast layout helpers ───────────────────────────────────────────────
  // Always compute day groups — SurfScrollForecast handles single-entry day groups.
  // Filter out past entries — only show current + future periods
  const nowMs = Date.now();
  const futureEntries = enrichedForecast.filter((e) => new Date(e.entry.time).getTime() >= nowMs - 90 * 60 * 1000);
  const dayGroups = groupForecastByDay(futureEntries.length > 0 ? futureEntries : enrichedForecast, locale, stationTz);

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
            {/* Info button — opens scoring explainer modal (DESIGN-MANUAL §6 HeaderButton).
             *  aria-label describes the action (not icon name). ≥44px touch target (WCAG 2.5.8). */}
            <button
              ref={infoButtonRef}
              type="button"
              onClick={() => setShowExplainer(true)}
              aria-label={t('surfing.scoringExplainer.title')}
              className="shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus:outline-none rounded ml-2"
              style={{ minWidth: '44px', minHeight: '44px', fontSize: 'var(--text-label)' }}
            >
              <Info size={18} aria-hidden="true" />
            </button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {primary === null ? (
              <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
                {t('surfing.noForecastData')}
              </p>
            ) : (
              <>
                {/* Star rating + total score */}
                <div className="flex items-start justify-between">
                  <StarRating
                    score={primary.qualityStars}
                    label={primary.qualityLabel}
                    size="lg"
                  />
                  <span
                    className="font-semibold text-foreground"
                    style={{
                      fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
                      fontSize: 'var(--text-stat-tile)',
                      fontFeatureSettings: '"tnum"',
                    }}
                  >
                    {scoringBreakdown.totalScore}
                    <span className="text-muted-foreground font-normal" style={{ fontSize: 'var(--text-label)' }}>/100</span>
                  </span>
                </div>

                {/* Conditions text — not bolded */}
                <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
                  {primary.conditionsText}
                </p>

                {/* Scoring factor bars — weighted contributions */}
                <div className="flex flex-col gap-3">
                  {scoringBreakdown.factors.map((factor) => (
                    <ScoreBar
                      key={factor.key}
                      label={
                        factor.weight !== null
                          ? t('surfing.scoring.factorLabel', {
                              label:  t(`surfing.scoring.${factor.key}`),
                              weight: factor.weight,
                            })
                          : `${t(`surfing.scoring.${factor.key}`)} (${t('surfing.scoring.penalty')})`
                      }
                      score={factor.score}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Card 3: Current Swell Conditions — 2×2 fixed ────────── */}
        <Card footprint="wide" rowSpan={2}>
          <CardHeader>
            <CardTitle as="h3">{t('surfing.swellCardTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {/* Row 1: Conditions at Break (combined wave) — stat tiles */}
            {primary !== null && (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground font-semibold" style={{ fontSize: 'var(--text-micro)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t('surfing.conditionsAtBreak')}
                </span>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                  {/* Icon-left stat: icon beside the value/label block */}
                  {[
                    { icon: <Waves weight="bold" />, label: t('surfing.swellHeightStatLabel', { defaultValue: 'Swell Height' }), value: formatValue(primary.swellHeight ?? primary.waveHeightAtBreak, 'default', locale), unit: heightUnit },
                    { icon: <Waves weight="bold" />, label: t('surfing.faceBreakHeightLabel', { defaultValue: 'Breaking Face Height' }), value: formatValue(getDisplayHeight(primary, surfHeightDisplay), 'default', locale), unit: heightUnit },
                    { icon: <Timer weight="bold" />, label: t('surfing.period'), value: formatValue(primary.period, 'default', locale), unit: periodUnit },
                    { icon: <Compass weight="bold" />, label: t('surfing.direction'), value: swellDirLabel, unit: undefined },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-2">
                      <span aria-hidden="true" className="shrink-0 text-muted-foreground" style={{ fontSize: 'var(--text-stat-tile)' }}>
                        {s.icon}
                      </span>
                      <div className="flex flex-col">
                        <dt className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>{s.label}</dt>
                        <dd className="text-foreground font-semibold" style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}>
                          {s.value}
                          {s.unit && <span className="text-muted-foreground font-normal ml-1" style={{ fontSize: 'var(--text-label)' }}>{s.unit}</span>}
                        </dd>
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Row 2: Swell components table (left 2/3) + compass (right 1/3) */}
            <div className="flex flex-row gap-4 flex-1 min-h-0">
              {/* Left: component table */}
              <div className="flex flex-col gap-1 flex-[2] min-w-0">
                <span className="text-muted-foreground font-semibold" style={{ fontSize: 'var(--text-micro)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t('surfing.swellBreakdownTitle')}
                </span>
                <SwellBreakdown
                  components={swellComponents}
                  locale={locale}
                  heightUnit={heightUnit}
                  periodUnit={periodUnit}
                  t={t}
                  tCommon={tCommon}
                />
              </div>

              {/* Right: compass */}
              {swellComponents.length > 0 && (
                <div className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-muted-foreground font-semibold self-center" style={{ fontSize: 'var(--text-micro)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t('surfing.dominantDirection')}
                  </span>
                  <div className="flex-1 flex items-center justify-center w-full">
                    <SwellDirectionCompass
                      directionDeg={dominantDirection}
                      t={t}
                      tCommon={tCommon}
                    />
                  </div>
                </div>
              )}
            </div>
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
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
              {[
                { label: t('windSpeed'), value: formatValue(observation?.windSpeed ?? null, 'wind', locale), unit: windUnit },
                { label: t('surfing.gust'), value: formatValue(observation?.windGust ?? null, 'wind', locale), unit: windUnit },
                { label: t('surfing.windDirection'), value: windDirLabel, unit: undefined },
                { label: t('surfing.windQualityTitle'), value: primary?.windQuality ?? '—', unit: undefined },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-0.5">
                  <dt className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>{s.label}</dt>
                  <dd className="text-foreground font-semibold" style={{ fontSize: 'var(--text-stat-label)', fontFeatureSettings: '"tnum"' }}>
                    {s.value}
                    {s.unit && <span className="text-muted-foreground font-normal ml-1" style={{ fontSize: 'var(--text-label)' }}>{s.unit}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        {/* ── Card 5: Current Conditions — 2×half, icon-left stat tiles ── */}
        {/*
         * Data sources (NOT all marine):
         *   weatherCode / isNight — obsData (station/forecast provider)
         *   airTemp — obsData.data.outTemp (station, ConvertedValue)
         *   UV index — obsData.data.UV (station, ConvertedValue)
         *   waterTemp — marine.observation.waterTemp (ocean resolver, numeric)
         *
         * Layout: 4-column grid, each item icon-left of value+label block.
         * Matches "Conditions at Break" icon-left pattern in Swell card.
         *
         * A11y:
         *   - All icons aria-hidden / focusable=false (decorative)
         *   - Each stat label is visible text (text-muted-foreground)
         *   - No color-only state signals
         *   - WeatherIcon aria-hidden; card heading ("Current Conditions")
         *     provides the accessible context for the condition visual
         */}
        <Card footprint="wide" rowSpan="half">
          <CardHeader>
            <CardTitle as="h3">{t('surfing.currentConditionsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2 items-center">

              {/* Col 1: Current sky condition — WeatherIcon visual.
               *  WCAG 1.1.1 (Non-text Content): icon is aria-hidden (decorative);
               *  sr-only span carries weatherText when available. When weatherText
               *  is null the card heading "Current Conditions" provides the
               *  accessible context; the condition visual is treated as decorative. */}
              <div className="flex justify-center items-center">
                <span aria-hidden="true">
                  <WeatherIcon
                    code={currentConditionCode ?? 0}
                    isNight={!currentDaytime}
                    size={36}
                  />
                </span>
                {obsData.data?.weatherText && (
                  <span className="sr-only">{obsData.data.weatherText}</span>
                )}
              </div>

              {/* Col 2: Air temp — Thermometer icon + value + label */}
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                  style={{ fontSize: 'var(--text-stat-tile)' }}
                >
                  <Thermometer weight="bold" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
                    {t('airTemp')}
                  </span>
                  <span
                    className="text-foreground font-semibold"
                    style={{ fontSize: 'var(--text-stat-label)', fontFeatureSettings: '"tnum"', fontFamily: 'var(--font-display)' }}
                  >
                    {airTempValue}
                    {airTempUnit && (
                      <span className="text-muted-foreground font-normal ml-1" style={{ fontSize: 'var(--text-label)' }}>
                        {airTempUnit}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Col 3: Dewpoint — Drop icon + value + label */}
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                  style={{ fontSize: 'var(--text-stat-tile)' }}
                >
                  <Drop weight="bold" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
                    {t('surfing.dewpoint', { defaultValue: 'Dewpoint' })}
                  </span>
                  <span
                    className="text-foreground font-semibold"
                    style={{ fontSize: 'var(--text-stat-label)', fontFeatureSettings: '"tnum"', fontFamily: 'var(--font-display)' }}
                  >
                    {dewpointValue}
                    {dewpointUnit && (
                      <span className="text-muted-foreground font-normal ml-1" style={{ fontSize: 'var(--text-label)' }}>
                        {dewpointUnit}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Col 4: Water temp — WaterThermometerIcon + value + label */}
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                  style={{ fontSize: 'var(--text-stat-tile)' }}
                >
                  <WaterThermometerIcon size={24} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
                    {t('waterTemp')}
                  </span>
                  <span
                    className="text-foreground font-semibold"
                    style={{ fontSize: 'var(--text-stat-label)', fontFeatureSettings: '"tnum"', fontFamily: 'var(--font-display)' }}
                  >
                    {waterTempValue}
                    {waterTempUnit && (
                      <span className="text-muted-foreground font-normal ml-1" style={{ fontSize: 'var(--text-label)' }}>
                        {waterTempUnit}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Col 4: UV index — UvIndex icon + value + label */}
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                  style={{ fontSize: 'var(--text-stat-tile)' }}
                >
                  <UvIndex size={24} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
                    {t('beachSafety.uvIndex')}
                  </span>
                  <span
                    className="text-foreground font-semibold"
                    style={{ fontSize: 'var(--text-stat-label)', fontFeatureSettings: '"tnum"', fontFamily: 'var(--font-display)' }}
                  >
                    {uvValue}
                  </span>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>

        {/* ── Card 5: 72-Hour Surf Forecast — full width ── */}
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
                tempUnit={marineUnits?.temperature ?? marineUnits?.waterTemp ?? units?.temperature ?? '°'}
                surfHeightDisplay={surfHeightDisplay}
                t={t}
                tCommon={tCommon}
              />
            )}
            {/* T5.2 — SWAN model provenance indicator */}
            <NearshoreModelIndicator
              nearshoreModel={data.nearshoreModel}
              lastRunTime={data.lastRunTime}
              locale={locale}
              t={t}
            />
          </CardContent>
        </Card>

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

      {/* Scoring explainer modal — position:fixed, renders above page content */}
      {showExplainer && <ScoringExplainerModal onClose={handleCloseExplainer} />}

    </div>
  );
}

export default SurfingTab;
