// ChartGauge.tsx — Config-driven semi-circular gauge for charts.conf gauge/solidgauge charts.
//
// Renders a 180° semi-circular arc with tick marks that represent a single observation
// value on a configurable scale.  Color zones from the Belchertown `colorZones` config
// field are painted onto the ticks when `colorsEnabled` is true.
//
// Geometry (matches SemiCircularGauge in src/components/ui/semi-circular-gauge.tsx):
//   SVG viewBox 0 0 200 112.  Center (CX=100, CY=92), radius R=85.
//   Arc sweeps 180° — left endpoint (9-o-clock) = min, right (3-o-clock) = max.
//   36 ticks uniformly spaced every 5° across the 180° arc.
//
// A11y (WCAG 2.1 AA):
//   - SVG: role="img" + aria-labelledby pointing at a <title> (WCAG 1.1.1).
//   - sr-only text "Current {title}: {value} {unit}" — screen readers get the value.
//   - Color zones: ticks are also sized (indicator is wider/taller) so value position
//     is conveyed by position, not color alone (WCAG 1.4.1).
//   - No interactive elements — no focus management needed.
//   - Both light and dark themes use CSS variables from the design system.
//
// CSS variables used:
//   --gauge-fill         Ticks at/below value in uniform mode (no color zones).
//   --gauge-unfill       Ticks above value (the "empty" track).
//   --gauge-indicator    The indicator tick line.
//   --muted-foreground   Min/max endpoint labels and unit label.
//   --foreground         Value readout text.
//   --font-sans          Font stack for SVG text.

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../utils/format-number';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ChartGaugeColorZone {
  /** Hex/rgb/hsl color string for the zone. */
  color: string;
  /**
   * The scale position (in the same units as min/max) at which this zone ends.
   * Zones are applied in order: zone i covers from the previous zone's position
   * (or min) up to this zone's position.  The last zone extends to max.
   */
  position?: number;
  /** Optional zone label — used in the sr-only description (not rendered visually). */
  label?: string;
}

export interface ChartGaugeProps {
  /** Current observation value to display. */
  value: number;
  /** Scale minimum (left/9-o-clock endpoint). Default 0. */
  min?: number;
  /** Scale maximum (right/3-o-clock endpoint). Default 100. */
  max?: number;
  /** Unit string displayed below the value (e.g. "°F", "mph"). */
  unit?: string;
  /** Chart title displayed as the gauge heading. */
  title?: string;
  /**
   * Up to 7 color zones from Belchertown colorZones config.
   * Each zone has a `position` threshold (scale value) and a `color`.
   * Null or empty array → uniform fill mode.
   */
  colorZones?: ChartGaugeColorZone[] | null;
  /** When true and colorZones is non-empty, ticks are colored by zone. */
  colorsEnabled?: boolean;
  /** When true, CSS transitions on the indicator tick are suppressed. */
  reducedMotion?: boolean;
}

// ---------------------------------------------------------------------------
// Geometry constants (mirrors SemiCircularGauge exactly)
// ---------------------------------------------------------------------------

const VB_W = 200;
const VB_H = 112;
const CX = 100;
const CY = 92;
const R = 85;
const TICK_COUNT = 36;

// Regular tick dimensions
const TICK_LEN_NORMAL = 14;
const TICK_W_NORMAL = 2.5;

// Indicator tick dimensions (current-value marker rendered on top)
const TICK_LEN_INDICATOR = 24;
const TICK_W_INDICATOR = 3;

// Endpoint label positions — CX ± (R - 8) at y = CY + 14
const LEFT_LABEL = { x: CX - R + 8, y: CY + 14 };
const RIGHT_LABEL = { x: CX + R - 8, y: CY + 14 };

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * fraction [0,1] → math-convention angle in degrees.
 * fraction=0 → 180° (left, 9-o-clock = min).
 * fraction=1 → 0°  (right, 3-o-clock = max).
 */
function fractionToAngleDeg(fraction: number): number {
  return 180 - fraction * 180;
}

/**
 * Math-convention angle (degrees) → SVG x,y on the arc circle.
 * SVG Y-axis is inverted — negate the sin component.
 */
function polarToXY(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad),
    y: CY - radius * Math.sin(rad),
  };
}

// ---------------------------------------------------------------------------
// Color zone resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the fill color for a tick at the given scale value.
 *
 * Zones are stored as `{ position, color }` pairs where `position` is the
 * upper threshold of the zone.  We scan in order: the first zone whose
 * `position` is >= the tick's scale value provides the color.
 * The last zone acts as a catch-all (extends to max).
 *
 * When `position` is undefined/null (Belchertown treats it as "end of scale"),
 * the zone always matches.
 */
function zoneColorForValue(
  tickScaleValue: number,
  zones: ChartGaugeColorZone[],
): string {
  for (const zone of zones) {
    if (zone.position == null || tickScaleValue <= zone.position) {
      return zone.color;
    }
  }
  // Fallback to the last zone's color
  return zones[zones.length - 1].color;
}

/**
 * Build a human-readable zone description for the sr-only text.
 * Returns a string like "Zones: Green 0–30, Yellow 30–60, Red 60+." or empty.
 */
function buildZoneDescription(
  zones: ChartGaugeColorZone[],
  min: number,
  max: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (zones.length === 0) return '';
  const parts: string[] = [];
  let from = min;
  for (const zone of zones) {
    const to = zone.position != null ? zone.position : max;
    const label = zone.label ?? zone.color;
    parts.push(`${label} ${from}–${to}`);
    from = to;
  }
  return t('gauge.zones', { list: parts.join(', ') });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChartGauge({
  value,
  min = 0,
  max = 100,
  unit = '',
  title = '',
  colorZones,
  colorsEnabled = false,
  reducedMotion = false,
}: ChartGaugeProps) {
  const { t, i18n } = useTranslation('charts');
  // Clamp value within [min, max]
  const clamped = Math.min(Math.max(value, min), max);
  const range = max > min ? max - min : 1;

  // Value fraction [0, 1]
  const valueFraction = (clamped - min) / range;

  // Indicator tick index — tick closest to current value
  const indicatorTickIndex = Math.round(valueFraction * (TICK_COUNT - 1));

  // Resolve effective zone list
  const activeZones =
    colorsEnabled && colorZones && colorZones.length > 0 ? colorZones : [];

  // Build tick elements
  const tickElements = Array.from({ length: TICK_COUNT }, (_, i) => {
    const tickFraction = i / (TICK_COUNT - 1);
    const tickScaleValue = min + tickFraction * range;
    const angleDeg = fractionToAngleDeg(tickFraction);

    const isIndicator = i === indicatorTickIndex;
    const isFilled = i < indicatorTickIndex;

    // Indicator slot in the tick array renders as a normal filled tick —
    // the separate animated indicator line handles the visual marker.
    let stroke: string;
    if (isIndicator || isFilled) {
      if (activeZones.length > 0) {
        stroke = zoneColorForValue(tickScaleValue, activeZones);
      } else {
        stroke = 'var(--gauge-fill)';
      }
    } else {
      stroke = 'var(--gauge-unfill)';
    }

    const outer = polarToXY(angleDeg, R);
    const inner = polarToXY(angleDeg, R - TICK_LEN_NORMAL);

    return (
      <line
        key={i}
        x1={inner.x}
        y1={inner.y}
        x2={outer.x}
        y2={outer.y}
        stroke={stroke}
        strokeWidth={TICK_W_NORMAL}
        strokeLinecap="round"
      />
    );
  });

  // Animated indicator line — positioned at exact value angle, renders on top
  const indicatorAngle = fractionToAngleDeg(valueFraction);
  const indicatorOuter = polarToXY(indicatorAngle, R);
  const indicatorInner = polarToXY(indicatorAngle, R - TICK_LEN_INDICATOR);

  // Format the displayed value — round to 1 decimal for floats, integer for whole numbers
  const displayValue = Number.isFinite(value)
    ? formatNumber(value, Number.isInteger(value) ? 0 : 1, i18n.language)
    : '—';

  const minLabel = formatNumber(min, Number.isInteger(min) ? 0 : 1, i18n.language);
  const maxLabel = formatNumber(max, Number.isInteger(max) ? 0 : 1, i18n.language);

  // sr-only description
  const zoneDesc = buildZoneDescription(activeZones, min, max, t);
  const valueWithUnit = unit ? `${displayValue} ${unit}` : displayValue;
  const srDescription = title
    ? t('gauge.srDescriptionWithTitle', { title, value: valueWithUnit, min: minLabel, max: maxLabel, zones: zoneDesc })
    : t('gauge.srDescription', { value: valueWithUnit, min: minLabel, max: maxLabel, zones: zoneDesc });

  const titleId = React.useId();
  const descId = React.useId();

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      {/* Chart title */}
      {title && (
        <p className="font-semibold text-foreground text-center leading-tight" style={{ fontSize: 'var(--text-secondary)' }}>
          {title}
        </p>
      )}

      {/* Gauge SVG container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          // Maintain the 200:112 aspect ratio so the gauge always fits its container
          aspectRatio: `${VB_W} / ${VB_H}`,
        }}
      >
        {/* sr-only accessible description — screen readers get value + zones */}
        <span id={descId} className="sr-only">
          {srDescription}
        </span>

        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descId}
          focusable={false as unknown as boolean}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {/* SVG title for screen readers */}
          <title id={titleId}>
            {title
              ? t('gauge.titleWithLabel', { title, value: valueWithUnit })
              : t('gauge.titleFallback', { value: valueWithUnit })}
          </title>

          {/* All tick marks — decorative; a11y info is on the SVG element and sr-only span */}
          <g aria-hidden="true">
            {tickElements}

            {/* Indicator line — smooth CSS transition when value changes */}
            <line
              x1={indicatorInner.x}
              y1={indicatorInner.y}
              x2={indicatorOuter.x}
              y2={indicatorOuter.y}
              stroke="var(--gauge-indicator)"
              strokeWidth={TICK_W_INDICATOR}
              strokeLinecap="round"
              style={
                reducedMotion
                  ? undefined
                  : {
                      transition:
                        'x1 0.4s ease, y1 0.4s ease, x2 0.4s ease, y2 0.4s ease',
                    }
              }
            />
          </g>

          {/* Min / max endpoint labels */}
          <g aria-hidden="true">
            <text
              x={LEFT_LABEL.x}
              y={LEFT_LABEL.y}
              textAnchor="middle"
              fontSize={9}
              fontFamily="var(--font-sans, system-ui, sans-serif)"
              fontWeight={400}
              fill="var(--muted-foreground)"
            >
              {minLabel}
            </text>
            <text
              x={RIGHT_LABEL.x}
              y={RIGHT_LABEL.y}
              textAnchor="middle"
              fontSize={9}
              fontFamily="var(--font-sans, system-ui, sans-serif)"
              fontWeight={400}
              fill="var(--muted-foreground)"
            >
              {maxLabel}
            </text>
          </g>
        </svg>

        {/* Value readout — centered inside the gauge arc.
            Arc center is at CY=92 which is 92/112 ≈ 82% down the viewBox.
            Position the overlay so it sits in the upper half of the arc disc. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '20%',
            left: '10%',
            right: '10%',
            bottom: '10%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-sans, 'Outfit', system-ui, sans-serif)",
              fontSize: 'clamp(1.25rem, 4vw, 2rem)',
              fontWeight: 700,
              lineHeight: 1,
              color: 'var(--foreground)',
              letterSpacing: '-0.02em',
            }}
          >
            {displayValue}
          </span>
          {unit && (
            <span
              style={{
                fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
                fontWeight: 400,
                color: 'var(--muted-foreground)',
                marginTop: '0.15em',
              }}
            >
              {unit}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
