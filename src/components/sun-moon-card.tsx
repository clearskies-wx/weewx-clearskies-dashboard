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
//   - Moon phase conveyed via screen-reader-only SVG title (no visual label).
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

import { useState, useEffect } from 'react';
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

const SUN_RX = 120;
const SUN_RY = 72;
const MOON_RX = 70;
const MOON_RY = 56;
const CX = 130;
const CY = 86;
const SVG_W = 260;
const SVG_H = 88;

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
 * Build an SVG arc path string for an upper semicircle.
 * Sweeps counterclockwise (sweep-flag=0) so it arcs upward in SVG coords
 * (SVG Y axis is inverted vs. Cartesian).
 */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const x0 = cx - rx;
  const x1 = cx + rx;
  return `M ${x0} ${cy} A ${rx} ${ry} 0 1 1 ${x1} ${cy}`;
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
      style={{ height: 100 }}
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
  svgTitle: string;
}

/** Renders the nested-arc SVG (sun + moon arcs, position markers, horizon). */
function ArcVisualization({
  almanac,
  svgTitle,
}: ArcVisualizationProps) {
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

  const illumination = almanac.moon.illuminationPercent;
  const isNewMoon = illumination !== null && illumination === 0;
  const phaseWords = formatPhaseName(almanac.moon.phaseName).split(' ');

  return (
    <svg
      role="img"
      aria-label={svgTitle}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      preserveAspectRatio="xMidYMax meet"
      width="100%"
      style={{ display: 'block', maxHeight: '100%' }}
    >
      <title>{svgTitle}</title>

      {/* ── Horizon line (full viewBox width) ──────────────────────────── */}
      <line
        x1={0}
        y1={CY}
        x2={SVG_W}
        y2={CY}
        stroke="currentColor"
        strokeWidth={1}
        style={{ opacity: 0.15 }}
        aria-hidden="true"
      />

      {/* ── Sun arc (outer) ────────────────────────────────────────────── */}
      <path
        d={ellipsePath(CX, CY, SUN_RX, SUN_RY)}
        fill="none"
        stroke={SUN_COLOR}
        strokeWidth={3}
        strokeDasharray={DASH}
        strokeLinecap="round"
        aria-hidden="true"
      />

      {/* ── Moon arc (inner) ───────────────────────────────────────────── */}
      <path
        d={ellipsePath(CX, CY, MOON_RX, MOON_RY)}
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
            r={12}
            fill={SUN_COLOR}
            fillOpacity={0.2}
          />
          {/* Solid marker */}
          <circle
            cx={sunMarker.x}
            cy={sunMarker.y}
            r={8}
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
              r={6.5}
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
                r={7}
                fill={MOON_COLOR}
              />
              {/* Crescent shadow — offset dark circle covering the "dark" side */}
              <circle
                cx={moonMarker.x + 2.6}
                cy={moonMarker.y - 2}
                r={5}
                fill="var(--card-background, #1e293b)"
                fillOpacity={0.55}
              />
            </>
          )}
        </g>
      )}

      {/* ── Moon phase label — centered in moon arc, words stack upward ── */}
      {phaseWords.map((word, i) => (
        <text
          key={i}
          x={CX}
          y={CY - 7 - (phaseWords.length - 1 - i) * 13}
          textAnchor="middle"
          fontFamily="var(--font-sans, system-ui, sans-serif)"
          fontStyle="italic"
          fontWeight={600}
          fontSize="var(--text-micro)"
          fill="var(--muted-foreground)"
          aria-hidden="true"
        >
          {word}
        </text>
      ))}

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
// SunMoonContent — arc SVG, rendered when almanac is ready
// ---------------------------------------------------------------------------

interface SunMoonContentProps {
  almanac: AlmanacSnapshot;
  stationTz: string;
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-micro)',
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  lineHeight: 1.3,
};

function SunMoonContent({ almanac, stationTz }: SunMoonContentProps) {
  const fmtCompact = (iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: stationTz,
    }).formatToParts(d);
    const h = parts.find((p) => p.type === 'hour')?.value ?? '';
    const m = parts.find((p) => p.type === 'minute')?.value ?? '';
    const ap = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '')[0]?.toLowerCase() ?? '';
    return `${h}:${m}${ap}`;
  };

  const sunriseText = fmtCompact(almanac.sun.rise);
  const sunsetText = fmtCompact(almanac.sun.set);
  const moonriseText = fmtCompact(almanac.moon.rise);
  const moonsetText = fmtCompact(almanac.moon.set);
  const phaseName = formatPhaseName(almanac.moon.phaseName);
  const illumination = almanac.moon.illuminationPercent;
  const illumText = illumination !== null ? `${Math.round(illumination)}%` : '—';
  const svgTitle = [
    `Sun: rises ${sunriseText}, sets ${sunsetText}`,
    `Moon: rises ${moonriseText}, sets ${moonsetText}`,
    `Phase: ${phaseName}, ${illumText} illuminated`,
  ].join('. ');

  return (
    <div aria-live="polite" style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Arc SVG — fills remaining space above labels */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ArcVisualization almanac={almanac} svgTitle={svgTitle} />
      </div>
      {/* Labels — flex spacers track arc geometry so moon labels align
           with the wider moon arc endpoints (MOON_RX-derived). */}
      <div
        style={{ display: 'flex', alignItems: 'flex-start', paddingTop: '0.25rem' }}
        aria-hidden="true"
      >
        <div style={{ textAlign: 'left', flexShrink: 0 }}>
          <div style={{ ...LABEL_STYLE, fontWeight: 600, color: 'var(--foreground)' }}>{sunriseText}</div>
          <div style={{ ...LABEL_STYLE, fontWeight: 400, color: 'var(--muted-foreground)' }}>Sunrise</div>
        </div>
        <div style={{ flex: CX - MOON_RX }} />
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ ...LABEL_STYLE, fontWeight: 600, color: 'var(--foreground)' }}>{moonriseText}</div>
          <div style={{ ...LABEL_STYLE, fontWeight: 400, color: 'var(--muted-foreground)' }}>Moonrise</div>
        </div>
        <div style={{ flex: MOON_RX * 2 }} />
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ ...LABEL_STYLE, fontWeight: 600, color: 'var(--foreground)' }}>{moonsetText}</div>
          <div style={{ ...LABEL_STYLE, fontWeight: 400, color: 'var(--muted-foreground)' }}>Moonset</div>
        </div>
        <div style={{ flex: SVG_W - CX - MOON_RX }} />
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...LABEL_STYLE, fontWeight: 600, color: 'var(--foreground)' }}>{sunsetText}</div>
          <div style={{ ...LABEL_STYLE, fontWeight: 400, color: 'var(--muted-foreground)' }}>Sunset</div>
        </div>
      </div>
    </div>
  );
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
  const { t } = useTranslation('now');

  return (
    <Card footprint="tile" aria-busy={loading}>
      <CardHeader>
        {/* Title: text-only per spec — NO icon. Manrope 600 via font-heading. */}
        <h2 className="font-heading leading-snug font-semibold pb-0.5 border-b border-border" style={{ fontSize: 'var(--text-card-title, 0.82rem)' }}>
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
          <SunMoonContent almanac={almanac} stationTz={stationTz} />
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('noData.observation')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
