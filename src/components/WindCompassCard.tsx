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

import { useTranslation } from 'react-i18next';
import { Wind } from '@phosphor-icons/react';
import { asConverted } from '../api/types';
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
// Tick generation constants (match mockup exactly)
// ---------------------------------------------------------------------------

const CX = 210;
const CY = 210;
const R_OUTER = 175;
const TICK_LEN = 24;
const TICK_W_DIM = 4.5;
const TICK_W_LIT = 6;
const TICK_COUNT = 72;
const LIT_HALF_RANGE = 4; // degrees either side of bearing — narrower for smoother 1-tick movement

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

  // Bearing in degrees for tick highlight.  Default 0 (N) when unavailable.
  const windDirDeg: number = windDirCV?.value ?? 0;

  // BFF-supplied canonical cardinal code (ADR-041).
  const windDirCardinal = observation?.windDirCardinal ?? null;
  // Translate via i18n (ADR-021).  Falls back to '—' when null.
  const cardinalLabel = windDirCardinal
    ? tCommon(`directions.${windDirCardinal}`)
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
  // Tick rendering — all ticks are dim/static; indicator rotates via CSS transform
  // ---------------------------------------------------------------------------
  const rInner = R_OUTER - TICK_LEN;
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const deg = (i / TICK_COUNT) * 360;
    const rad = ((deg - 90) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const x1 = CX + rInner * cosA;
    const y1 = CY + rInner * sinA;
    const x2 = CX + R_OUTER * cosA;
    const y2 = CY + R_OUTER * sinA;

    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="var(--muted-foreground)"
        strokeWidth={TICK_W_DIM}
        strokeLinecap="round"
        opacity={0.38}
      />
    );
  });

  // Rotating indicator — 3 bright ticks drawn at 0° (top), rotated to bearing via CSS transform.
  // CSS transition on transform gives smooth dial-like movement.
  const indicatorTicks = [-5, 0, 5].map((offset) => {
    const rad = ((offset - 90) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    return (
      <line
        key={offset}
        x1={CX + rInner * cosA}
        y1={CY + rInner * sinA}
        x2={CX + R_OUTER * cosA}
        y2={CY + R_OUTER * sinA}
        stroke="var(--primary)"
        strokeWidth={offset === 0 ? TICK_W_LIT : TICK_W_DIM}
        strokeLinecap="round"
        opacity={offset === 0 ? 1 : 0.7}
      />
    );
  });

  // Cardinal label positions outside tick ring (radius ~192 from center).
  // Coordinates hand-placed to match mockup exactly.
  const CARD_LABEL_STYLE: React.CSSProperties = {
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    fontSize: 14,
    fontWeight: 600,
  };

  return (
    <Card footprint="wide" rowSpan={2} aria-busy={observation === null}>
      <CardHeader>
        {/* Title: wind icon (decorative) + i18n title text */}
        <h2 className="font-heading leading-snug font-semibold pb-1.5 border-b border-border flex items-center gap-1.5" style={{ fontSize: 'var(--text-card-title, 0.82rem)' }}>
          <Wind
            aria-hidden="true"
            focusable={false}
            size={16}
            className="shrink-0 opacity-75"
          />
          {t('windCard.title')}
        </h2>
      </CardHeader>

      <CardContent>
        {/* Dial wrapper: SVG + absolute center overlay */}
        <div
          className="relative flex items-center justify-center"
          style={{ aspectRatio: '1 / 1', maxWidth: '20rem', margin: '0 auto' }}
        >
          {/* Tick-rim SVG dial */}
          <svg
            viewBox="0 0 420 420"
            role="img"
            aria-labelledby="wind-compass-title"
            focusable={false as unknown as boolean}
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <title id="wind-compass-title">{svgTitle}</title>

            {/* Ticks — static dim ring */}
            <g aria-hidden="true">{ticks}</g>

            {/* Rotating indicator — 3 bright ticks that rotate smoothly to bearing */}
            <g
              aria-hidden="true"
              style={{
                transformOrigin: `${CX}px ${CY}px`,
                transform: `rotate(${windDirDeg}deg)`,
                transition: 'transform 1s ease',
              }}
            >
              {indicatorTicks}
            </g>

            {/* Cardinal labels outside tick ring */}
            <text
              x={CX}
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
              y={CY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--muted-foreground)"
              style={CARD_LABEL_STYLE}
              aria-hidden="true"
            >
              E
            </text>
            <text
              x={CX}
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
              y={CY}
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
              gap: '0.15rem',
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

            {/* Current speed — Outfit display font, ~3rem */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'center',
                gap: '0.3rem',
                lineHeight: 1,
                margin: '0.1rem 0 0.2rem',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display, system-ui, sans-serif)',
                  fontWeight: 400,
                  fontSize: '3rem',
                  color: 'var(--foreground)',
                  letterSpacing: '-0.01em',
                  // Tabular figures: digits keep fixed width across SSE updates
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {speedDisplay}
              </span>
              {speedUnit && (
                <span
                  style={{
                    fontFamily: 'var(--font-display, system-ui, sans-serif)',
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
                gap: '0.4rem',
                marginTop: '0.3rem',
              }}
            >
              {/* Single wind icon spanning both readout lines */}
              <Wind
                aria-hidden="true"
                focusable={false}
                size={26}
                style={{
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
                    fontSize: '0.875rem',
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
                    fontSize: '0.875rem',
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
