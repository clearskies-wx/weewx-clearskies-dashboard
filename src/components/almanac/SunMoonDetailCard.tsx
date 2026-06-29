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

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlmanacSnapshot, MoonNameData, PositionsSnapshot } from '../../api/types';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MoonPhaseG, MoonPhaseIcon } from '../moon-phase-icon';
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
  let setMs = new Date(setIso).getTime();
  if (!isFinite(riseMs) || !isFinite(setMs)) return null;
  // Cross-midnight transit: set time is earlier in the calendar day than rise,
  // meaning the body rises today and sets tomorrow (e.g. moonrise 12:53 PM,
  // moonset 12:25 AM). Shift set forward 24h to model the actual arc duration.
  if (setMs <= riseMs) setMs += 24 * 60 * 60 * 1000;
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
function formatShortDate(iso: string, _tz: string, locale: string): string {
  try {
    // Date-only strings (YYYY-MM-DD) are parsed as midnight UTC by Date().
    // Formatting with a negative-offset timezone shifts the date backward
    // (e.g. midnight UTC Jun 27 → Jun 26 5 PM PDT). Parse as noon UTC and
    // format in UTC so the calendar date is stable across all timezones.
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(d);
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
  positions: PositionsSnapshot | null;
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
    <div role="alert" className="text-destructive" style={{ fontSize: 'var(--text-body)' }}>
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Center panel — Arc SVG visualization
// ---------------------------------------------------------------------------

interface ArcPanelProps {
  almanac: AlmanacSnapshot;
  positions: PositionsSnapshot | null;
  moonNames: MoonNameData | null;
  tz: string;
}

function ArcPanel({ almanac, positions, moonNames, tz }: ArcPanelProps) {
  const isMobile = useIsMobile();
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Pin rise/set values during an active transit so a data refresh across a
  // date boundary cannot yank the arc mid-cycle.  New values are accepted
  // only when the body is NOT between rise and set (pct outside 0-1).
  const sunRiseRef = useRef(almanac.sun.rise);
  const sunSetRef = useRef(almanac.sun.set);
  const moonRiseRef = useRef(almanac.moon.rise);
  const moonSetRef = useRef(almanac.moon.set);

  const sunPinPct = arcProgress(sunRiseRef.current, sunSetRef.current, nowMs);
  if (sunPinPct === null || sunPinPct < 0 || sunPinPct > 1) {
    sunRiseRef.current = almanac.sun.rise;
    sunSetRef.current = almanac.sun.set;
  }

  const moonPinPct = arcProgress(moonRiseRef.current, moonSetRef.current, nowMs);
  if (moonPinPct === null || moonPinPct < 0 || moonPinPct > 1) {
    moonRiseRef.current = almanac.moon.rise;
    moonSetRef.current = almanac.moon.set;
  }

  // Sun arc progress (using pinned values)
  const sunPct = arcProgress(sunRiseRef.current, sunSetRef.current, nowMs);
  const sunMarker =
    sunPct !== null ? arcPoint(sunPct, CX, CY, SUN_RX, SUN_RY) : null;

  // Moon arc progress (using pinned values)
  const moonPct = arcProgress(moonRiseRef.current, moonSetRef.current, nowMs);
  const moonMarker =
    moonPct !== null ? arcPoint(moonPct, CX, CY, MOON_RX, MOON_RY) : null;

  // Moon phase
  const illumination = almanac.moon.illuminationPercent;
  const phaseName = formatPhaseName(almanac.moon.phaseName);
  const illumText =
    illumination !== null ? `${Math.round(illumination)}%` : '—';

  // Compact time labels for arc endpoints and rise/set labels
  const sunriseText = fmtCompact(almanac.sun.rise, tz);
  const sunsetText = fmtCompact(almanac.sun.set, tz);
  const moonriseText = fmtCompact(almanac.moon.rise, tz);
  const moonsetText = fmtCompact(almanac.moon.set, tz);

  // Sun/moon altitude from live positions (polled every 60s), not static daily snapshot
  const sunAlt = positions?.sun.altitude ?? null;
  const moonAlt = positions?.moon.altitude ?? null;
  const sunAltText = sunAlt !== null ? `${sunAlt.toFixed(1)}°` : null;
  const moonAltText = moonAlt !== null ? `${moonAlt.toFixed(1)}°` : null;

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

  // (Moon phase rendering is handled by MoonPhaseG / MoonPhaseIcon components)

  // Traveled-arc technique: draw the SAME full elliptical path as the dashed
  // background, but use stroke-dasharray to reveal only the traveled portion.
  // This guarantees the solid arc follows the identical ellipse — no SVG arc
  // endpoint-fitting issues.
  //
  // Ramanujan semi-perimeter approximation for a semi-ellipse:
  //   half of π(3(a+b) − √((3a+b)(a+3b)))
  function semiPerimeter(rx: number, ry: number): number {
    return Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))) / 2;
  }

  const sunArcLen = semiPerimeter(SUN_RX, SUN_RY);
  const moonArcLen = semiPerimeter(MOON_RX, MOON_RY);

  const sunActive = sunPct !== null && sunPct >= 0 && sunPct <= 1;
  const moonActive = moonPct !== null && moonPct >= 0 && moonPct <= 1;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Arc SVG — taller viewBox on mobile to fit scaled-up labels below horizon */}
      <svg
        role="img"
        viewBox={`0 0 ${SVG_W} ${isMobile ? SVG_H + 30 : SVG_H}`}
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
          strokeWidth={isMobile ? 3.5 : 2.5}
          strokeDasharray={DASH}
          strokeLinecap="round"
          opacity={0.45}
          clipPath="url(#smdc-above-horizon)"
          aria-hidden="true"
        />

        {/* ── Sun arc — traveled portion solid (dasharray on same path) ──── */}
        {sunActive && sunPct !== null && sunPct > 0 && (
          <path
            d={ellipsePath(CX, CY, SUN_RX, SUN_RY)}
            fill="none"
            stroke={SUN_COLOR}
            strokeWidth={isMobile ? 3.5 : 2.5}
            strokeLinecap="round"
            strokeDasharray={`${sunPct * sunArcLen} ${sunArcLen}`}
            clipPath="url(#smdc-above-horizon)"
            aria-hidden="true"
          />
        )}

        {/* ── Moon arc — full dashed ──────────────────────────────────────── */}
        <path
          d={ellipsePath(CX, CY, MOON_RX, MOON_RY)}
          fill="none"
          stroke={MOON_COLOR}
          strokeWidth={isMobile ? 2.8 : 1.8}
          strokeDasharray={DASH}
          strokeLinecap="round"
          opacity={0.45}
          clipPath="url(#smdc-above-horizon)"
          aria-hidden="true"
        />

        {/* ── Moon arc — traveled portion solid (dasharray on same path) ── */}
        {moonActive && moonPct !== null && moonPct > 0 && (
          <path
            d={ellipsePath(CX, CY, MOON_RX, MOON_RY)}
            fill="none"
            stroke={MOON_COLOR}
            strokeWidth={isMobile ? 2.8 : 1.8}
            strokeLinecap="round"
            strokeDasharray={`${moonPct * moonArcLen} ${moonArcLen}`}
            clipPath="url(#smdc-above-horizon)"
            aria-hidden="true"
          />
        )}

        {/* ── Arc endpoint dots (rise/set markers) ───────────────────────── */}
        {/* Sun rise left endpoint */}
        <circle
          cx={CX - SUN_RX}
          cy={CY}
          r={isMobile ? 6 : 4}
          fill={SUN_COLOR}
          opacity={0.7}
          aria-hidden="true"
        />
        {/* Sun set right endpoint */}
        <circle
          cx={CX + SUN_RX}
          cy={CY}
          r={isMobile ? 6 : 4}
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
              r={isMobile ? 22 : 14}
              fill={SUN_COLOR}
              fillOpacity={0.12}
            />
            {/* Outer ring */}
            <circle
              cx={sunMarker.x}
              cy={sunMarker.y}
              r={isMobile ? 13 : 8}
              fill="none"
              stroke={SUN_COLOR}
              strokeWidth={isMobile ? 2.5 : 1.5}
            />
            {/* Solid core */}
            <circle
              cx={sunMarker.x}
              cy={sunMarker.y}
              r={isMobile ? 7 : 4}
              fill={SUN_COLOR}
            />
            {/* Radiating rays */}
            {sunRays.map((ray, i) => {
              const s = isMobile ? 1.6 : 1;
              return (
                <line
                  key={i}
                  x1={sunMarker.x + ray.dx1 * s}
                  y1={sunMarker.y + ray.dy1 * s}
                  x2={sunMarker.x + ray.dx2 * s}
                  y2={sunMarker.y + ray.dy2 * s}
                  stroke={SUN_COLOR}
                  strokeWidth={isMobile ? 2.5 : 1.5}
                  strokeLinecap="round"
                />
              );
            })}
            {/* Altitude label above marker */}
            {sunAltText && (
              <text
                x={sunMarker.x}
                y={sunMarker.y - (isMobile ? 30 : 22)}
                textAnchor="middle"
                fontSize={isMobile ? 19 : 14}
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
            <MoonPhaseG
              cx={moonMarker.x}
              cy={moonMarker.y}
              r={isMobile ? 12 : 7}
              illuminationPercent={illumination ?? 50}
              phaseName={almanac.moon.phaseName}
            />
            {/* Altitude label above moon marker */}
            {moonAltText && (
              <text
                x={moonMarker.x}
                y={moonMarker.y - (isMobile ? 20 : 14)}
                textAnchor="middle"
                fontSize={isMobile ? 17 : 10}
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
          y={CY + (isMobile ? 22 : 18)}
          textAnchor="middle"
          fontFamily="var(--font-display, system-ui, sans-serif)"
          fontWeight={600}
          fontSize={isMobile ? 22 : 13}
          fill={SUN_COLOR}
          aria-hidden="true"
        >
          {sunriseText}
        </text>
        <text
          x={CX + SUN_RX}
          y={CY + (isMobile ? 22 : 18)}
          textAnchor="middle"
          fontFamily="var(--font-display, system-ui, sans-serif)"
          fontWeight={600}
          fontSize={isMobile ? 22 : 13}
          fill={SUN_COLOR}
          aria-hidden="true"
        >
          {sunsetText}
        </text>

        {/* ── Moonrise/moonset labels below sun labels (silver) ───────────── */}
        <text
          x={CX - MOON_RX}
          y={CY + (isMobile ? 46 : 36)}
          textAnchor="middle"
          fontFamily="var(--font-sans, system-ui, sans-serif)"
          fontSize={isMobile ? 18 : 10}
          fill={MOON_COLOR}
          aria-hidden="true"
        >
          Rise {moonriseText}
        </text>
        <text
          x={CX + MOON_RX}
          y={CY + (isMobile ? 46 : 36)}
          textAnchor="middle"
          fontFamily="var(--font-sans, system-ui, sans-serif)"
          fontSize={isMobile ? 18 : 10}
          fill={MOON_COLOR}
          aria-hidden="true"
        >
          Set {moonsetText}
        </text>
      </svg>

      {/* ── Moon phase row ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3" aria-label={`${phaseName}, ${illumText} illuminated`}>
        {/* Moon phase SVG icon — elliptical terminator rendering */}
        <MoonPhaseIcon
          size={isMobile ? 48 : 40}
          illuminationPercent={illumination ?? 50}
          phaseName={almanac.moon.phaseName}
          ariaLabel={`${phaseName} ${illumText} illuminated`}
        />

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
  positions: PositionsSnapshot | null;
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

function SunPanel({ almanac, tomorrow, positions, tz, locale }: SunPanelProps) {
  const todayLabel = formatShortDate(almanac.date, tz, locale);
  const tomorrowLabel = tomorrow ? formatShortDate(tomorrow.date, tz, locale) : null;
  const hasTomorrow = tomorrow !== null;

  const daylightText = formatDaylight(almanac.sun.daylightMinutes);
  const deltaText = formatDelta(almanac.sun.daylightDeltaVsYesterdayMinutes);
  const daylightTextTmw = tomorrow ? formatDaylight(tomorrow.sun.daylightMinutes) : null;
  const deltaTextTmw = tomorrow ? formatDelta(tomorrow.sun.daylightDeltaVsYesterdayMinutes) : null;

  const liveAz = positions?.sun.azimuth ?? null;
  const liveAlt = positions?.sun.altitude ?? null;
  const azimuthText = liveAz !== null ? `${liveAz.toFixed(1)}°` : '—';
  const altitudeText = liveAlt !== null ? `${liveAlt.toFixed(1)}°` : '—';

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
  positions: PositionsSnapshot | null;
  tz: string;
  locale: string;
}

function MoonPanel({ almanac, tomorrow, positions, tz, locale }: MoonPanelProps) {
  const todayLabel = formatShortDate(almanac.date, tz, locale);
  const tomorrowLabel = tomorrow ? formatShortDate(tomorrow.date, tz, locale) : null;
  const hasTomorrow = tomorrow !== null;

  const phaseName = formatPhaseName(almanac.moon.phaseName);
  const phaseNameTmw = tomorrow ? formatPhaseName(tomorrow.moon.phaseName) : null;

  const fmtIllum = (pct: number | null) =>
    pct !== null ? `${Math.round(pct)}%` : '—';

  const liveAz = positions?.moon.azimuth ?? null;
  const liveAlt = positions?.moon.altitude ?? null;
  const azimuthText = liveAz !== null ? `${liveAz.toFixed(1)}°` : '—';
  const altitudeText = liveAlt !== null ? `${liveAlt.toFixed(1)}°` : '—';
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
  positions,
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
              {/* Mobile: arc first (order-2 → center on desktop, order-first on mobile) */}
              <div className="order-2 md:order-none">
                <SunPanel almanac={almanac} tomorrow={almanacTomorrow} positions={positions} tz={stationTz} locale={locale} />
              </div>
              <div className="order-1 md:order-none">
                <ArcPanel
                  almanac={almanac}
                  positions={positions}
                  moonNames={moonNames}
                  tz={stationTz}
                />
              </div>
              <div className="order-3 md:order-none">
                <MoonPanel almanac={almanac} tomorrow={almanacTomorrow} positions={positions} tz={stationTz} locale={locale} />
              </div>
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
          <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
            No almanac data available.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
