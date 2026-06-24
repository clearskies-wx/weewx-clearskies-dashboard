// moon-phase-icon.tsx — Shared moon phase SVG rendering component.
//
// Uses the correct elliptical terminator algorithm:
//   rx_terminator = R × |cos(π × illuminationFraction)|
//
// This produces straight vertical lines at quarter phases (f=0.5),
// correct narrow crescents at low illumination, and correct wide gibbous
// shapes at high illumination — the two-circle approximation cannot achieve
// any of these correctly.
//
// isWaning detection correctly handles "last-quarter" (which does NOT
// contain the word "waning") by checking against a fixed set.
//
// Colors: contrast is between 100% and 25% opacity of the same hue, so
// the rendering is clear in both light and dark themes regardless of
// the page background color.

import type { SVGProps } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Lit portion — full opacity silver */
const MOON_LIT = '#94a3b8';
/** Dark portion — 25% opacity of the same hue, visible in both themes */
const MOON_DARK = 'rgba(148, 163, 184, 0.25)';
/** Subtle outline ring */
const MOON_OUTLINE = 'rgba(148, 163, 184, 0.4)';

/** Phase names that represent waning (right-side dark, left-side lit) */
const WANING_PHASES = new Set(['waning-gibbous', 'last-quarter', 'waning-crescent']);

// ---------------------------------------------------------------------------
// Core path math
// ---------------------------------------------------------------------------

/**
 * Build the SVG path for the illuminated portion of the moon.
 *
 * The moon disc is centered at (cx, cy) with radius r.
 * The terminator ellipse has:
 *   - rx = r × |cos(π × f)|   where f = illumination fraction [0, 1]
 *   - ry = r  (same as limb)
 *
 * For WAXING (f < 0.5 → crescent on right; f > 0.5 → gibbous, right lit):
 *   The lit limb is the RIGHT semicircle.
 *   Path: start top → right semicircle (CW, sweep=1) → terminator back (direction varies)
 *
 * For WANING (f < 0.5 → crescent on left; f > 0.5 → gibbous, left lit):
 *   The lit limb is the LEFT semicircle.
 *   Path: start top → left semicircle (CCW, sweep=0) → terminator back
 *
 * @param cx   Center X
 * @param cy   Center Y
 * @param r    Moon radius
 * @param f    Illumination fraction [0, 1]
 * @param waning  True if the waning side (left lit)
 * @returns SVG path data string, or null for new/full moon special cases
 */
function litPath(
  cx: number,
  cy: number,
  r: number,
  f: number,
  waning: boolean,
): string | null {
  // Edge cases handled by callers
  if (f <= 0.01) return null;   // new moon — no lit path
  if (f >= 0.99) return null;   // full moon — use full circle instead

  const rx = r * Math.abs(Math.cos(Math.PI * f));
  const top = `${cx},${cy - r}`;
  const bot = `${cx},${cy + r}`;

  if (!waning) {
    // Waxing: right side lit
    // Limb = right semicircle (CW, sweep=1)
    // Terminator: crescent (f<0.5) → CCW (sweep=0); gibbous (f>0.5) → CW (sweep=1)
    const terminatorSweep = f < 0.5 ? 0 : 1;
    return [
      `M ${top}`,
      `A ${r} ${r} 0 0 1 ${bot}`,
      `A ${rx} ${r} 0 0 ${terminatorSweep} ${top}`,
      'Z',
    ].join(' ');
  } else {
    // Waning: left side lit
    // Limb = left semicircle (CCW, sweep=0)
    // Terminator: crescent (f<0.5) → CW (sweep=1); gibbous (f>0.5) → CCW (sweep=0)
    const terminatorSweep = f < 0.5 ? 1 : 0;
    return [
      `M ${top}`,
      `A ${r} ${r} 0 0 0 ${bot}`,
      `A ${rx} ${r} 0 0 ${terminatorSweep} ${top}`,
      'Z',
    ].join(' ');
  }
}

// ---------------------------------------------------------------------------
// MoonPhaseG — embeds inside an existing SVG
// ---------------------------------------------------------------------------

export interface MoonPhaseGProps {
  cx: number;
  cy: number;
  r: number;
  /** Raw illumination percent, 0–100 */
  illuminationPercent: number | null;
  /** Dash-separated phase name from the API, e.g. "waxing-gibbous" */
  phaseName: string | null | undefined;
  /** Additional SVG group props (e.g. aria-hidden) */
  groupProps?: SVGProps<SVGGElement>;
}

/**
 * Renders moon phase SVG elements as a `<g>` group for embedding inside
 * an existing `<svg>`. Does NOT add an outer `<svg>` element.
 *
 * Usage inside an SVG:
 *   <MoonPhaseG cx={x} cy={y} r={7} illuminationPercent={42} phaseName="waxing-crescent" />
 */
export function MoonPhaseG({
  cx,
  cy,
  r,
  illuminationPercent,
  phaseName,
  groupProps,
}: MoonPhaseGProps) {
  const f = illuminationPercent !== null ? illuminationPercent / 100 : 0.5;
  const isWaning = WANING_PHASES.has(phaseName ?? '');
  const isNewMoon = f <= 0.01;
  const isFullMoon = f >= 0.99;

  return (
    <g {...groupProps}>
      {/* Dark background disc — always present */}
      <circle cx={cx} cy={cy} r={r} fill={MOON_DARK} />
      {/* Outline ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={MOON_OUTLINE} strokeWidth={r * 0.1} />

      {isNewMoon ? (
        /* New moon: just the dark disc + outline above, no lit path */
        null
      ) : isFullMoon ? (
        /* Full moon: solid lit circle */
        <circle cx={cx} cy={cy} r={r} fill={MOON_LIT} />
      ) : (
        /* Crescent / quarter / gibbous: elliptical terminator path */
        (() => {
          const d = litPath(cx, cy, r, f, isWaning);
          return d ? <path d={d} fill={MOON_LIT} /> : null;
        })()
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// MoonPhaseIcon — standalone SVG wrapper
// ---------------------------------------------------------------------------

export interface MoonPhaseIconProps {
  /** Width and height in pixels */
  size: number;
  /** Raw illumination percent, 0–100 */
  illuminationPercent: number | null;
  /** Dash-separated phase name from the API, e.g. "waxing-gibbous" */
  phaseName: string | null | undefined;
  className?: string;
  ariaLabel?: string;
}

/**
 * Renders a standalone moon phase SVG icon.
 *
 * Usage:
 *   <MoonPhaseIcon size={40} illuminationPercent={42} phaseName="waxing-crescent" />
 */
export function MoonPhaseIcon({
  size,
  illuminationPercent,
  phaseName,
  className,
  ariaLabel,
}: MoonPhaseIconProps) {
  // viewBox: 0 0 (size) (size), moon centered at (size/2, size/2), r = size/2 - 2px padding
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{ flexShrink: 0, display: 'block' }}
    >
      {ariaLabel && <title>{ariaLabel}</title>}
      <MoonPhaseG
        cx={cx}
        cy={cy}
        r={r}
        illuminationPercent={illuminationPercent}
        phaseName={phaseName}
      />
    </svg>
  );
}
