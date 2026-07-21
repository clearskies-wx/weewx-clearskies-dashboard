// BeachProfileChart.tsx — Complete cross-shore beach profile visualization.
//
// T5.3 (SURF-1D-IMPLEMENTATION-PLAN Phase 5) — major rewrite.
// Previous version: T6.3 (SWAN-CORRECTIONS-PLAN Phase 6).
// Data source: GET /api/v1/surf/{locationId}/profile (ADR-097 / T5.2).
//
// 9 elements per T5.3 spec:
//   1. Seafloor profile  — CUDEM bathymetry tan/brown polygon at 3-5m resolution
//   2. Water column      — solid blue fill 0.25 opacity (SURF-20 fix: was 0.08, invisible)
//   3. Hs envelope       — smooth curve above still water level; shoaling + breaking decay
//   4. Wave shapes       — optional toggle: Stokes→cnoidal→bore cross-sections
//   5. Surf zone overlays — impact (red/orange) + foam (amber) zones with labels
//   6. Break point markers — breaker type icon, face height, distance, partition label
//   7. Jacking annotation — "1.5× jacking" where jacking factor > 1.3
//   8. Axis labels        — Y: "Depth (unit, datum)", X: "Distance from shore (unit)"
//   9. Transect selector  — dropdown for Best Peak / Average / numbered transects
//
// X-axis: shore on RIGHT, offshore on LEFT (surfer's perspective).
// Y-axis: surface at computed SVG y; below surface → larger SVG y (down);
//          above surface → smaller SVG y (up).
//
// A11y (rules/coding.md §5):
//   - SVG: role="img" + aria-labelledby → embedded <title>
//   - Transect selector: <label> + <select> — keyboard-reachable
//   - Wave shapes toggle: <button> with aria-pressed
//   - sr-only <table> carries all numeric transect data and zone info
//   - No color-only signals: zones have text labels, break points have dashed lines
//   - Zone overlay colors pair with "IMPACT ZONE" / "FOAM ZONE" text labels

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BeachProfileTransectPoint,
  BeachProfileBreakPoint,
  BeachProfileSurfZones,
  BeachProfileTransectInfo,
} from '../../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BeachProfileChartProps {
  transect: BeachProfileTransectPoint[];
  breakPoints: BeachProfileBreakPoint[];
  heightUnit: string;
  /** Unit label for horizontal distance and depth axes (e.g. "ft" or "m"). */
  distanceUnit: string;
  locale: string;
  /** Current tidal elevation in display units relative to MSL. Positive = above MSL. */
  tideLevel?: number | null;
  /** Vertical datum for depth label (e.g. "NAVD88"). Null = omit datum from label. */
  datum?: string | null;
  /** Surf zone extents from the 1D model. Null = zone overlays not rendered. */
  surfZones?: BeachProfileSurfZones | null;
  /** Available transects for the selector. Null = selector not rendered. */
  transects?: BeachProfileTransectInfo[] | null;
  /** Currently selected transect (controlled by parent). */
  selectedTransect?: number | 'best_peak' | 'average';
  /** Called when the visitor selects a different transect. */
  onTransectChange?: (value: number | 'best_peak' | 'average') => void;
}

// ---------------------------------------------------------------------------
// SVG layout constants
// ---------------------------------------------------------------------------

const VIEW_W = 820;
const VIEW_H = 292;
const PAD_TOP    = 32;   // room for jacking labels + wave height labels above surface
const PAD_BOTTOM = 72;   // room for x-axis labels, break distance, partition label
const PAD_LEFT   = 72;   // room for y-axis depth labels + rotated Y-axis title
const PAD_RIGHT  = 12;

const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP  - PAD_BOTTOM;

// Zone colors — semi-transparent overlays. Text labels are the primary signal;
// color is secondary (paired with "IMPACT ZONE" / "FOAM ZONE" text).
const ZONE_IMPACT_FILL  = 'rgba(220, 38, 38, 0.14)';   // red-600 at 14%
const ZONE_FOAM_FILL    = 'rgba(234, 179, 8, 0.14)';   // amber-500 at 14%

// Wave shape rendering width (SVG units) — one wave cross-section span
const WAVE_SHAPE_W = 38;

// ---------------------------------------------------------------------------
// 3-tier X-axis scale
// ---------------------------------------------------------------------------

interface ScaleTier { maxDistance: number; tickStep: number; }

function selectTier(
  breakPoints: BeachProfileBreakPoint[],
  transect: BeachProfileTransectPoint[],
  tierShort: ScaleTier,
  tierStandard: ScaleTier,
  tierExtended: ScaleTier,
): ScaleTier {
  const outerBreakDist = breakPoints.length > 0
    ? Math.max(...breakPoints.map((bp) => bp.distanceFromShore))
    : 0;
  if (outerBreakDist > 0 && outerBreakDist <= tierShort.maxDistance)    return tierShort;
  if (outerBreakDist > 0 && outerBreakDist <= tierStandard.maxDistance) return tierStandard;
  if (outerBreakDist > tierStandard.maxDistance)                         return tierExtended;
  const maxDist = Math.max(...transect.map((p) => p.distanceFromShore), 0);
  if (maxDist <= tierShort.maxDistance)    return tierShort;
  if (maxDist <= tierStandard.maxDistance) return tierStandard;
  return tierExtended;
}

// ---------------------------------------------------------------------------
// Axis tick helpers
// ---------------------------------------------------------------------------

function computeDepthTicks(maxDepth: number): number[] {
  const step = maxDepth <= 3 ? 1 : maxDepth <= 10 ? 2 : 5;
  const maxTick = Math.ceil(maxDepth / step) * step;
  const ticks: number[] = [];
  for (let d = 0; d <= maxTick; d += step) ticks.push(d);
  return ticks;
}

function computeDistanceTicks(tier: ScaleTier): number[] {
  const ticks: number[] = [];
  for (let d = 0; d <= tier.maxDistance; d += tier.tickStep) ticks.push(d);
  return ticks;
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

/** Shore (distance=0) → right edge; offshore (distance=xMax) → left edge. */
function xScale(distance: number, xMin: number, xMax: number): number {
  if (xMax === xMin) return PAD_LEFT + CHART_W / 2;
  return PAD_LEFT + CHART_W * (1 - (distance - xMin) / (xMax - xMin));
}

/**
 * elevation > 0 → above water surface (wave crest) → smaller SVG y (up)
 * elevation < 0 → below water surface (depth) → larger SVG y (down)
 */
function yScale(elevation: number, surfaceY: number, unitsPerPx: number): number {
  return surfaceY - elevation * unitsPerPx;
}

// ---------------------------------------------------------------------------
// Polygon builders
// ---------------------------------------------------------------------------

function buildSeafloorPolygon(
  transect: BeachProfileTransectPoint[],
  xMin: number, xMax: number, surfaceY: number, unitsPerPx: number,
): string {
  if (transect.length === 0) return '';
  const floor = transect.map(
    (p) => `${xScale(p.distanceFromShore, xMin, xMax).toFixed(1)},${yScale(-p.depth, surfaceY, unitsPerPx).toFixed(1)}`,
  );
  const chartBottom = PAD_TOP + CHART_H;
  const rightEdge = xScale(transect[transect.length - 1].distanceFromShore, xMin, xMax).toFixed(1);
  const leftEdge  = xScale(transect[0].distanceFromShore, xMin, xMax).toFixed(1);
  return [...floor, `${rightEdge},${chartBottom}`, `${leftEdge},${chartBottom}`].join(' ');
}

function buildWaveEnvelopePolygon(
  transect: BeachProfileTransectPoint[],
  xMin: number, xMax: number, surfaceY: number, unitsPerPx: number,
): string {
  const withWave = transect.filter((p) => p.waveHeight !== null && p.waveHeight > 0);
  if (withWave.length < 2) return '';
  const crests = withWave.map(
    (p) => `${xScale(p.distanceFromShore, xMin, xMax).toFixed(1)},${yScale(p.waveHeight as number, surfaceY, unitsPerPx).toFixed(1)}`,
  );
  const rightX = xScale(withWave[withWave.length - 1].distanceFromShore, xMin, xMax).toFixed(1);
  const leftX  = xScale(withWave[0].distanceFromShore, xMin, xMax).toFixed(1);
  return [...crests, `${rightX},${surfaceY.toFixed(1)}`, `${leftX},${surfaceY.toFixed(1)}`].join(' ');
}

// ---------------------------------------------------------------------------
// Breaker type mini-icon paths (16×10 viewBox, shore-facing perspective)
// ---------------------------------------------------------------------------

function breakerTypePath(type: 'spilling' | 'plunging' | 'surging'): string {
  switch (type) {
    case 'spilling':
      // Gentle undulating wave — slope rolls over progressively
      return 'M0,8 Q4,2 8,4 Q12,6 14,2 L16,2';
    case 'plunging':
      // Steep pitching lip that throws forward
      return 'M0,9 C2,9 3,4 5,1 C7,-2 10,2 10,6 Q12,8 16,6';
    case 'surging':
      // Steep near-shore slope, wave surges up without breaking
      return 'M0,8 L4,8 C7,8 8,5 8,1 L16,1';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BeachProfileChart({
  transect,
  breakPoints,
  heightUnit,
  distanceUnit = 'm',
  locale,
  tideLevel = null,
  datum = null,
  surfZones = null,
  transects = null,
  selectedTransect,
  onTransectChange,
}: BeachProfileChartProps) {
  const { t } = useTranslation('marine');

  // Wave shapes toggle — internal state
  const hasWaveShapeData = transect.some((p) => p.waveShape && p.waveShape.length > 0);
  const [showWaveShapes, setShowWaveShapes] = useState(false);

  if (transect.length === 0) return null;

  // ── Distance unit scaling ───────────────────────────────────────────────
  const METER_TO_UNIT = distanceUnit === 'ft' ? 3.28084 : 1;
  const tierShort    = { maxDistance: Math.round(100  * METER_TO_UNIT), tickStep: Math.round(25  * METER_TO_UNIT) };
  const tierStandard = { maxDistance: Math.round(300  * METER_TO_UNIT), tickStep: Math.round(50  * METER_TO_UNIT) };
  const tierExtended = { maxDistance: Math.round(1000 * METER_TO_UNIT), tickStep: Math.round(200 * METER_TO_UNIT) };

  const tier = selectTier(breakPoints, transect, tierShort, tierStandard, tierExtended);
  const clipped = transect.filter((p) => p.distanceFromShore <= tier.maxDistance);
  const displayTransect = clipped.length >= 2 ? clipped : transect;

  const xMin = 0;
  const xMax = tier.maxDistance;

  const tide = tideLevel ?? 0;
  const maxDepth = Math.max(...displayTransect.map((p) => p.depth + tide), 0.1);
  const maxWaveH = Math.max(...displayTransect.map((p) => p.waveHeight ?? 0), 0.1);

  const totalRange = maxDepth + maxWaveH;
  const unitsPerPx = CHART_H / totalRange;
  const surfaceY = PAD_TOP + maxWaveH * unitsPerPx;

  // Dynamic tidal shoreline
  let shoreIntersectDist = 0;
  if (displayTransect.length >= 2) {
    const sorted = [...displayTransect].sort((a, b) => a.distanceFromShore - b.distanceFromShore);
    for (let i = 0; i < sorted.length - 1; i++) {
      const d0 = sorted[i].depth;
      const d1 = sorted[i + 1].depth;
      if (d0 <= tide && d1 > tide) {
        const frac = (tide - d0) / (d1 - d0);
        shoreIntersectDist = sorted[i].distanceFromShore +
          frac * (sorted[i + 1].distanceFromShore - sorted[i].distanceFromShore);
        break;
      }
    }
  }

  // ── Axis ticks ────────────────────────────────────────────────────────
  const depthTicks    = computeDepthTicks(maxDepth);
  const distanceTicks = computeDistanceTicks(tier);
  const chartBottom   = PAD_TOP + CHART_H;

  // ── Polygon paths ─────────────────────────────────────────────────────
  const seafloorPoints  = buildSeafloorPolygon(displayTransect, xMin, xMax, surfaceY, unitsPerPx);
  const waveEnvPoints   = buildWaveEnvelopePolygon(displayTransect, xMin, xMax, surfaceY, unitsPerPx);
  const seafloorPolyline = displayTransect.map(
    (p) => `${xScale(p.distanceFromShore, xMin, xMax).toFixed(1)},${yScale(-p.depth, surfaceY, unitsPerPx).toFixed(1)}`,
  ).join(' ');

  const xLeft  = PAD_LEFT;
  const xRight = PAD_LEFT + CHART_W;

  // ── Axis label strings ────────────────────────────────────────────────
  const yAxisTitle = datum
    ? t('surfing.beachProfile.depthAxisLabel', { unit: distanceUnit, datum })
    : t('surfing.beachProfile.depthAxisLabelNoDatum', { unit: distanceUnit });
  const xAxisTitle = t('surfing.beachProfile.distanceAxisLabel', { unit: distanceUnit });

  // ── Aria description ─────────────────────────────────────────────────
  const bpCount = breakPoints.length;
  const bpDescriptions = breakPoints.map((bp, i) => {
    const typeStr = bp.breakerType
      ? ` (${t(`surfing.beachProfile.breakType.${bp.breakerType}`)})`
      : '';
    const heightVal = bp.faceHeight ?? bp.waveHeight;
    return `${t('surfing.beachProfile.breakPointAria', { n: i + 1 })} ${bp.distanceFromShore.toFixed(0)} ${distanceUnit} from shore${heightVal !== null ? `, ${heightVal!.toFixed(1)} ${heightUnit} face height${typeStr}` : ''}.`;
  }).join(' ');
  const zoneDesc = surfZones?.impactZone
    ? ` ${t('surfing.beachProfile.impactZone')} from ${surfZones.impactZone.startDistance.toFixed(0)} to ${surfZones.impactZone.endDistance.toFixed(0)} ${distanceUnit} from shore.`
    : '';
  const titleText = `${t('surfing.beachProfile.ariaTitle', { range: (xMax - xMin).toFixed(0), unit: distanceUnit })}${bpCount > 0 ? ` ${bpDescriptions}` : ''}${zoneDesc}`;
  const titleId = 'beach-profile-title';

  // ── Number formatting ─────────────────────────────────────────────────
  const fmt1 = (n: number | null | undefined): string => {
    if (n == null) return '—';
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  };

  // ── Shared styles ─────────────────────────────────────────────────────
  const axisLabelStyle: CSSProperties = {
    fontSize: '10px',
    fill: 'var(--muted-foreground)',
    fontFamily: 'var(--font-chart, var(--font-sans, sans-serif))',
    fontFeatureSettings: '"tnum"',
  };
  const axisTitleStyle: CSSProperties = {
    fontSize: '10px',
    fill: 'var(--muted-foreground)',
    fontFamily: 'var(--font-sans, sans-serif)',
  };
  const zoneLabelStyle: CSSProperties = {
    fontFamily: 'var(--font-sans, sans-serif)',
    fontWeight: 600,
    letterSpacing: '0.04em',
    fontSize: '9px',
  };

  // ── Wave shape helper — build polyline points for one wave cross-section ─
  function buildWaveShapePolyline(
    centerX: number,
    waveShape: { phase: number; elevation: number }[],
  ): string {
    if (waveShape.length < 2) return '';
    // Map phase (0 to max phase) to x within WAVE_SHAPE_W window
    const maxPhase = Math.max(...waveShape.map((p) => p.phase));
    if (maxPhase <= 0) return '';
    return waveShape.map((p) => {
      const lx = centerX - WAVE_SHAPE_W / 2 + (p.phase / maxPhase) * WAVE_SHAPE_W;
      const ly = yScale(p.elevation, surfaceY, unitsPerPx);
      return `${lx.toFixed(1)},${ly.toFixed(1)}`;
    }).join(' ');
  }

  // Points to render wave shapes at (break points + midpoint of shoaling zone)
  const waveShapeTargets: number[] = [];
  if (showWaveShapes && hasWaveShapeData) {
    // Midpoint of transect
    const midIdx = Math.floor(displayTransect.length / 2);
    if (displayTransect[midIdx]?.waveShape?.length) waveShapeTargets.push(midIdx);
    // Near each break point — find closest transect index
    for (const bp of breakPoints) {
      let closest = -1;
      let closestDiff = Infinity;
      displayTransect.forEach((p, i) => {
        const diff = Math.abs(p.distanceFromShore - bp.distanceFromShore);
        if (diff < closestDiff) { closestDiff = diff; closest = i; }
      });
      if (closest >= 0 && displayTransect[closest]?.waveShape?.length && !waveShapeTargets.includes(closest)) {
        waveShapeTargets.push(closest);
      }
    }
  }

  // ── Transect selector value (for the <select>) ─────────────────────────
  const selectorValue = selectedTransect === undefined
    ? 'best_peak'
    : String(selectedTransect);

  // ── Zone overlap helpers ──────────────────────────────────────────────
  function zoneRect(extent: { startDistance: number; endDistance: number } | null | undefined) {
    if (!extent) return null;
    const x1 = xScale(extent.startDistance, xMin, xMax);
    const x2 = xScale(extent.endDistance, xMin, xMax);
    const left  = Math.min(x1, x2);
    const width = Math.abs(x2 - x1);
    if (width < 1) return null;
    return { left, width };
  }

  const impactRect  = zoneRect(surfZones?.impactZone);
  const foamRect    = zoneRect(surfZones?.foamZone);
  const reformRect  = zoneRect(surfZones?.reformTrough);

  return (
    <div className="flex flex-col gap-2">
      {/* ── Controls row: transect selector + wave shapes toggle ── */}
      {(transects && transects.length > 0) || hasWaveShapeData ? (
        <div
          className="flex items-center gap-4 flex-wrap"
          style={{ fontSize: 'var(--text-label)' }}
        >
          {transects && transects.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="beach-profile-transect-select"
                className="text-muted-foreground font-medium"
                style={{ fontSize: 'var(--text-label)' }}
              >
                {t('surfing.beachProfile.transectSelectorLabel')}:
              </label>
              <select
                id="beach-profile-transect-select"
                value={selectorValue}
                onChange={(e) => {
                  if (!onTransectChange) return;
                  const v = e.target.value;
                  if (v === 'best_peak' || v === 'average') {
                    onTransectChange(v);
                  } else {
                    onTransectChange(Number(v));
                  }
                }}
                className="rounded border border-border bg-card text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                style={{
                  fontSize: 'var(--text-label)',
                  padding: '0.2rem 0.5rem',
                  minHeight: '28px',
                }}
              >
                <option value="best_peak">{t('surfing.beachProfile.bestPeakLabel')}</option>
                <option value="average">{t('surfing.beachProfile.averageLabel')}</option>
                {transects.map((tx) => (
                  <option key={tx.index} value={String(tx.index)}>
                    {tx.label}
                    {!tx.isOpen ? ` (${t('surfing.beachProfile.structureAffected')})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasWaveShapeData && (
            <button
              type="button"
              aria-pressed={showWaveShapes}
              onClick={() => setShowWaveShapes((v) => !v)}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded px-2 py-1 border border-border bg-card transition-colors"
              style={{ fontSize: 'var(--text-label)', minHeight: '28px' }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  border: '1.5px solid currentColor',
                  background: showWaveShapes ? 'currentColor' : 'transparent',
                  flexShrink: 0,
                }}
              />
              {t('surfing.beachProfile.showWaveShapes')}
            </button>
          )}
        </div>
      ) : null}

      {/* ── SVG visualization ── */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{titleText}</title>

        {/* ── 0. Y-axis horizontal gridlines (behind all chart content) ── */}
        {depthTicks.map((d) => {
          const y = yScale(-d, surfaceY, unitsPerPx);
          return (
            <line
              key={`ygrid-${d}`}
              x1={PAD_LEFT} y1={y} x2={xRight} y2={y}
              aria-hidden="true"
              style={{
                stroke: 'var(--border, rgba(100,100,100,0.3))',
                strokeWidth: 0.5,
                strokeDasharray: d === 0 ? undefined : '3,4',
                strokeOpacity: 0.5,
              }}
            />
          );
        })}

        {/* ── 1. Bathymetric seafloor fill (tan/brown) ── */}
        {seafloorPoints && (
          <polygon
            points={seafloorPoints}
            aria-hidden="true"
            style={{ fill: 'var(--beach-profile-sand, rgba(194, 166, 120, 0.65))', stroke: 'none' }}
          />
        )}
        {seafloorPolyline && (
          <polyline
            points={seafloorPolyline}
            aria-hidden="true"
            style={{
              fill: 'none',
              stroke: 'var(--beach-profile-sand-stroke, rgba(160, 130, 80, 0.85))',
              strokeWidth: 1.5,
            }}
          />
        )}

        {/* ── 2. Water column fill (SURF-20 fix: opacity raised from 0.08 to 0.25) ── */}
        <defs>
          <clipPath id="water-clip">
            <rect x={PAD_LEFT} y={surfaceY} width={CHART_W} height={chartBottom - surfaceY} />
          </clipPath>
        </defs>
        {seafloorPoints && (
          <polygon
            points={seafloorPoints}
            aria-hidden="true"
            clipPath="url(#water-clip)"
            style={{ fill: 'rgba(59, 130, 246, 0.25)', stroke: 'none' }}
          />
        )}

        {/* ── Water surface line ── */}
        <line
          x1={xLeft} y1={surfaceY}
          x2={xScale(shoreIntersectDist, xMin, xMax)} y2={surfaceY}
          aria-hidden="true"
          style={{ stroke: 'var(--beach-profile-water, rgba(59, 130, 246, 0.55))', strokeWidth: 1.5 }}
        />
        {shoreIntersectDist > 0 && (
          <circle
            cx={xScale(shoreIntersectDist, xMin, xMax)}
            cy={surfaceY}
            r={3}
            aria-hidden="true"
            style={{ fill: 'var(--beach-profile-water, rgba(59, 130, 246, 0.75))' }}
          />
        )}

        {/* ── 3. Wave height (Hs) envelope fill + stroke ── */}
        {waveEnvPoints && (
          <polygon
            points={waveEnvPoints}
            aria-hidden="true"
            style={{
              fill: 'rgba(59, 130, 246, 0.32)',
              stroke: 'rgba(59, 130, 246, 0.85)',
              strokeWidth: 1.5,
            }}
          />
        )}

        {/* ── 4. Wave shape cross-sections (optional) ── */}
        {showWaveShapes && waveShapeTargets.map((idx) => {
          const pt = displayTransect[idx];
          if (!pt?.waveShape?.length) return null;
          const cx = xScale(pt.distanceFromShore, xMin, xMax);
          const pts = buildWaveShapePolyline(cx, pt.waveShape);
          if (!pts) return null;
          return (
            <polyline
              key={`wshape-${idx}`}
              points={pts}
              aria-hidden="true"
              style={{
                fill: 'none',
                stroke: 'rgba(59, 130, 246, 0.9)',
                strokeWidth: 2,
                strokeLinejoin: 'round',
                strokeLinecap: 'round',
              }}
            />
          );
        })}

        {/* ── 5a. Impact zone overlay ── */}
        {impactRect && (
          <g aria-hidden="true">
            <rect
              x={impactRect.left}
              y={PAD_TOP}
              width={impactRect.width}
              height={CHART_H}
              style={{ fill: ZONE_IMPACT_FILL }}
            />
            {/* Left boundary dashed line */}
            <line
              x1={impactRect.left + impactRect.width} y1={PAD_TOP}
              x2={impactRect.left + impactRect.width} y2={chartBottom}
              style={{
                stroke: 'rgba(220, 38, 38, 0.45)',
                strokeWidth: 1,
                strokeDasharray: '3,3',
              }}
            />
            {/* Label: background rect then text */}
            <rect
              x={impactRect.left + 3}
              y={PAD_TOP + 2}
              width={72}
              height={14}
              rx={2}
              style={{ fill: 'var(--card, white)', opacity: 0.75 }}
            />
            <text
              x={impactRect.left + 6}
              y={PAD_TOP + 12}
              style={{ ...zoneLabelStyle, fill: 'var(--destructive)' }}
            >
              {t('surfing.beachProfile.impactZone')}
            </text>
          </g>
        )}

        {/* ── 5b. Foam zone overlay ── */}
        {foamRect && (
          <g aria-hidden="true">
            <rect
              x={foamRect.left}
              y={PAD_TOP}
              width={foamRect.width}
              height={CHART_H}
              style={{ fill: ZONE_FOAM_FILL }}
            />
            {/* Left boundary dashed line */}
            <line
              x1={foamRect.left + foamRect.width} y1={PAD_TOP}
              x2={foamRect.left + foamRect.width} y2={chartBottom}
              style={{
                stroke: 'rgba(234, 179, 8, 0.45)',
                strokeWidth: 1,
                strokeDasharray: '3,3',
              }}
            />
            {/* Label */}
            <rect
              x={foamRect.left + 3}
              y={PAD_TOP + 2}
              width={68}
              height={14}
              rx={2}
              style={{ fill: 'var(--card, white)', opacity: 0.75 }}
            />
            <text
              x={foamRect.left + 6}
              y={PAD_TOP + 12}
              style={{ ...zoneLabelStyle, fill: 'var(--score-2, #d97706)' }}
            >
              {t('surfing.beachProfile.foamZone')}
            </text>
          </g>
        )}

        {/* ── 5c. Reform trough — unlabeled clear gap indicator ── */}
        {reformRect && (
          <g aria-hidden="true">
            {/* Left boundary */}
            <line
              x1={reformRect.left} y1={surfaceY}
              x2={reformRect.left} y2={chartBottom}
              style={{
                stroke: 'var(--muted-foreground, rgba(120,120,120,0.5))',
                strokeWidth: 0.75,
                strokeDasharray: '2,4',
              }}
            />
            {/* Right boundary */}
            <line
              x1={reformRect.left + reformRect.width} y1={surfaceY}
              x2={reformRect.left + reformRect.width} y2={chartBottom}
              style={{
                stroke: 'var(--muted-foreground, rgba(120,120,120,0.5))',
                strokeWidth: 0.75,
                strokeDasharray: '2,4',
              }}
            />
          </g>
        )}

        {/* ── 6. Break point markers ── */}
        {breakPoints.map((bp, i) => {
          const bpX = xScale(bp.distanceFromShore, xMin, xMax);
          const displayHeight = bp.faceHeight ?? bp.waveHeight;
          const waveAtBp = displayHeight !== null
            ? yScale(displayHeight, surfaceY, unitsPerPx)
            : surfaceY - 8;
          const labelY = Math.max(waveAtBp - 6, PAD_TOP + 4);
          const seafloorY = yScale(-bp.depth, surfaceY, unitsPerPx);

          return (
            <g key={`bp-${i}`} aria-hidden="true">
              {/* Dashed vertical line */}
              <line
                x1={bpX} y1={labelY + 16} x2={bpX} y2={seafloorY}
                style={{ stroke: 'var(--destructive)', strokeWidth: 1.5, strokeDasharray: '4,4', strokeOpacity: 0.8 }}
              />
              {/* Wave crest triangle */}
              <polygon
                points={`${bpX},${surfaceY - 2} ${bpX - 5},${surfaceY - 11} ${bpX + 5},${surfaceY - 11}`}
                style={{ fill: 'var(--destructive)', fillOpacity: 0.9 }}
              />

              {/* ── Face height or wave height label above marker ── */}
              <text
                x={bpX}
                y={labelY}
                textAnchor="middle"
                style={{
                  fontSize: '11px',
                  fill: 'var(--destructive)',
                  fontFamily: 'var(--font-sans, sans-serif)',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {displayHeight !== null ? `${fmt1(displayHeight)} ${heightUnit}` : ''}
              </text>

              {/* ── Breaker type mini-icon + label ── */}
              {bp.breakerType && (
                <g transform={`translate(${bpX - 8}, ${surfaceY - 30})`}>
                  <svg width={16} height={10} viewBox="0 0 16 10" overflow="visible">
                    <path
                      d={breakerTypePath(bp.breakerType)}
                      style={{
                        fill: 'none',
                        stroke: 'var(--destructive)',
                        strokeWidth: 1.5,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round',
                      }}
                    />
                  </svg>
                </g>
              )}

              {/* ── Distance from shore label ── */}
              <text
                x={bpX}
                y={chartBottom + 18}
                textAnchor="middle"
                style={{
                  fontSize: '10px',
                  fill: 'var(--destructive)',
                  fontFamily: 'var(--font-sans, sans-serif)',
                  fontFeatureSettings: '"tnum"',
                  fontWeight: 600,
                  fillOpacity: 0.85,
                }}
              >
                {new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bp.distanceFromShore)}
                {' '}{distanceUnit}
              </text>

              {/* ── Per-partition annotation ── */}
              {bp.partitionLabel && (
                <text
                  x={bpX}
                  y={chartBottom + 33}
                  textAnchor="middle"
                  style={{
                    fontSize: '9px',
                    fill: 'var(--muted-foreground)',
                    fontFamily: 'var(--font-sans, sans-serif)',
                    fillOpacity: 0.8,
                  }}
                >
                  {bp.partitionLabel}
                </text>
              )}

              {/* ── Breaker type text label ── */}
              {bp.breakerType && (
                <text
                  x={bpX}
                  y={chartBottom + 46}
                  textAnchor="middle"
                  style={{
                    fontSize: '9px',
                    fill: 'var(--destructive)',
                    fontFamily: 'var(--font-sans, sans-serif)',
                    fillOpacity: 0.7,
                    textTransform: 'capitalize',
                  }}
                >
                  {t(`surfing.beachProfile.breakType.${bp.breakerType}`)}
                </text>
              )}
            </g>
          );
        })}

        {/* ── 7. Jacking annotations ── */}
        {breakPoints.map((bp, i) => {
          if (!bp.jackingFactor || bp.jackingFactor <= 1.3) return null;
          const bpX = xScale(bp.distanceFromShore, xMin, xMax);
          const jackY = PAD_TOP + 2;
          const label = t('surfing.beachProfile.jackingAnnotation', {
            factor: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bp.jackingFactor),
          });
          return (
            <g key={`jack-${i}`} aria-hidden="true">
              <rect
                x={bpX - 28}
                y={jackY}
                width={56}
                height={12}
                rx={2}
                style={{ fill: 'rgba(234, 179, 8, 0.25)', stroke: 'rgba(234, 179, 8, 0.5)', strokeWidth: 0.5 }}
              />
              <text
                x={bpX}
                y={jackY + 9}
                textAnchor="middle"
                style={{
                  fontSize: '9px',
                  fill: 'var(--score-2, #d97706)',
                  fontFamily: 'var(--font-sans, sans-serif)',
                  fontWeight: 600,
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* ── 8a. Y-axis depth labels ── */}
        {depthTicks.map((d) => {
          const y = yScale(-d, surfaceY, unitsPerPx);
          return (
            <text
              key={`ylabel-${d}`}
              x={PAD_LEFT - 6}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              aria-hidden="true"
              style={axisLabelStyle}
            >
              {d === 0 ? '0' : `-${d}`}
            </text>
          );
        })}

        {/* ── 8b. Y-axis title (rotated) ── */}
        <text
          transform="rotate(-90)"
          x={-(PAD_TOP + CHART_H / 2)}
          y={12}
          textAnchor="middle"
          dominantBaseline="middle"
          aria-hidden="true"
          style={axisTitleStyle}
        >
          {yAxisTitle}
        </text>

        {/* ── 8c. X-axis tick marks and distance labels ── */}
        {distanceTicks.map((dist) => {
          const x = xScale(dist, xMin, xMax);
          return (
            <g key={`xtick-${dist}`} aria-hidden="true">
              <line
                x1={x} y1={chartBottom} x2={x} y2={chartBottom + 5}
                style={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeOpacity: 0.5 }}
              />
              <text x={x} y={chartBottom + 16} textAnchor="middle" style={axisLabelStyle}>
                {new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(dist)}
              </text>
            </g>
          );
        })}

        {/* ── 8d. X-axis title ── */}
        <text
          x={PAD_LEFT + CHART_W / 2}
          y={VIEW_H - 4}
          textAnchor="middle"
          aria-hidden="true"
          style={axisTitleStyle}
        >
          {xAxisTitle}
        </text>

        {/* ── Tide level indicator ── */}
        {tide !== 0 && (
          <text
            x={xRight}
            y={PAD_TOP - 4}
            textAnchor="end"
            aria-hidden="true"
            style={{
              fontSize: '9px',
              fill: 'var(--muted-foreground)',
              fontFamily: 'var(--font-chart, var(--font-sans, sans-serif))',
              fontFeatureSettings: '"tnum"',
              fillOpacity: 0.7,
            }}
          >
            {t('surfing.beachProfile.tideIndicator', {
              sign: tide > 0 ? '+' : '',
              value: fmt1(tide),
            })}
          </text>
        )}
      </svg>

      {/* ── Screen-reader-only data table ── */}
      <table className="sr-only" aria-label={t('surfing.beachProfile.srTableLabel')}>
        <caption>
          {t('surfing.beachProfile.srTableCaption')}
          {surfZones?.impactZone
            ? ` ${t('surfing.beachProfile.impactZone')}: ${surfZones.impactZone.startDistance.toFixed(0)}–${surfZones.impactZone.endDistance.toFixed(0)} ${distanceUnit} from shore.`
            : ''}
          {surfZones?.foamZone
            ? ` ${t('surfing.beachProfile.foamZone')}: ${surfZones.foamZone.startDistance.toFixed(0)}–${surfZones.foamZone.endDistance.toFixed(0)} ${distanceUnit} from shore.`
            : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t('surfing.beachProfile.srColDistance', { unit: distanceUnit })}</th>
            <th scope="col">{t('surfing.beachProfile.srColDepth', { unit: distanceUnit })}</th>
            <th scope="col">{t('surfing.beachProfile.srColWaveHeight', { unit: heightUnit })}</th>
            <th scope="col">{t('surfing.beachProfile.srColSwellHeight', { unit: heightUnit })}</th>
            <th scope="col">{t('surfing.beachProfile.srColBreakingFraction')}</th>
          </tr>
        </thead>
        <tbody>
          {displayTransect.map((p, i) => (
            <tr key={i}>
              <td>{new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(p.distanceFromShore)}</td>
              <td>{fmt1(p.depth)}</td>
              <td>{fmt1(p.waveHeight)}</td>
              <td>{fmt1(p.swellHeight)}</td>
              <td>{p.breakingFraction !== null ? `${(p.breakingFraction * 100).toFixed(0)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
        {breakPoints.length > 0 && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={5}>{t('surfing.beachProfile.srBreakPoints')}</th>
            </tr>
            {breakPoints.map((bp, i) => (
              <tr key={`foot-bp-${i}`}>
                <td>{new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bp.distanceFromShore)}</td>
                <td>{fmt1(bp.depth)}</td>
                <td>{fmt1(bp.faceHeight ?? bp.waveHeight)}</td>
                <td colSpan={2}>
                  {bp.breakerType ? t(`surfing.beachProfile.breakType.${bp.breakerType}`) : ''}
                  {bp.jackingFactor && bp.jackingFactor > 1.3
                    ? ` — ${t('surfing.beachProfile.jackingAnnotation', { factor: fmt1(bp.jackingFactor) })}`
                    : ''}
                </td>
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  );
}
