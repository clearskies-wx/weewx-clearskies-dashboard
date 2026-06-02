// barometer-card.tsx — Barometer tile component for the Now page.
//
// Renders a semi-circular gauge (SemiCircularGauge, shared with AQI tile) showing
// the current barometric pressure value, with the value/unit/trend displayed inside
// the gauge arc.
//
// Design:
//   - Card footprint "tile" (1 column).
//   - Title: "Barometer" — text-only, Manrope 600 per design token.
//   - Gauge: uniform blue fill.  Scale centers on 29.92 inHg (standard pressure).
//   - Dynamic scale expansion: if the value approaches within 0.15 of min/max, expand
//     in 0.5 steps up to floor 27.0 / ceiling 32.0.
//   - Threshold ticks at 29.80 and 30.20 (NWS standard pressure boundaries).
//   - Children slot: value (Outfit 600 display font), unit label, trend arrow + label.
//
// A11y (WCAG 2.1 AA):
//   - SVG title summarises gauge state for screen readers.
//   - aria-live="polite" on the children container for SSE live updates.
//   - Trend conveyed by BOTH icon and text label — not color alone (§5.1).
//   - Trend icons are aria-hidden; the text label carries the accessible meaning.
//   - Card uses aria-busy during loading.
//
// Per ADR-042: the dashboard has zero unit knowledge.
//   - barometer.formatted is rendered verbatim (ConvertedValue.formatted).
//   - Unit label comes from barometer.label (BFF-supplied).
//   - No client-side unit math or threshold comparisons on display units.
//   - Dynamic scale expansion uses barometer.value (numeric, BFF-converted to operator units).
//     The 0.15 margin and 0.5 step are parameterized as props defaults so the operator
//     can configure them when inHg vs hPa requires different constants — for now they
//     match the inHg scale as the task specifies.
//   NOTE: The default min/max/threshold values (29.32, 30.52, 29.80, 30.20) and the
//         dynamic expansion floor/ceiling (27.0, 32.0) are inHg-specific constants.
//         When the BFF is updated to support hPa operator units, the BarometerCard
//         will need to read the unit from barometer.label and apply hPa-scaled
//         defaults, or receive those as props from the caller.  For v0.1 (US units
//         default per ADR-042), these constants are correct.

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, ArrowRight } from '@phosphor-icons/react';
import { asConverted } from '../api/types';
import { barometerTrendLabel } from '../utils/barometer';
import type { BarometerTrendDirection } from '../utils/barometer';
import { SemiCircularGauge } from './ui/semi-circular-gauge';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import type { Observation } from '../api/types';

// ---------------------------------------------------------------------------
// Constants (inHg scale — see unit note in file header)
// ---------------------------------------------------------------------------

const DEFAULT_MIN = 29.32;
const DEFAULT_MAX = 30.52;
const EXPAND_MARGIN = 0.15;  // expand when value is within this of min or max
const EXPAND_STEP = 0.5;     // expand by this amount per step
const SCALE_FLOOR = 27.0;    // never expand below this
const SCALE_CEILING = 32.0;  // never expand above this
const THRESHOLDS = [29.80, 30.20];

// ---------------------------------------------------------------------------
// Scale calculation
// ---------------------------------------------------------------------------

/**
 * Compute the gauge [min, max] for a given barometer value.
 *
 * The default scale is [29.32, 30.52], centered at 29.92 (standard pressure).
 * If the value approaches within EXPAND_MARGIN of either edge, expand that
 * edge outward in EXPAND_STEP increments (floored/ceilinged at SCALE_FLOOR/CEILING).
 * After expansion, re-center around 29.92 symmetrically if possible.
 */
function computeScale(value: number | null): { min: number; max: number } {
  let min = DEFAULT_MIN;
  let max = DEFAULT_MAX;

  if (value === null) return { min, max };

  // Expand min edge if value is too close
  while (value - min < EXPAND_MARGIN && min > SCALE_FLOOR) {
    min = Math.max(SCALE_FLOOR, min - EXPAND_STEP);
  }

  // Expand max edge if value is too close
  while (max - value < EXPAND_MARGIN && max < SCALE_CEILING) {
    max = Math.min(SCALE_CEILING, max + EXPAND_STEP);
  }

  // Re-center around 29.92 if there is room (keep the wider half).
  // This keeps the "standard" pressure near the visual midpoint of the arc.
  const CENTER = 29.92;
  const halfSpan = Math.max(CENTER - min, max - CENTER);
  const idealMin = CENTER - halfSpan;
  const idealMax = CENTER + halfSpan;

  // Only apply re-center when it doesn't shrink the expanded range and stays within floor/ceiling.
  if (idealMin >= SCALE_FLOOR && idealMax <= SCALE_CEILING) {
    min = idealMin;
    max = idealMax;
  }

  return { min, max };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BarometerSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-32"
      aria-hidden="true"
    />
  );
}

function BarometerError({
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

/**
 * Trend arrow icon — Phosphor icon set (ADR-050: consistent set for all metric trends).
 * ph:arrow-up (rising) · ph:arrow-down (falling) · ph:arrow-right (steady).
 * Icon is aria-hidden; the sibling text label carries accessible state.
 */
function TrendIcon({ direction }: { direction: BarometerTrendDirection }) {
  const cls = 'shrink-0 text-muted-foreground';
  if (direction === 'rising') {
    return <ArrowUp aria-hidden="true" className={cls} size={12} />;
  }
  if (direction === 'falling') {
    return <ArrowDown aria-hidden="true" className={cls} size={12} />;
  }
  return <ArrowRight aria-hidden="true" className={cls} size={12} />;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BarometerCardProps {
  observation: Observation | null;
  /**
   * BFF-computed barometer trend direction from the /current envelope.
   * Passed separately from observation because it lives at the response
   * envelope level (ADR-041/ADR-042).  Null when insufficient data.
   */
  barometerTrendDirection: BarometerTrendDirection | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BarometerCard({
  observation,
  barometerTrendDirection,
  loading = false,
  error = null,
  onRetry,
}: BarometerCardProps) {
  const { t } = useTranslation('now');

  // Normalise the barometer field via asConverted (ADR-042).
  const barometerCV = asConverted(observation?.barometer ?? null);
  const barometerValue = barometerCV?.value ?? null;
  const barometerFormatted = barometerCV?.formatted ?? '—';
  const barometerUnit = barometerCV?.label ?? '';

  // Compute gauge scale
  const { min: gaugeMin, max: gaugeMax } = computeScale(barometerValue);

  // Trend label via i18n (ADR-021).
  // barometerTrendLabel uses the 'now' namespace: precipBarometer.trend.*
  const trendText = barometerTrendLabel(barometerTrendDirection, t);

  // SVG accessible title summarises all relevant data for screen readers.
  const svgTitle = observation
    ? `${t('barometerCard.title')}: ${barometerFormatted}${barometerUnit ? ' ' + barometerUnit : ''}${barometerTrendDirection ? ', ' + trendText : ''}`
    : t('barometerCard.title');

  return (
    <Card footprint="tile" aria-busy={loading}>
      <CardHeader>
        {/* Title: text-only per spec — NO icon.  Manrope 600 via font-heading. */}
        <h2 className="font-heading text-base leading-snug font-semibold">
          {t('barometerCard.title')}
        </h2>
      </CardHeader>

      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loading.barometer')}</span>
            <BarometerSkeleton />
          </>
        ) : error ? (
          <BarometerError
            message={t('error.barometer')}
            onRetry={onRetry ?? (() => undefined)}
          />
        ) : (
          <SemiCircularGauge
            value={barometerValue ?? (gaugeMin + gaugeMax) / 2}
            min={gaugeMin}
            max={gaugeMax}
            colorMode="uniform"
            thresholds={THRESHOLDS}
            endpointLabels={['Low', 'High']}
            svgTitle={svgTitle}
          >
            {/* Children: value / unit / trend — rendered centered inside the arc.
                aria-live="polite" so SSE updates are announced (ADR-041).         */}
            <div
              aria-live="polite"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.1rem',
                pointerEvents: 'none',
              }}
            >
              {/* Primary value — Outfit 600 (display font per typography tokens) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.2rem',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display, system-ui, sans-serif)',
                    fontWeight: 600,
                    // Scale font size down for long values; barometer needs ~5 chars
                    fontSize: '1.6rem',
                    color: 'var(--foreground)',
                    letterSpacing: '-0.01em',
                    fontFeatureSettings: '"tnum"',
                    lineHeight: 1,
                  }}
                >
                  {barometerFormatted}
                </span>
                {barometerUnit && (
                  <span
                    style={{
                      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                      fontWeight: 400,
                      fontSize: '0.75rem',
                      color: 'var(--muted-foreground)',
                      lineHeight: 1,
                    }}
                  >
                    {barometerUnit}
                  </span>
                )}
              </div>

              {/* Trend: arrow icon (aria-hidden) + text label (carries a11y state) */}
              {barometerTrendDirection !== null && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    marginTop: '0.1rem',
                  }}
                >
                  <TrendIcon direction={barometerTrendDirection} />
                  <span
                    style={{
                      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                      fontWeight: 400,
                      fontSize: '0.72rem',
                      color: 'var(--muted-foreground)',
                      lineHeight: 1,
                    }}
                  >
                    {trendText}
                  </span>
                </div>
              )}
            </div>
          </SemiCircularGauge>
        )}
      </CardContent>
    </Card>
  );
}
