// WindCompassCard.tsx — C2 Wind Compass card for the Now page.
//
// Renders a tick-rim SVG dial with all data inside the circle:
//   - Bearing + cardinal at top (bearing muted, cardinal bold via i18n)
//   - Current speed in display font (~3rem) at center
//   - 10-min avg and max gust readouts below speed
//   - 72 ticks (every 5°); ticks within 8° of bearing highlighted in --primary
//   - Cardinal labels (N/S/E/W) outside tick ring
//
// Visual design: matches approved mockup at docs/design/mockups/C2-current-wind.html
//
// A11y design (WCAG 2.1 AA):
//   - SVG has role="img" + <title> summarising all wind data (non-color)
//   - Direction conveyed by POSITION on the rim (which ticks are lit) — not color alone
//   - Center overlay has aria-live="polite" for SSE live updates
//   - Wind icon in title and readout block: aria-hidden (text carries meaning)
//   - All text values through i18n (no hardcoded UI strings)
//   - 1 decimal place enforced on all displayed wind values
//   - Missing avg/gust → "—" fallback (before BFF warm-up)

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Wind } from '@phosphor-icons/react';
import { asConverted } from '../api/types';
import { cardinalFromDegrees } from '../utils/wind';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import type { Observation } from '../api/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a ConvertedValue | number | null wind field to 1 decimal place.
 * Returns the formatted string and the unit label (for display).
 * Falls back to "—" with empty unit when the field is null/absent.
 *
 * The BFF owns unit conversion (ADR-042). We only enforce 1 decimal place
 * on the formatted string — we re-format .formatted by parsing the numeric
 * portion and re-stringifying to 1dp, to avoid depending on BFF formatting
 * convention.  This is safe: we never do unit arithmetic here.
 */
function formatWindField(
  field: import('../api/types').ConvertedValue | number | null | undefined,
  fallbackUnit = '',
): { display: string; unit: string } {
  const cv = asConverted(field ?? null);
  if (!cv || cv.value === null) return { display: '—', unit: fallbackUnit };
  return {
    display: cv.value.toFixed(1),
    unit: cv.label || fallbackUnit,
  };
}

// ---------------------------------------------------------------------------
// Tick generation constants (match C2 mockup exactly — viewBox 420×420)
// ---------------------------------------------------------------------------

const CX = 210;
const CY = 210;
const R_OUTER = 175;
const TICK_LEN = 24;
const TICK_W_DIM = 4.5;
const TICK_W_LIT = 6;
const TICK_COUNT = 72;
const LIT_HALF_RANGE = 8; // degrees either side of bearing — lights up ~3 ticks

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface WindCompassCardProps {
  observation: Observation | null;
  windSpeedAvg10m?: import('../api/types').ConvertedValue | number | null;
  windGustMax10m?: import('../api/types').ConvertedValue | number | null;
}

export function WindCompassCard({ observation, windSpeedAvg10m: avg10mProp, windGustMax10m: gustMax10mProp }: WindCompassCardProps) {
  const { t } = useTranslation('now');
  const { t: tCommon } = useTranslation('common');

  // Extract and normalise wind fields via asConverted (ADR-042).
  // We never do unit math here — all conversion is BFF-side.
  const windDirCV = asConverted(observation?.windDir ?? null);
  const windSpeedCV = asConverted(observation?.windSpeed ?? null);

  // Bearing in degrees — target value from BFF. Default 0 (N) when unavailable.
  const targetDeg: number = windDirCV?.value ?? 0;

  // Animated bearing — interpolates from previous to target over 1 second,
  // lighting up intermediate ticks as it sweeps.
  const [animatedDeg, setAnimatedDeg] = useState(targetDeg);
  const animRef = useRef<number | null>(null);
  const prevTargetRef = useRef(targetDeg);

  useEffect(() => {
    if (targetDeg === prevTargetRef.current) return;
    const startDeg = prevTargetRef.current;
    prevTargetRef.current = targetDeg;

    // Shortest angular path (handles 350°→10° wrap-around)
    let delta = ((targetDeg - startDeg + 540) % 360) - 180;
    const startTime = performance.now();
    const duration = 1000; // 1 second

    if (animRef.current !== null) cancelAnimationFrame(animRef.current);

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2; // ease-in-out
      const current = ((startDeg + delta * eased) % 360 + 360) % 360;
      setAnimatedDeg(current);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    }
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current !== null) cancelAnimationFrame(animRef.current); };
  }, [targetDeg]);

  const windDirDeg = animatedDeg;

  // BFF-supplied canonical cardinal code (ADR-041).
  const windDirCardinal = observation?.windDirCardinal ?? null;
  const windDirDegrees = windDirCV?.value ?? null;
  // When BFF nulls windDirCardinal (zero-speed calm), derive from bearing degrees
  // so both the cardinal label and bearing display stay consistent (ADR-041).
  const effectiveCardinal = windDirCardinal
    ?? (windDirDegrees != null ? cardinalFromDegrees(windDirDegrees) : null);
  // Translate via i18n (ADR-021).  Falls back to '—' when null.
  const cardinalLabel = effectiveCardinal
    ? tCommon(`directions.${effectiveCardinal}`)
    : '—';

  // Formatted speed parts.  Split formatted into numeric + unit so the
  // number can be rendered in the display font and unit in a smaller weight.
  const speedUnit = windSpeedCV?.label ?? '';
  const speedDisplay = windSpeedCV?.value !== null && windSpeedCV?.value !== undefined
    ? windSpeedCV.value.toFixed(1)
    : '—';

  // Bearing label string: "305°"
  const bearingLabel = windDirCV?.value !== null && windDirCV?.value !== undefined
    ? `${Math.round(windDirCV.value)}°`
    : '—';

  // 10-min avg and max gust — from BFF envelope (wired via props, not observation).
  const avg10m = formatWindField(avg10mProp ?? null, speedUnit);
  const gustMax10m = formatWindField(gustMax10mProp ?? null, speedUnit);

  // SVG <title> summarises all wind data for screen readers.
  const hasAvg = avg10m.display !== '—';
  const svgTitle = hasAvg
    ? t('windCard.svgTitle', {
        speed: `${speedDisplay} ${speedUnit}`.trim(),
        cardinal: cardinalLabel,
        degrees: Math.round(windDirDeg),
        avg: `${avg10m.display} ${avg10m.unit}`.trim(),
        gust: `${gustMax10m.display} ${gustMax10m.unit}`.trim(),
      })
    : t('windCard.svgTitleNoAvg', {
        speed: `${speedDisplay} ${speedUnit}`.trim(),
        cardinal: cardinalLabel,
        degrees: Math.round(windDirDeg),
      });

  // ---------------------------------------------------------------------------
  // Tick rendering — ticks within ±8° of bearing light up (change color).
  // CSS transitions on stroke/opacity provide visual smoothness when ticks
  // toggle state. The 3-tick highlight slides by one tick at a time as the
  // wind direction changes by ~5° (one tick spacing).
  // ---------------------------------------------------------------------------
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const deg = (i / TICK_COUNT) * 360;
    const rad = ((deg - 90) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const rInner = R_OUTER - TICK_LEN;
    const x1 = CX + rInner * cosA;
    const y1 = CY + rInner * sinA;
    const x2 = CX + R_OUTER * cosA;
    const y2 = CY + R_OUTER * sinA;

    const diff = Math.abs(((deg - windDirDeg + 540) % 360) - 180);
    const lit = diff < LIT_HALF_RANGE;

    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={lit ? 'var(--primary)' : 'var(--muted-foreground)'}
        strokeWidth={lit ? TICK_W_LIT : TICK_W_DIM}
        strokeLinecap="round"
        opacity={lit ? 1 : 0.38}
        style={{ transition: 'stroke 0.4s ease, stroke-width 0.4s ease, opacity 0.4s ease' }}
      />
    );
  });

  // Cardinal label positions outside tick ring.
  // Coordinates match C2 mockup exactly: N(210,18) E(402,210) S(210,402) W(18,210).
  const CARD_LABEL_STYLE: React.CSSProperties = {
    fontFamily: "'Manrope', var(--font-sans, system-ui, sans-serif)",
    fontSize: 14,
    fontWeight: 600,
  };

  return (
    <Card footprint="wide" rowSpan={2} aria-busy={observation === null}>
      <CardHeader>
        {/* Title: i18n title text (no decorative icon per operator preference) */}
        <h2 className="font-heading leading-snug font-semibold pb-1.5 border-b border-border" style={{ fontSize: 'var(--text-card-title, 0.82rem)' }}>
          {t('windCard.title')}
        </h2>
      </CardHeader>

      <CardContent>
        {/* Dial wrapper: fills available flex space, constrains SVG by height naturally */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
          }}
        >
          {/* Tick-rim SVG dial — max-width 20rem, aspect-ratio 1/1, no fixed max-height */}
          <svg
            viewBox="0 0 420 420"
            role="img"
            aria-labelledby="wind-compass-title"
            focusable={false as unknown as boolean}
            style={{ width: '100%', maxWidth: '20rem', aspectRatio: '1 / 1', display: 'block' }}
          >
            <title id="wind-compass-title">{svgTitle}</title>

            {/* Ticks — lit ticks near bearing change color via CSS transition */}
            <g aria-hidden="true">{ticks}</g>

            {/* Cardinal labels outside tick ring — positions match C2 mockup (420×420 viewBox) */}
            <text
              x={210}
              y={18}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--muted-foreground)"
              style={CARD_LABEL_STYLE}
              aria-hidden="true"
            >
              N
            </text>
            <text
              x={402}
              y={210}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--muted-foreground)"
              style={CARD_LABEL_STYLE}
              aria-hidden="true"
            >
              E
            </text>
            <text
              x={210}
              y={402}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--muted-foreground)"
              style={CARD_LABEL_STYLE}
              aria-hidden="true"
            >
              S
            </text>
            <text
              x={18}
              y={210}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--muted-foreground)"
              style={CARD_LABEL_STYLE}
              aria-hidden="true"
            >
              W
            </text>
          </svg>

          {/* Center overlay — live-updating values inside the dial ring */}
          <div
            aria-live="polite"
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
            {/* Bearing + cardinal: "305° NW" */}
            <div
              style={{
                fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                fontSize: '0.95rem',
                color: 'var(--muted-foreground)',
                letterSpacing: '0.04em',
              }}
            >
              {bearingLabel}
              <span
                style={{
                  color: 'var(--foreground)',
                  fontWeight: 600,
                  marginLeft: '0.2rem',
                }}
              >
                {cardinalLabel}
              </span>
            </div>

            {/* Current speed — Outfit display font, 18px */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'center',
                gap: '0.2rem',
                lineHeight: 1,
                margin: '0.05rem 0 0.1rem',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
                  fontWeight: 400,
                  fontSize: '3rem',
                  color: 'var(--foreground)',
                  letterSpacing: '-0.01em',
                }}
              >
                {speedDisplay}
              </span>
              {speedUnit && (
                <span
                  style={{
                    fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
                    fontWeight: 400,
                    fontSize: '1.05rem',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {speedUnit}
                </span>
              )}
            </div>

            {/* Readouts: icon + 10-min avg / max gust */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25rem',
                marginTop: '0.1rem',
              }}
            >
              {/* Single wind icon spanning both readout lines */}
              <Wind
                aria-hidden="true"
                focusable={false}
                style={{
                  width: '1.6rem',
                  height: '1.6rem',
                  flexShrink: 0,
                  opacity: 0.55,
                  alignSelf: 'center',
                  color: 'var(--foreground)',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.1rem',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                    fontSize: '0.95rem',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {t('windCard.tenMinAvg')}
                  <span
                    style={{
                      color: 'var(--foreground)',
                      fontWeight: 600,
                      marginLeft: '0.25rem',
                    }}
                  >
                    {avg10m.display !== '—'
                      ? `${avg10m.display} ${avg10m.unit}`.trim()
                      : '—'}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                    fontSize: '0.95rem',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {t('windCard.maxGust')}
                  <span
                    style={{
                      color: 'var(--foreground)',
                      fontWeight: 600,
                      marginLeft: '0.25rem',
                    }}
                  >
                    {gustMax10m.display !== '—'
                      ? `${gustMax10m.display} ${gustMax10m.unit}`.trim()
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
