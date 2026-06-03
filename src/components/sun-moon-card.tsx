// sun-moon-card.tsx — Sun & Moon tile for the Now page.
//
// Renders a nested-arcs SVG visualization (Option A, operator-confirmed 2026-06-01).
// The outer arc represents the sun's daily arc (sunrise → sunset).
// The inner arc represents the moon's arc (moonrise → moonset).
// Each body has a position marker proportional to the current time.
//
// Design:
//   - Card footprint "tile" (1 column, ADR-051).
//   - Title: "Sun & Moon" — text-only, Manrope 600 per design token.
//   - Sun arc: gold/amber (#f59e0b), dashed stroke, outer radius.
//   - Moon arc: silver (#94a3b8), dashed stroke, inner radius.
//   - Moon phase label positioned next to the moon marker.
//   - Horizon line: very subtle (opacity 0.15).
//   - New moon: outlined circle (thin ring, dark fill) when illumination = 0%.
//
// A11y (WCAG 2.1 AA):
//   - SVG has role="img" and <title> summarising the astronomical state.
//   - aria-live="polite" on content container for SSE live updates.
//   - Card uses aria-busy during loading.
//   - State signals use position + label, not color alone (§5.1).
//   - All time labels and phase text visible as SVG <text> elements.
//   - Error and loading states use role="alert" / role="status".
//
// Time: formatLocalTime from src/utils/time.ts (ADR-020).
// Units: zero unit knowledge in dashboard (ADR-042).
// i18n: 'now' namespace for labels (ADR-021).

import { useTranslation } from 'react-i18next';
import type { AlmanacSnapshot } from '../api/types';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sun arc — outer semicircle geometry (matches C4 mockup: r=78) */
const SUN_R = 88;
/** Moon arc — inner semicircle geometry (matches C4 mockup: r=44) */
const MOON_R = 52;
/** SVG viewBox half-width; center X = cx (matches C4 mockup viewBox 220×110) */
const CX = 110;
/** SVG viewBox baseline Y; arcs curve upward (negative Y direction) */
const CY = 84;
/** Total SVG width (matches C4 mockup) */
const SVG_W = 220;
/** Total SVG height (matches C4 mockup) */
const SVG_H = 110;

/** Sun color — gold/amber, WCAG AA on dark backgrounds */
const SUN_COLOR = '#f59e0b';
/** Moon color — silver/grey */
const MOON_COLOR = '#94a3b8';
/** Dash pattern shared by both arcs */
const DASH = '7 4';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the (x, y) coordinate on a semicircular arc at a given percentage.
 *
 * The arc curves UPWARD (above the horizon line at cy).
 * pct = 0 → left endpoint (rise); pct = 1 → right endpoint (set).
 *
 * @param pct  Progress along the arc, clamped to [0, 1].
 * @param cx   Horizontal center of the semicircle.
 * @param cy   Vertical center (horizon baseline).
 * @param r    Radius of the semicircle.
 */
function arcPoint(
  pct: number,
  cx: number,
  cy: number,
  r: number,
): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(1, pct));
  // angle=PI at left (rise), angle=0 at right (set)
  const angle = Math.PI * (1 - clamped);
  return {
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  };
}

/**
 * Build an SVG arc path string for an upper semicircle.
 * Sweeps counterclockwise (sweep-flag=0) so it arcs upward in SVG coords
 * (SVG Y axis is inverted vs. Cartesian).
 */
function semicirclePath(cx: number, cy: number, r: number): string {
  const x0 = cx - r; // left endpoint (rise)
  const x1 = cx + r; // right endpoint (set)
  // large-arc-flag=1, sweep-flag=0 → upper semicircle
  return `M ${x0} ${cy} A ${r} ${r} 0 1 1 ${x1} ${cy}`;
}

/**
 * Convert a dash-separated phase name to title case.
 * "waxing-gibbous" → "Waxing Gibbous"
 */
function formatPhaseName(name: string | null): string {
  if (!name) return '—';
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Compute proportion [0, 1] of how far along the arc the body is at `nowMs`.
 * Returns null when either endpoint is missing.
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
// Sub-components
// ---------------------------------------------------------------------------

function SunMoonSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted"
      style={{ height: SVG_H }}
      aria-hidden="true"
    />
  );
}

function SunMoonError({
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

// ---------------------------------------------------------------------------
// Main SVG visualization
// ---------------------------------------------------------------------------

interface ArcVisualizationProps {
  almanac: AlmanacSnapshot;
  tz: string;
  locale: string;
}

function ArcVisualization({ almanac, tz }: ArcVisualizationProps) {
  const nowMs = Date.now();

  // Sun arc progress
  const sunPct = arcProgress(almanac.sun.rise, almanac.sun.set, nowMs);
  const sunMarker =
    sunPct !== null ? arcPoint(sunPct, CX, CY, SUN_R) : null;

  // Moon arc progress
  const moonPct = arcProgress(almanac.moon.rise, almanac.moon.set, nowMs);
  const moonMarker =
    moonPct !== null ? arcPoint(moonPct, CX, CY, MOON_R) : null;

  // Moon phase info
  const illumination = almanac.moon.illuminationPercent;
  const isNewMoon = illumination !== null && illumination === 0;
  const phaseName = formatPhaseName(almanac.moon.phaseName);
  const illumText =
    illumination !== null ? `${Math.round(illumination)}%` : '—';

  // Formatted times
  const fmtCompact = (iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).formatToParts(d);
    const h = parts.find(p => p.type === 'hour')?.value ?? '';
    const m = parts.find(p => p.type === 'minute')?.value ?? '';
    const ap = (parts.find(p => p.type === 'dayPeriod')?.value ?? '')[0]?.toLowerCase() ?? '';
    return `${h}:${m}${ap}`;
  };
  const sunriseText = fmtCompact(almanac.sun.rise);
  const sunsetText = fmtCompact(almanac.sun.set);
  const moonriseText = fmtCompact(almanac.moon.rise);
  const moonsetText = fmtCompact(almanac.moon.set);


  // SVG accessible title — summarises state for screen readers
  const svgTitle = [
    `Sun: rises ${sunriseText}, sets ${sunsetText}`,
    `Moon: rises ${moonriseText}, sets ${moonsetText}`,
    `Phase: ${phaseName}, ${illumText} illuminated`,
  ].join('. ');

  // Moon phase label: positioned next to moon marker per C4 mockup
  const moonLabelX = moonMarker ? moonMarker.x + 12 : CX;
  const moonLabelY = moonMarker ? moonMarker.y + 1 : CY - 10;
  const moonLabelAnchor = moonMarker ? 'start' as const : 'middle' as const;

  return (
    <svg
      role="img"
      aria-label={svgTitle}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width="100%"
      style={{ display: 'block', height: '100%' }}
    >
      <title>{svgTitle}</title>

      {/* ── Horizon line ───────────────────────────────────────────────── */}
      <line
        x1={CX - SUN_R}
        y1={CY}
        x2={CX + SUN_R}
        y2={CY}
        stroke="currentColor"
        strokeWidth={1}
        style={{ opacity: 0.15 }}
        aria-hidden="true"
      />

      {/* ── Sun arc (outer) ────────────────────────────────────────────── */}
      <path
        d={semicirclePath(CX, CY, SUN_R)}
        fill="none"
        stroke={SUN_COLOR}
        strokeWidth={3}
        strokeDasharray={DASH}
        strokeLinecap="round"
        aria-hidden="true"
      />

      {/* ── Moon arc (inner) ───────────────────────────────────────────── */}
      <path
        d={semicirclePath(CX, CY, MOON_R)}
        fill="none"
        stroke={MOON_COLOR}
        strokeWidth={3}
        strokeDasharray={DASH}
        strokeLinecap="round"
        aria-hidden="true"
      />

      {/* ── Sun position marker ────────────────────────────────────────── */}
      {sunMarker && (
        <g aria-hidden="true">
          {/* Glow ring */}
          <circle
            cx={sunMarker.x}
            cy={sunMarker.y}
            r={9}
            fill={SUN_COLOR}
            fillOpacity={0.2}
          />
          {/* Solid marker */}
          <circle
            cx={sunMarker.x}
            cy={sunMarker.y}
            r={6}
            fill={SUN_COLOR}
          />
        </g>
      )}

      {/* ── Moon position marker ───────────────────────────────────────── */}
      {moonMarker && (
        <g aria-hidden="true">
          {isNewMoon ? (
            /* New moon: outlined ring with dark fill (no illumination) */
            <circle
              cx={moonMarker.x}
              cy={moonMarker.y}
              r={5}
              fill="var(--background, #0f172a)"
              stroke={MOON_COLOR}
              strokeWidth={1.5}
            />
          ) : (
            /* Illuminated moon: solid marker with crescent shadow overlay */
            <>
              <circle
                cx={moonMarker.x}
                cy={moonMarker.y}
                r={5.5}
                fill={MOON_COLOR}
              />
              {/* Crescent shadow — offset dark circle covering the "dark" side */}
              <circle
                cx={moonMarker.x + 2}
                cy={moonMarker.y - 1.5}
                r={4}
                fill="var(--card-background, #1e293b)"
                fillOpacity={0.55}
              />
            </>
          )}
        </g>
      )}

      {/* ── Moon phase label (next to moon marker) ─────────────────────── */}
      {/* Phase name */}
      <text
        x={moonLabelX}
        y={moonLabelY}
        textAnchor={moonLabelAnchor}
        fontSize={9}
        fontFamily="var(--font-sans, system-ui, sans-serif)"
        fontWeight={600}
        fill="var(--muted-foreground)"
        aria-hidden="true"
      >
        ☽ {phaseName}
      </text>
      {/* Illumination percent — one line below phase name */}
      <text
        x={moonLabelX}
        y={moonLabelY + 9}
        textAnchor={moonLabelAnchor}
        fontSize={8}
        fontFamily="var(--font-sans, system-ui, sans-serif)"
        fill="var(--muted-foreground, #64748b)"
        aria-hidden="true"
      >
        {illumText} illuminated
      </text>

      {/* ── Rise/set labels per C4 mockup: compact time centered on arc endpoint, label word below ── */}
      {/* Sun rise — left endpoint of sun arc */}
      <text x={CX - SUN_R} y={CY + 12} textAnchor="middle" fontFamily="var(--font-sans, system-ui, sans-serif)" fontWeight={600} fontSize={10} fill="var(--foreground)" aria-hidden="true">{sunriseText}</text>
      <text x={CX - SUN_R} y={CY + 22} textAnchor="middle" fontFamily="var(--font-sans, system-ui, sans-serif)" fontWeight={400} fontSize={8} fill="var(--muted-foreground)" aria-hidden="true">Sunrise</text>
      {/* Moon rise — left endpoint of moon arc */}
      <text x={CX - MOON_R} y={CY + 12} textAnchor="middle" fontFamily="var(--font-sans, system-ui, sans-serif)" fontWeight={600} fontSize={10} fill="var(--foreground)" aria-hidden="true">{moonriseText}</text>
      <text x={CX - MOON_R} y={CY + 22} textAnchor="middle" fontFamily="var(--font-sans, system-ui, sans-serif)" fontWeight={400} fontSize={8} fill="var(--muted-foreground)" aria-hidden="true">Moonrise</text>
      {/* Moon set — right endpoint of moon arc */}
      <text x={CX + MOON_R} y={CY + 12} textAnchor="middle" fontFamily="var(--font-sans, system-ui, sans-serif)" fontWeight={600} fontSize={10} fill="var(--foreground)" aria-hidden="true">{moonsetText}</text>
      <text x={CX + MOON_R} y={CY + 22} textAnchor="middle" fontFamily="var(--font-sans, system-ui, sans-serif)" fontWeight={400} fontSize={8} fill="var(--muted-foreground)" aria-hidden="true">Moonset</text>
      {/* Sun set — right endpoint of sun arc */}
      <text x={CX + SUN_R} y={CY + 12} textAnchor="middle" fontFamily="var(--font-sans, system-ui, sans-serif)" fontWeight={600} fontSize={10} fill="var(--foreground)" aria-hidden="true">{sunsetText}</text>
      <text x={CX + SUN_R} y={CY + 22} textAnchor="middle" fontFamily="var(--font-sans, system-ui, sans-serif)" fontWeight={400} fontSize={8} fill="var(--muted-foreground)" aria-hidden="true">Sunset</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SunMoonCardProps {
  almanac: AlmanacSnapshot | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** IANA time zone identifier from StationMetadata.timezone (ADR-020). */
  stationTz: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SunMoonCard — displays nested semicircular arc visualization of today's
 * sun and moon arcs with position markers for the current time.
 *
 * Props:
 *   almanac    — AlmanacSnapshot from useAlmanac() hook, or null.
 *   loading    — Show skeleton while data is loading.
 *   error      — Show error + retry when non-null.
 *   onRetry    — Callback for retry button.
 *   stationTz  — IANA TZ from StationMetadata for local time display.
 */
export function SunMoonCard({
  almanac,
  loading = false,
  error = null,
  onRetry,
  stationTz,
}: SunMoonCardProps) {
  const { t, i18n } = useTranslation('now');
  const locale = i18n.language;

  return (
    <Card footprint="tile" aria-busy={loading}>
      <CardHeader>
        {/* Title: text-only per spec — NO icon. Manrope 600 via font-heading. */}
        <h2 className="font-heading leading-snug font-semibold pb-1.5 border-b border-border" style={{ fontSize: 'var(--text-card-title, 0.82rem)' }}>
          {t('sunAndMoon')}
        </h2>
      </CardHeader>

      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">
              {t('loading.sunMoon')}
            </span>
            <SunMoonSkeleton />
          </>
        ) : error ? (
          <SunMoonError
            message={t('error.almanac')}
            onRetry={onRetry ?? (() => undefined)}
          />
        ) : almanac ? (
          /* aria-live so SSE-driven refreshes are announced (ADR-041).
             The flex wrapper with overflow:hidden constrains the SVG to the
             available CardContent height so the bottom rise/set labels don't
             clip — the SVG scales proportionally with width="100%" so at the
             tile card width (~270px) the rendered height stays within budget. */
          <div aria-live="polite" style={{ flex: 1, minWidth: 0, minHeight: 0, width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'stretch' }}>
            <ArcVisualization almanac={almanac} tz={stationTz} locale={locale} />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('noData.observation')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
