// semi-circular-gauge.tsx — Shared reusable semi-circular gauge component.
//
// Used by: BarometerCard (uniform mode), AQI tile (gradient mode, future).
//
// Geometry:
//   SVG viewBox 0 0 200 112.  Center (100, 100), radius 88.
//   Arc sweeps 180° from the left (9-o-clock = "min") to the right (3-o-clock = "max")
//   via the top (12-o-clock = midpoint of range).
//   36 ticks uniformly spaced every 5° across the 180° arc.
//   "Filled" ticks: those at positions ≤ value.  "Unfilled": positions > value.
//   Indicator tick: the one tick closest to the current value position.
//   Threshold ticks: taller + thicker, mark meteorological or scale boundaries.
//
// A11y (WCAG 2.1 AA):
//   - SVG role="img" with <title> carrying a text summary (screen readers).
//   - Value position is conveyed by POSITION of filled ticks — not color alone.
//   - All decorative ticks are aria-hidden (grouped under aria-hidden="true").
//   - The children slot (value text) sits outside the SVG in an accessible live region;
//     callers are expected to set aria-live="polite" on the parent (BarometerCard does this).
//   - Both --gauge-fill (#3b82f6 light / #60a5fa dark) and --gauge-indicator (#1e40af light /
//     #93c5fd dark) pass AA 3:1 contrast against the card glass background in both themes.
//   - --gauge-unfill uses rgba(0,0,0,0.22) on white ≈ #c5c5c5; sits at ~1.6:1 — intentionally
//     low contrast for the "empty" track, which is a decorative non-text UI element.
//     The filled/indicator portion always passes 3:1; the unfilled portion is not informational.

import * as React from 'react';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ColorBand {
  from: number;
  to: number;
  color: string;
}

export interface SemiCircularGaugeProps {
  /** Current value to display on the gauge. */
  value: number;
  /** Minimum of the scale (maps to left/9-o-clock endpoint). */
  min: number;
  /** Maximum of the scale (maps to right/3-o-clock endpoint). */
  max: number;
  /**
   * Color strategy for filled ticks.
   * "uniform" — all filled ticks use --gauge-fill.
   * "gradient" — filled ticks use the colorBands array to look up their band color.
   */
  colorMode: 'uniform' | 'gradient';
  /**
   * Color bands for gradient mode.  Each band covers a numeric range; the tick color
   * is taken from whichever band contains the tick's value position on the scale.
   * Ignored in uniform mode.
   */
  colorBands?: ColorBand[];
  /**
   * Labels for the left (min) and right (max) endpoints of the arc.
   * Rendered as small SVG text outside the arc ends.
   */
  endpointLabels?: [string, string];
  /**
   * Scale values at which to render threshold ticks (taller + thicker than normal).
   * Used to mark meteorological or scale boundaries.
   */
  thresholds?: number[];
  /**
   * Content to render centered inside the gauge arc — typically the value readout,
   * unit, and trend indicator.  Rendered in a positioned div, not inside the SVG.
   */
  children?: React.ReactNode;
  /**
   * Accessible title for the SVG gauge.  Screen readers announce this.
   * Provide a plain-text summary of what the gauge shows, e.g.
   * "Barometer: 29.94 inHg, Rising".
   */
  svgTitle?: string;
}

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------

const VB_W = 200;
const VB_H = 112;
const CX = 100;           // arc center X
const CY = 100;           // arc center Y (below bottom of viewBox when full circle)
const R = 88;             // outer tick radius
const TICK_COUNT = 36;    // 36 ticks → 5° apart across 180°

// Regular tick dimensions
const TICK_LEN_NORMAL = 14;
const TICK_W_NORMAL = 2.5;
const TICK_W_UNFILLED = 2.5;

// Indicator tick dimensions (current value marker)
const TICK_LEN_INDICATOR = 24;
const TICK_W_INDICATOR = 5;

// Threshold tick dimensions (boundary markers)
const TICK_LEN_THRESHOLD = 22;
const TICK_W_THRESHOLD = 4;

// Endpoint label radius offset from center
const LABEL_R = 98;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a fraction [0, 1] within the scale to a math-convention angle in degrees.
 * fraction=0 → 180° (left, 9-o-clock).
 * fraction=1 → 0° (right, 3-o-clock).
 * Angle sweeps through 90° (top, 12-o-clock) at fraction=0.5.
 */
function fractionToAngleDeg(fraction: number): number {
  return 180 - fraction * 180;
}

/**
 * Convert a math-convention angle (degrees) to SVG x,y coordinates on the circle.
 * SVG Y-axis is inverted: positive Y goes down, so we negate the sin component.
 */
function polarToXY(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CX + r * Math.cos(rad),
    y: CY - r * Math.sin(rad),
  };
}

/**
 * Look up the color for a given scale value in the colorBands array.
 * Returns the band color for the first band whose [from, to] range contains the value,
 * or 'currentColor' as a fallback.
 */
function bandColorForValue(value: number, bands: ColorBand[]): string {
  for (const band of bands) {
    if (value >= band.from && value <= band.to) return band.color;
  }
  // Fallback: use the nearest band by distance
  if (bands.length === 0) return 'currentColor';
  return bands[bands.length - 1].color;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SemiCircularGauge({
  value,
  min,
  max,
  colorMode,
  colorBands = [],
  endpointLabels,
  thresholds = [],
  children,
  svgTitle,
}: SemiCircularGaugeProps) {
  // Clamp value within [min, max] to prevent tick math from going out of bounds.
  const clampedValue = Math.min(Math.max(value, min), max);
  const range = max - min;

  // Value fraction [0, 1]
  const valueFraction = range > 0 ? (clampedValue - min) / range : 0;

  // Which tick index (0..TICK_COUNT-1) is closest to the value position?
  // Tick i maps to fraction (i / (TICK_COUNT - 1)) along the scale.
  const indicatorTickIndex = Math.round(valueFraction * (TICK_COUNT - 1));

  // Precompute threshold tick fractions for quick membership test
  const thresholdFractions = thresholds.map((t) =>
    range > 0 ? (t - min) / range : 0,
  );

  // Build tick elements
  const tickElements = Array.from({ length: TICK_COUNT }, (_, i) => {
    const tickFraction = i / (TICK_COUNT - 1);
    const tickScaleValue = min + tickFraction * range;
    const angleDeg = fractionToAngleDeg(tickFraction);

    const isIndicator = i === indicatorTickIndex;
    // Tick is "filled" (on the value side) when its index ≤ indicatorTickIndex
    const isFilled = i <= indicatorTickIndex;

    // Is this tick a threshold? Check if any threshold fraction is close to this tick.
    const isThreshold = thresholdFractions.some(
      (tf) => Math.abs(tf - tickFraction) < 0.5 / (TICK_COUNT - 1),
    );

    // Tick dimensions — indicator wins over threshold wins over normal
    let tickLen = TICK_LEN_NORMAL;
    let tickWidth = isFilled ? TICK_W_NORMAL : TICK_W_UNFILLED;

    if (isIndicator) {
      tickLen = TICK_LEN_INDICATOR;
      tickWidth = TICK_W_INDICATOR;
    } else if (isThreshold) {
      tickLen = TICK_LEN_THRESHOLD;
      tickWidth = TICK_W_THRESHOLD;
    }

    // Tick color
    let stroke: string;
    if (isIndicator) {
      stroke = 'var(--gauge-indicator)';
    } else if (isFilled) {
      if (colorMode === 'gradient' && colorBands.length > 0) {
        stroke = bandColorForValue(tickScaleValue, colorBands);
      } else {
        stroke = 'var(--gauge-fill)';
      }
    } else {
      // Unfilled ticks are ALWAYS the unfill color regardless of mode
      stroke = 'var(--gauge-unfill)';
    }

    const outer = polarToXY(angleDeg, R);
    const inner = polarToXY(angleDeg, R - tickLen);

    // CSS transition on the indicator for smooth animation on data updates.
    // We achieve this by transitioning stroke-opacity (actual position is
    // re-derived from indicatorTickIndex each render; the visual "movement"
    // effect is that ticks switch fill state as value changes).
    // A true smooth sweep would require animating a transform on an indicator
    // element — we implement that with a separate indicator line that transitions
    // its transform.
    return (
      <line
        key={i}
        x1={inner.x}
        y1={inner.y}
        x2={outer.x}
        y2={outer.y}
        stroke={stroke}
        strokeWidth={tickWidth}
        strokeLinecap="round"
      />
    );
  });

  // Separate animated indicator line — rendered on top of all ticks.
  // Uses CSS transition on `transform` for smooth sweep when value changes.
  const indicatorAngle = fractionToAngleDeg(valueFraction);
  const indicatorOuter = polarToXY(indicatorAngle, R);
  const indicatorInner = polarToXY(indicatorAngle, R - TICK_LEN_INDICATOR);

  // Endpoint label positions — placed just outside the arc ends.
  // Left endpoint (Low/min): fraction 0 → angle 180° → 9 o'clock
  // Right endpoint (High/max): fraction 1 → angle 0° → 3 o'clock
  const leftLabelPos = polarToXY(fractionToAngleDeg(0), LABEL_R + 8);
  const rightLabelPos = polarToXY(fractionToAngleDeg(1), LABEL_R + 8);

  const titleId = React.useId();

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        flex: 1,
        minHeight: 0,
      }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-labelledby={svgTitle ? titleId : undefined}
        aria-hidden={svgTitle ? undefined : true}
        focusable={false as unknown as boolean}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {svgTitle && <title id={titleId}>{svgTitle}</title>}

        {/* Tick marks — all decorative; accessible name is on the SVG or children */}
        <g aria-hidden="true">
          {tickElements}

          {/* Smooth indicator line — transitions position on value change */}
          <line
            x1={indicatorInner.x}
            y1={indicatorInner.y}
            x2={indicatorOuter.x}
            y2={indicatorOuter.y}
            stroke="var(--gauge-indicator)"
            strokeWidth={TICK_W_INDICATOR}
            strokeLinecap="round"
            style={{
              transition: 'x1 0.4s ease, y1 0.4s ease, x2 0.4s ease, y2 0.4s ease',
            }}
          />
        </g>

        {/* Endpoint labels */}
        {endpointLabels && (
          <g aria-hidden="true">
            <text
              x={leftLabelPos.x}
              y={leftLabelPos.y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={9}
              fontFamily="var(--font-sans, system-ui, sans-serif)"
              fontWeight={400}
              fill="var(--muted-foreground)"
            >
              {endpointLabels[0]}
            </text>
            <text
              x={rightLabelPos.x}
              y={rightLabelPos.y}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={9}
              fontFamily="var(--font-sans, system-ui, sans-serif)"
              fontWeight={400}
              fill="var(--muted-foreground)"
            >
              {endpointLabels[1]}
            </text>
          </g>
        )}
      </svg>

      {/* Children — centered inside the gauge arc.
          Positioned absolutely over the SVG; the bottom portion of the SVG
          (below the arc baseline at Y=100) is ~11% of the viewBox height (12px/112px).
          We sit the children panel at the vertical midpoint of the arc half-circle. */}
      {children && (
        <div
          style={{
            position: 'absolute',
            // Arc occupies top 100/112 ≈ 89.3% of the SVG height.
            // Center of the semi-circle half-disc is at ~55% of arc height down.
            top: '20%',
            left: '10%',
            right: '10%',
            bottom: '5%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
