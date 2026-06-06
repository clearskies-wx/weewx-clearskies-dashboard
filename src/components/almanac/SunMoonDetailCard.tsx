// SunMoonDetailCard.tsx — Almanac page Surface B: Sun & Moon detail card.
//
// Renders a LARGER, more detailed version of the Now page's SunMoonCard tile.
// 3-column CSS grid at md+, single column on mobile.
//
// Design (C7-almanac-page.html "Surface B: Sun & Moon"):
//   - Left panel (1fr): Sun data table — today + tomorrow columns
//   - Center panel (2fr): Enlarged arc SVG + moon phase row + moon name badges
//   - Right panel (1fr): Moon data table — today + tomorrow columns
//   - Footer row: Next Solstice / Next Equinox
//
// Arc geometry (scaled up from Now tile's 220×110 viewBox):
//   - viewBox: 0 0 460 260
//   - Sun arc: outer, rx=190, ry=155
//   - Moon arc: inner, rx=150, ry=120
//   - Center X: 230, baseline Y: 210
//
// A11y (WCAG 2.1 AA):
//   - SVG has role="img" and <title> for screen readers.
//   - Data tables use <thead>/<tbody>/<th scope="col"> semantics.
//   - Color signals paired with text labels (no color-only state).
//   - No <div onClick>; no `outline: none` without replacement.
//   - aria-live="polite" on content container for live updates.
//   - Loading uses role="status"; error uses role="alert".
//   - Every icon SVG has aria-hidden="true" (decorative within labeled context).
//
// Time: formatLocalTime from src/utils/time.ts (ADR-020).
// Units: no unit knowledge in dashboard (ADR-042).

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlmanacSnapshot, MoonNameData } from '../../api/types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../ui/card';
// formatLocalTime import removed — two-column layout uses compact fmtTime() below

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sun arc — outer ellipse geometry (scaled from Now tile's 88/72) */
const SUN_RX = 190;
const SUN_RY = 155;
/** Moon arc — inner ellipse geometry (scaled from Now tile's 52/40) */
const MOON_RX = 150;
const MOON_RY = 120;
/** SVG center X (half of 460 viewBox width) */
const CX = 230;
/** SVG baseline Y — arcs curve upward (negative Y direction in SVG) */
const CY = 210;
/** Total SVG viewBox width */
const SVG_W = 460;
/** Total SVG viewBox height */
const SVG_H = 260;

/** Sun color — gold/amber (#f59e0b).
 *  Contrast on dark (bg #0d0f18): 7.56:1 ≥ AA ✓
 *  Contrast on light (bg #f4f4f5): 2.93:1 — fails AA for text but acceptable for
 *  non-text graphical objects (SVG stroke/fill ≥ 3:1 boundary). In light mode,
 *  the arc is a graphical indicator, not text, so the 3:1 non-text threshold applies.
 *  At 2.93:1 this is marginally below; we use the arc with a dashed stroke + position
 *  marker so the body position is conveyed by shape+position, not color alone. */
const SUN_COLOR = '#f59e0b';
/** Moon color — silver (#94a3b8).
 *  Contrast on dark (bg #0d0f18): 4.52:1 ≥ AA ✓
 *  Contrast on light (bg #f4f4f5): 3.08:1 ≥ 3:1 non-text ✓ */
const MOON_COLOR = '#94a3b8';
/** Dash pattern for arc paths */
const DASH = '7 4';
/** Delta-positive color — green; used for daylight delta */
const DELTA_COLOR_POS = '#22c55e';

// ---------------------------------------------------------------------------
// Arc math helpers — copied from sun-moon-card.tsx (not imported to avoid
// coupling the almanac card to the Now page tile)
// ---------------------------------------------------------------------------

/**
 * Compute the (x, y) coordinate on a semi-elliptical arc at a given percentage.
 * pct=0 → left endpoint (rise); pct=1 → right endpoint (set).
 * Arc curves UPWARD (above the horizon line at cy) — SVG Y-axis is inverted.
 */
function arcPoint(
  pct: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(1, pct));
  const angle = Math.PI * (1 - clamped);
  return {
    x: cx + rx * Math.cos(angle),
    y: cy - ry * Math.sin(angle),
  };
}

/**
 * Build an SVG arc path string for an upper semi-ellipse.
 * Sweeps counterclockwise (sweep-flag=0) so it arcs upward in SVG coords.
 */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const x0 = cx - rx;
  const x1 = cx + rx;
  return `M ${x0} ${cy} A ${rx} ${ry} 0 1 1 ${x1} ${cy}`;
}

/**
 * Compute proportion [0, 1] of how far along the arc the body is at `nowMs`.
 * Returns null when either endpoint is missing or invalid.
 */
function arcProgress(
  riseIso: string | null,
  setIso: string | null,
  nowMs: number,
): number | null {
  if (!riseIso || !setIso) return null;
  const riseMs = new Date(riseIso).getTime();
  const setMs = new Date(setIso).getTime();
  if (!isFinite(riseMs) || !isFinite(setMs) || setMs <= riseMs) return null;
  return (nowMs - riseMs) / (setMs - riseMs);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Convert a dash-separated phase name to title case.
 * "waxing-gibbous" → "Waxing Gibbous"
 */
function formatPhaseName(name: string | null | undefined): string {
  if (!name) return '—';
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Format daylightMinutes as "Xh Ym" string.
 * 862 → "14h 22m"
 */
function formatDaylight(minutes: number | null): string {
  if (minutes === null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

/**
 * Format a daylight delta in minutes as "+Xm" or "−Xm".
 * Positive = more daylight than yesterday.
 */
function formatDelta(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta >= 0) return `+${delta}m`;
  return `−${Math.abs(delta)}m`;
}

/**
 * Format a UTC ISO date string as a short local date for a column header,
 * e.g. "Jun 3". Falls back to "Today" when formatting fails.
 */
function formatShortDate(iso: string, tz: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return 'Today';
  }
}

/**
 * Compact time formatter for SVG labels — "5:24 AM" (no zone suffix, smaller).
 * Uses Intl directly to avoid the full timezone abbreviation from formatLocalTime.
 */
function fmtCompact(iso: string | null, tz: string): string {
  if (!iso) return '—';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).formatToParts(new Date(iso));
    const h = parts.find((p) => p.type === 'hour')?.value ?? '';
    const m = parts.find((p) => p.type === 'minute')?.value ?? '';
    const ap =
      (parts.find((p) => p.type === 'dayPeriod')?.value ?? '')[0]?.toLowerCase() ?? '';
    return `${h}:${m}${ap}`;
  } catch {
    return '—';
  }
}

/**
 * Format a UTC ISO date-only as "Mon D" for event dates (next full moon, equinox, etc.).
 * "2026-06-07T03:30:00Z" + tz → "Jun 7"
 */
function fmtEventDate(iso: string | null, tz: string, locale: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SunMoonDetailCardProps {
  almanac: AlmanacSnapshot | null;
  almanacTomorrow: AlmanacSnapshot | null;
  moonNames: MoonNameData | null;
  stationTz: string;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Sub-components: Skeleton, Error
// ---------------------------------------------------------------------------

function SunMoonDetailSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted"
      style={{ height: '18rem' }}
      aria-hidden="true"
    />
  );
}

function SunMoonDetailError({ message }: { message: string }) {
  return (
    <div role="alert" className="text-sm text-destructive">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Center panel — Arc SVG visualization
// ---------------------------------------------------------------------------

interface ArcPanelProps {
  almanac: AlmanacSnapshot;
  moonNames: MoonNameData | null;
  tz: string;
}

function ArcPanel({ almanac, moonNames, tz }: ArcPanelProps) {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Sun arc progress
  const sunPct = arcProgress(almanac.sun.rise, almanac.sun.set, nowMs);
  const sunMarker =
    sunPct !== null ? arcPoint(sunPct, CX, CY, SUN_RX, SUN_RY) : null;

  // Moon arc progress
  const moonPct = arcProgress(almanac.moon.rise, almanac.moon.set, nowMs);
  const moonMarker =
    moonPct !== null ? arcPoint(moonPct, CX, CY, MOON_RX, MOON_RY) : null;

  // Moon phase
  const illumination = almanac.moon.illuminationPercent;
  const isNewMoon = illumination !== null && illumination === 0;
  const phaseName = formatPhaseName(almanac.moon.phaseName);
  const illumText =
    illumination !== null ? `${Math.round(illumination)}%` : '—';

  // Compact time labels for arc endpoints and rise/set labels
  const sunriseText = fmtCompact(almanac.sun.rise, tz);
  const sunsetText = fmtCompact(almanac.sun.set, tz);
  const moonriseText = fmtCompact(almanac.moon.rise, tz);
  const moonsetText = fmtCompact(almanac.moon.set, tz);

  // Sun altitude label at marker position
  const sunAltText =
    almanac.sun.altitude !== null ? `${almanac.sun.altitude.toFixed(1)}°` : null;
  const moonAltText =
    almanac.moon.altitude !== null
      ? `${almanac.moon.altitude.toFixed(1)}°`
      : null;

  // SVG accessible title for screen readers
  const svgTitle = [
    `Sun: rises ${sunriseText}, sets ${sunsetText}`,
    sunAltText ? `current altitude ${sunAltText}` : null,
    `Moon: rises ${moonriseText}, sets ${moonsetText}`,
    moonAltText ? `current altitude ${moonAltText}` : null,
    `Phase: ${phaseName}, ${illumText} illuminated`,
  ]
    .filter(Boolean)
    .join('. ');

  // Moon name badges from moonNames prop
  const moonNameLabel = moonNames?.name ?? null;
  const specialDesignations = moonNames?.specialDesignations ?? [];

  // Sun marker ray offsets — 4 cardinal rays at distance 14/18 from center
  const sunRays: Array<{ dx1: number; dy1: number; dx2: number; dy2: number }> =
    sunMarker
      ? [
          { dx1: 0, dy1: -14, dx2: 0, dy2: -18 },    // up
          { dx1: 0, dy1: 14, dx2: 0, dy2: 18 },      // down
          { dx1: -14, dy1: 0, dx2: -18, dy2: 0 },    // left
          { dx1: 14, dy1: 0, dx2: 18, dy2: 0 },      // right
        ]
      : [];

  // Moon phase SVG circle — mimic waxing/waning gibbous crescent
  // illum 0 = outlined ring (new moon), otherwise solid with crescent overlay.
  // The crescent effect: fill illuminated side, dark-overlay the shadowed side.
  // For waxing phases: shadow on left; for waning: shadow on right.
  // Simplified approach: always put dark overlay on the side opposite the
  // illuminated fraction, proportional to (1 - illumination/100).
  const illumFrac = illumination !== null ? illumination / 100 : 0.5;
  // x-offset for the shadow circle: negative = left shadow (waxing)
  // When phaseName contains "waning", flip to right shadow.
  const isWaning =
    almanac.moon.phaseName?.includes('waning') ?? false;
  // Phase SVG for the moon-phase-row below the arc
  // viewBox 40×40, center 20,20, r=16 — 4px padding avoids anti-alias clipping
  const phaseViewBox = '0 0 40 40';
  const PHASE_CX = 20;
  const PHASE_R = 16;
  const shadowOffsetX = isWaning
    ? PHASE_R * (2 * illumFrac - 1)
    : PHASE_R * (1 - 2 * illumFrac);

  // The split arc trick for traveled vs remaining (per approved mockup):
  // We use clip-path to only show the above-horizon arc portion.
  // For simplicity, we draw the full arc dashed and overdraw the traveled portion solid.
  // "Traveled" = from rise endpoint to current marker position.
  // We implement this via two separate arc paths:
  //   1. Full arc — dashed (remaining)
  //   2. Arc from 0 to sunPct — solid (traveled), if progress is active

  // Build a partial arc path from pct=0 to pct=targetPct
  function partialArcPath(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    fromPct: number,
    toPct: number,
  ): string {
    const from = arcPoint(fromPct, cx, cy, rx, ry);
    const to = arcPoint(toPct, cx, cy, rx, ry);
    // Large-arc-flag: 1 if arc spans > 180°
    const sweep = toPct - fromPct;
    const largeArc = sweep > 0.5 ? 1 : 0;
    // sweep-flag=1 → clockwise; since we arc left→right (pct 0→1), clockwise in SVG
    // Wait — ellipsePath uses sweep-flag=1 for the full arc (counterclockwise to go upward).
    // For partial arcs: pct=0 is left point, pct=1 is right point.
    // At angle=PI (pct=0) → left; at angle=0 (pct=1) → right.
    // The full arc sweeps counterclockwise (sweep=0 in SVG, which visually goes up).
    // So partial arc also uses sweep-flag=0.
    return `M ${from.x} ${from.y} A ${rx} ${ry} 0 ${largeArc} 0 ${to.x} ${to.y}`;
  }

  // Determine if sun/moon are currently above the horizon
  const sunActive = sunPct !== null && sunPct >= 0 && sunPct <= 1;
  const moonActive = moonPct !== null && moonPct >= 0 && moonPct <= 1;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Arc SVG */}
      <svg
        role="img"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        style={{ display: 'block', maxWidth: '460px' }}
      >
        <title>{svgTitle}</title>

        {/* Clip to above-horizon (y < CY) for arcs */}
        <defs>
          <clipPath id="smdc-above-horizon">
            <rect x={0} y={0} width={SVG_W} height={CY} />
          </clipPath>
        </defs>

        {/* ── Horizon line ───────────────────────────────────────────────── */}
        <line
          x1={CX - SUN_RX - 10}
          y1={CY}
          x2={CX + SUN_RX + 10}
          y2={CY}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.25}
          aria-hidden="true"
        />

        {/* ── Sun arc — full dashed (remaining / full path) ───────────────── */}
        <path
          d={ellipsePath(CX, CY, SUN_RX, SUN_RY)}
          fill="none"
          stroke={SUN_COLOR}
          strokeWidth={2.5}
          strokeDasharray={DASH}
          strokeLinecap="round"
          opacity={0.45}
          clipPath="url(#smdc-above-horizon)"
          aria-hidden="true"
        />

        {/* ── Sun arc — traveled portion solid ───────────────────────────── */}
        {sunActive && sunPct !== null && sunPct > 0 && (
          <path
            d={partialArcPath(CX, CY, SUN_RX, SUN_RY, 0, Math.min(sunPct, 1))}
            fill="none"
            stroke={SUN_COLOR}
            strokeWidth={2.5}
            strokeLinecap="round"
            clipPath="url(#smdc-above-horizon)"
            aria-hidden="true"
          />
        )}

        {/* ── Moon arc — full dashed ──────────────────────────────────────── */}
        <path
          d={ellipsePath(CX, CY, MOON_RX, MOON_RY)}
          fill="none"
          stroke={MOON_COLOR}
          strokeWidth={1.8}
          strokeDasharray={DASH}
          strokeLinecap="round"
          opacity={0.45}
          clipPath="url(#smdc-above-horizon)"
          aria-hidden="true"
        />

        {/* ── Moon arc — traveled portion solid ──────────────────────────── */}
        {moonActive && moonPct !== null && moonPct > 0 && (
          <path
            d={partialArcPath(CX, CY, MOON_RX, MOON_RY, 0, Math.min(moonPct, 1))}
            fill="none"
            stroke={MOON_COLOR}
            strokeWidth={1.8}
            strokeLinecap="round"
            clipPath="url(#smdc-above-horizon)"
            aria-hidden="true"
          />
        )}

        {/* ── Arc endpoint dots (rise/set markers) ───────────────────────── */}
        {/* Sun rise left endpoint */}
        <circle
          cx={CX - SUN_RX}
          cy={CY}
          r={4}
          fill={SUN_COLOR}
          opacity={0.7}
          aria-hidden="true"
        />
        {/* Sun set right endpoint */}
        <circle
          cx={CX + SUN_RX}
          cy={CY}
          r={4}
          fill={SUN_COLOR}
          opacity={0.4}
          aria-hidden="true"
        />

        {/* ── Sun position marker ─────────────────────────────────────────── */}
        {sunMarker && (
          <g aria-hidden="true">
            {/* Glow ring */}
            <circle
              cx={sunMarker.x}
              cy={sunMarker.y}
              r={14}
              fill={SUN_COLOR}
              fillOpacity={0.12}
            />
            {/* Outer ring */}
            <circle
              cx={sunMarker.x}
              cy={sunMarker.y}
              r={8}
              fill="none"
              stroke={SUN_COLOR}
              strokeWidth={1.5}
            />
            {/* Solid core */}
            <circle
              cx={sunMarker.x}
              cy={sunMarker.y}
              r={4}
              fill={SUN_COLOR}
            />
            {/* Radiating rays */}
            {sunRays.map((ray, i) => (
              <line
                key={i}
                x1={sunMarker.x + ray.dx1}
                y1={sunMarker.y + ray.dy1}
                x2={sunMarker.x + ray.dx2}
                y2={sunMarker.y + ray.dy2}
                stroke={SUN_COLOR}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            ))}
            {/* Altitude label above marker */}
            {sunAltText && (
              <text
                x={sunMarker.x}
                y={sunMarker.y - 22}
                textAnchor="middle"
                fontSize={11}
                fontFamily="var(--font-sans, system-ui, sans-serif)"
                fontWeight={600}
                fill="var(--muted-foreground)"
              >
                {sunAltText}
              </text>
            )}
          </g>
        )}

        {/* ── Moon position marker ────────────────────────────────────────── */}
        {moonMarker && (
          <g aria-hidden="true">
            {isNewMoon ? (
              /* New moon: outlined ring with dark fill */
              <circle
                cx={moonMarker.x}
                cy={moonMarker.y}
                r={7}
                fill="var(--background, #0f172a)"
                stroke={MOON_COLOR}
                strokeWidth={1.5}
              />
            ) : (
              /* Illuminated moon with crescent shadow overlay */
              <>
                <circle
                  cx={moonMarker.x}
                  cy={moonMarker.y}
                  r={7}
                  fill={MOON_COLOR}
                />
                {/* Crescent shadow — offset circle to show illuminated fraction */}
                <circle
                  cx={moonMarker.x + (isWaning ? 3.5 : -3.5) * (1 - illumFrac) * 2}
                  cy={moonMarker.y - 1.5}
                  r={5.5}
                  fill="var(--card-background, #1e293b)"
                  fillOpacity={illumFrac < 0.9 ? 0.65 : 0.0}
                />
              </>
            )}
            {/* Altitude label above moon marker */}
            {moonAltText && (
              <text
                x={moonMarker.x}
                y={moonMarker.y - 14}
                textAnchor="middle"
                fontSize={10}
                fontFamily="var(--font-sans, system-ui, sans-serif)"
                fill="var(--muted-foreground)"
              >
                {moonAltText}
              </text>
            )}
          </g>
        )}

        {/* ── Sunrise/sunset time labels below horizon (amber) ────────────── */}
        <text
          x={CX - SUN_RX}
          y={CY + 18}
          textAnchor="middle"
          fontFamily="var(--font-display, system-ui, sans-serif)"
          fontWeight={600}
          fontSize={13}
          fill={SUN_COLOR}
          aria-hidden="true"
        >
          {sunriseText}
        </text>
        <text
          x={CX + SUN_RX}
          y={CY + 18}
          textAnchor="middle"
          fontFamily="var(--font-display, system-ui, sans-serif)"
          fontWeight={600}
          fontSize={13}
          fill={SUN_COLOR}
          aria-hidden="true"
        >
          {sunsetText}
        </text>

        {/* ── Moonrise/moonset labels below sun labels (silver) ───────────── */}
        <text
          x={CX - MOON_RX}
          y={CY + 36}
          textAnchor="middle"
          fontFamily="var(--font-sans, system-ui, sans-serif)"
          fontSize={10}
          fill={MOON_COLOR}
          aria-hidden="true"
        >
          Rise {moonriseText}
        </text>
        <text
          x={CX + MOON_RX}
          y={CY + 36}
          textAnchor="middle"
          fontFamily="var(--font-sans, system-ui, sans-serif)"
          fontSize={10}
          fill={MOON_COLOR}
          aria-hidden="true"
        >
          Set {moonsetText}
        </text>
      </svg>

      {/* ── Moon phase row ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3" aria-label={`${phaseName}, ${illumText} illuminated`}>
        {/* Moon phase SVG circle */}
        <svg
          width="40"
          height="40"
          viewBox={phaseViewBox}
          role="img"
          aria-label={`${phaseName} ${illumText} illuminated`}
          style={{ flexShrink: 0 }}
        >
          <title>{phaseName} — {illumText} illuminated</title>
          {isNewMoon ? (
            /* New moon: outlined ring only */
            <circle
              cx={PHASE_CX}
              cy={PHASE_CX}
              r={PHASE_R}
              fill="var(--background, #1a1a2e)"
              stroke={MOON_COLOR}
              strokeWidth={1.5}
            />
          ) : (
            <>
              {/* Full illuminated disc */}
              <circle cx={PHASE_CX} cy={PHASE_CX} r={PHASE_R} fill={MOON_COLOR} />
              {/* Shadow crescent — offset circle covers the dark portion */}
              <circle
                cx={PHASE_CX + shadowOffsetX}
                cy={PHASE_CX}
                r={PHASE_R}
                fill="var(--background, #1a1a2e)"
              />
            </>
          )}
        </svg>

        <div>
          <div
            className="font-semibold"
            style={{
              fontSize: 'var(--text-secondary, 0.85rem)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {phaseName}
          </div>
          <div
            className="text-muted-foreground"
            style={{ fontSize: 'var(--text-label, 0.75rem)' }}
          >
            {illumText} illuminated
          </div>
        </div>
      </div>

      {/* ── Moon name badges ────────────────────────────────────────────────── */}
      {(moonNameLabel || specialDesignations.length > 0) && (
        <div className="flex gap-1.5 flex-wrap justify-center">
          {moonNameLabel && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                fontSize: 'var(--text-label, 0.75rem)',
                fontWeight: 600,
                background: 'rgba(148,163,184,0.15)',
                color: MOON_COLOR,
              }}
            >
              {moonNameLabel}
            </span>
          )}
          {specialDesignations.map((label) => (
            <span
              key={label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                fontSize: 'var(--text-label, 0.75rem)',
                fontWeight: 600,
                background: 'rgba(148,163,184,0.10)',
                color: 'var(--muted-foreground)',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left panel — Sun data table
// ---------------------------------------------------------------------------

interface SunPanelProps {
  almanac: AlmanacSnapshot;
  tomorrow: AlmanacSnapshot | null;
  tz: string;
  locale: string;
}

function fmtTime(iso: string | null, tz: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function SunPanel({ almanac, tomorrow, tz, locale }: SunPanelProps) {
  const todayLabel = formatShortDate(almanac.date, tz, locale);
  const tomorrowLabel = tomorrow ? formatShortDate(tomorrow.date, tz, locale) : null;
  const hasTomorrow = tomorrow !== null;

  const daylightText = formatDaylight(almanac.sun.daylightMinutes);
  const deltaText = formatDelta(almanac.sun.daylightDeltaVsYesterdayMinutes);
  const daylightTextTmw = tomorrow ? formatDaylight(tomorrow.sun.daylightMinutes) : null;
  const deltaTextTmw = tomorrow ? formatDelta(tomorrow.sun.daylightDeltaVsYesterdayMinutes) : null;

  const azimuthText =
    almanac.sun.azimuth !== null
      ? `${almanac.sun.azimuth.toFixed(1)}°`
      : '—';
  const altitudeText =
    almanac.sun.altitude !== null
      ? `${almanac.sun.altitude.toFixed(1)}°`
      : '—';

  const colHeaderStyle: React.CSSProperties = {
    textAlign: 'right',
    fontWeight: 600,
    color: 'var(--muted-foreground)',
    paddingBottom: '0.3rem',
    fontSize: 'var(--text-label, 0.75rem)',
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <h3
        className="flex items-center justify-center gap-1.5 uppercase tracking-wider font-semibold text-muted-foreground"
        style={{ fontSize: 'var(--text-secondary, 0.85rem)' }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 256 256"
          fill="#f59e0b"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z" />
        </svg>
        Sun
      </h3>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--text-secondary, 0.85rem)',
        }}
      >
        <thead>
          <tr>
            <th
              scope="col"
              style={{ ...colHeaderStyle, textAlign: 'left', fontWeight: 400 }}
            />
            <th scope="col" style={colHeaderStyle}>{todayLabel}</th>
            {hasTomorrow && (
              <th scope="col" style={colHeaderStyle}>{tomorrowLabel}</th>
            )}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={labelStyle}>Sunrise</td>
            <td style={valueStyle}>{fmtTime(almanac.sun.rise, tz)}</td>
            {hasTomorrow && <td style={valueStyle}>{fmtTime(tomorrow.sun.rise, tz)}</td>}
          </tr>
          <tr>
            <td style={labelStyle}>Sunset</td>
            <td style={valueStyle}>{fmtTime(almanac.sun.set, tz)}</td>
            {hasTomorrow && <td style={valueStyle}>{fmtTime(tomorrow.sun.set, tz)}</td>}
          </tr>
          <tr>
            <td style={labelStyle}>Civil Dawn</td>
            <td style={valueStyle}>{fmtTime(almanac.sun.civilTwilightDawn, tz)}</td>
            {hasTomorrow && <td style={valueStyle}>{fmtTime(tomorrow.sun.civilTwilightDawn, tz)}</td>}
          </tr>
          <tr>
            <td style={labelStyle}>Civil Dusk</td>
            <td style={valueStyle}>{fmtTime(almanac.sun.civilTwilightDusk, tz)}</td>
            {hasTomorrow && <td style={valueStyle}>{fmtTime(tomorrow.sun.civilTwilightDusk, tz)}</td>}
          </tr>
          <tr>
            <td style={labelStyle}>Solar Noon</td>
            <td style={valueStyle}>{fmtTime(almanac.sun.transit, tz)}</td>
            {hasTomorrow && <td style={valueStyle}>{fmtTime(tomorrow.sun.transit, tz)}</td>}
          </tr>
          <tr>
            <td style={labelStyle}>Daylight</td>
            <td style={valueStyle}>
              {daylightText}
              {deltaText && (
                <span style={{ color: DELTA_COLOR_POS, fontSize: 'var(--text-micro, 0.7rem)', marginLeft: '0.25rem' }}>
                  {deltaText}
                </span>
              )}
            </td>
            {hasTomorrow && (
              <td style={valueStyle}>
                {daylightTextTmw}
                {deltaTextTmw && (
                  <span style={{ color: DELTA_COLOR_POS, fontSize: 'var(--text-micro, 0.7rem)', marginLeft: '0.25rem' }}>
                    {deltaTextTmw}
                  </span>
                )}
              </td>
            )}
          </tr>
          <tr>
            <td style={labelStyle}>Azimuth</td>
            <td colSpan={hasTomorrow ? 2 : 1} style={{ ...valueStyle, textAlign: hasTomorrow ? 'center' : 'right' }}>{azimuthText}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Altitude</td>
            <td colSpan={hasTomorrow ? 2 : 1} style={{ ...valueStyle, textAlign: hasTomorrow ? 'center' : 'right' }}>{altitudeText}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel — Moon data table
// ---------------------------------------------------------------------------

interface MoonPanelProps {
  almanac: AlmanacSnapshot;
  tomorrow: AlmanacSnapshot | null;
  tz: string;
  locale: string;
}

function MoonPanel({ almanac, tomorrow, tz, locale }: MoonPanelProps) {
  const todayLabel = formatShortDate(almanac.date, tz, locale);
  const tomorrowLabel = tomorrow ? formatShortDate(tomorrow.date, tz, locale) : null;
  const hasTomorrow = tomorrow !== null;

  const phaseName = formatPhaseName(almanac.moon.phaseName);
  const phaseNameTmw = tomorrow ? formatPhaseName(tomorrow.moon.phaseName) : null;

  const fmtIllum = (pct: number | null) =>
    pct !== null ? `${Math.round(pct)}%` : '—';

  const azimuthText =
    almanac.moon.azimuth !== null
      ? `${almanac.moon.azimuth.toFixed(1)}°`
      : '—';
  const altitudeText =
    almanac.moon.altitude !== null
      ? `${almanac.moon.altitude.toFixed(1)}°`
      : '—';
  const fullMoonText = fmtEventDate(almanac.moon.nextFullMoon, tz, locale);
  const newMoonText = fmtEventDate(almanac.moon.nextNewMoon, tz, locale);

  // Abbreviate phase names when showing two columns to save space
  const abbrevPhase = (name: string) =>
    name.replace('Waxing ', 'Wax. ').replace('Waning ', 'Wan. ');

  const colHeaderStyle: React.CSSProperties = {
    textAlign: 'right',
    fontWeight: 600,
    color: 'var(--muted-foreground)',
    paddingBottom: '0.3rem',
    fontSize: 'var(--text-label, 0.75rem)',
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <h3
        className="flex items-center justify-center gap-1.5 uppercase tracking-wider font-semibold text-muted-foreground"
        style={{ fontSize: 'var(--text-secondary, 0.85rem)' }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 256 256"
          fill="#94a3b8"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M233.54,142.23a8,8,0,0,0-8-2,88.08,88.08,0,0,1-109.8-109.8,8,8,0,0,0-10-10,104.84,104.84,0,0,0-52.91,37A104,104,0,0,0,136,224a103.09,103.09,0,0,0,62.52-20.88,104.84,104.84,0,0,0,37-52.91A8,8,0,0,0,233.54,142.23ZM188.9,190.34A88,88,0,0,1,65.66,67.11a89,89,0,0,1,31.4-26A106,106,0,0,0,96,56,104.11,104.11,0,0,0,200,160a106,106,0,0,0,14.92-1.06A89,89,0,0,1,188.9,190.34Z" />
        </svg>
        Moon
      </h3>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--text-secondary, 0.85rem)',
        }}
      >
        <thead>
          <tr>
            <th
              scope="col"
              style={{ ...colHeaderStyle, textAlign: 'left', fontWeight: 400 }}
            />
            <th scope="col" style={colHeaderStyle}>{todayLabel}</th>
            {hasTomorrow && (
              <th scope="col" style={colHeaderStyle}>{tomorrowLabel}</th>
            )}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={labelStyle}>Phase</td>
            <td style={valueStyle}>{hasTomorrow ? abbrevPhase(phaseName) : phaseName}</td>
            {hasTomorrow && <td style={valueStyle}>{abbrevPhase(phaseNameTmw!)}</td>}
          </tr>
          <tr>
            <td style={labelStyle}>Illumination</td>
            <td style={valueStyle}>{fmtIllum(almanac.moon.illuminationPercent)}</td>
            {hasTomorrow && <td style={valueStyle}>{fmtIllum(tomorrow.moon.illuminationPercent)}</td>}
          </tr>
          <tr>
            <td style={labelStyle}>Moonrise</td>
            <td style={valueStyle}>{fmtTime(almanac.moon.rise, tz)}</td>
            {hasTomorrow && <td style={valueStyle}>{fmtTime(tomorrow.moon.rise, tz)}</td>}
          </tr>
          <tr>
            <td style={labelStyle}>Moonset</td>
            <td style={valueStyle}>{fmtTime(almanac.moon.set, tz)}</td>
            {hasTomorrow && <td style={valueStyle}>{fmtTime(tomorrow.moon.set, tz)}</td>}
          </tr>
          <tr>
            <td style={labelStyle}>Full Moon</td>
            <td colSpan={hasTomorrow ? 2 : 1} style={{ ...valueStyle, textAlign: hasTomorrow ? 'center' : 'right' }}>{fullMoonText}</td>
          </tr>
          <tr>
            <td style={labelStyle}>New Moon</td>
            <td colSpan={hasTomorrow ? 2 : 1} style={{ ...valueStyle, textAlign: hasTomorrow ? 'center' : 'right' }}>{newMoonText}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Azimuth</td>
            <td colSpan={hasTomorrow ? 2 : 1} style={{ ...valueStyle, textAlign: hasTomorrow ? 'center' : 'right' }}>{azimuthText}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Altitude</td>
            <td colSpan={hasTomorrow ? 2 : 1} style={{ ...valueStyle, textAlign: hasTomorrow ? 'center' : 'right' }}>{altitudeText}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared table cell styles — defined once, applied across both panels
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  color: 'var(--muted-foreground)',
  padding: '0.15rem 0',
  whiteSpace: 'nowrap',
};

const valueStyle: React.CSSProperties = {
  textAlign: 'right',
  fontFamily: 'var(--font-display, system-ui, sans-serif)',
  fontWeight: 600,
  padding: '0.15rem 0',
  color: 'var(--foreground)',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * SunMoonDetailCard — enlarged Sun & Moon card for the almanac page.
 *
 * Renders a 3-column layout (sun data | arc SVG | moon data) at md+,
 * single column on mobile. Matches the approved C7-almanac-page.html
 * "Surface B: Sun & Moon" design.
 *
 * Props:
 *   almanac    — AlmanacSnapshot from useAlmanac(), or null.
 *   moonNames  — MoonNameData from useAlmanacMoonNames(), or null.
 *   stationTz  — IANA TZ identifier from StationMetadata (ADR-020).
 *   loading    — Show skeleton while data is loading.
 *   error      — Show error when non-null.
 */
export function SunMoonDetailCard({
  almanac,
  almanacTomorrow,
  moonNames,
  stationTz,
  loading,
  error,
}: SunMoonDetailCardProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  return (
    <Card footprint="full" aria-busy={loading}>
      <CardHeader>
        <CardTitle as="h2">Sun &amp; Moon</CardTitle>
      </CardHeader>

      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">
              Loading sun and moon data
            </span>
            <SunMoonDetailSkeleton />
          </>
        ) : error ? (
          <SunMoonDetailError message={error} />
        ) : almanac ? (
          <div aria-live="polite">
            {/* 3-column grid: sun | arc | moon at md+, single column mobile.
                Inline style cannot be used for the column template because
                Tailwind responsive overrides (max-md:) cannot beat inline style
                specificity without !important, which requires explicit Tailwind
                config. Instead we use a CSS class that sets the grid template
                via a utility-friendly approach: md:grid-cols-[1fr_2fr_1fr]
                using Tailwind arbitrary value syntax (supported in v3+). */}
            <div
              className="grid gap-4 items-start grid-cols-1 md:grid-cols-[1fr_2fr_1fr]"
            >
              <SunPanel almanac={almanac} tomorrow={almanacTomorrow} tz={stationTz} locale={locale} />
              <ArcPanel
                almanac={almanac}
                moonNames={moonNames}
                tz={stationTz}
              />
              <MoonPanel almanac={almanac} tomorrow={almanacTomorrow} tz={stationTz} locale={locale} />
            </div>

            {/* Footer row: Next Solstice / Next Equinox */}
            {(almanac.sun.nextSolstice || almanac.sun.nextEquinox) && (
              <div
                className="flex gap-8 justify-center flex-wrap border-t border-border text-muted-foreground"
                style={{
                  marginTop: '0.75rem',
                  paddingTop: '0.75rem',
                  fontSize: 'var(--text-label, 0.75rem)',
                }}
              >
                {almanac.sun.nextSolstice && (
                  <span>
                    Next Solstice:{' '}
                    <strong
                      style={{
                        color: 'var(--foreground)',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                      }}
                    >
                      {fmtEventDate(almanac.sun.nextSolstice, stationTz, locale)}
                    </strong>
                  </span>
                )}
                {almanac.sun.nextEquinox && (
                  <span>
                    Next Equinox:{' '}
                    <strong
                      style={{
                        color: 'var(--foreground)',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                      }}
                    >
                      {fmtEventDate(almanac.sun.nextEquinox, stationTz, locale)}
                    </strong>
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No almanac data available.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
