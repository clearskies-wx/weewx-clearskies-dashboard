// BeachProfileChart.tsx — Inline SVG cross-shore beach profile visualization.
//
// Task: T6.3 (SWAN-CORRECTIONS-PLAN Phase 6).
// Data source: GET /api/v1/surf/{locationId}/profile (ADR-097).
//
// Renders a cross-shore transect showing:
//   - Bathymetric seafloor profile (tan/brown fill)
//   - Water surface line (blue)
//   - Wave height envelope (semi-transparent blue fill)
//   - Break point markers (vertical dashed lines + wave height labels)
//   - Y-axis depth labels with horizontal gridlines (0m, -5m, -10m, ...)
//   - X-axis distance labels with tick marks (0m, 250m, 500m, ...)
//   - Break point distance-from-shore annotation below each break marker
//
// X-axis orientation: shore on RIGHT, offshore on LEFT (surfer's perspective).
// Y-axis: water surface at computed SVG y; depth below as positive SVG y
//   (increases down); wave height above as negative SVG y (decreases up).
//
// A11y (rules/coding.md §5):
//   - SVG has role="img" + aria-labelledby pointing to an embedded <title>
//   - A sr-only <table> below the SVG carries all numeric transect data
//   - Break point annotations duplicated in the sr-only table
//   - No color-only signals: break points have dashed lines + text labels

import type { BeachProfileTransectPoint, BeachProfileBreakPoint } from '../../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BeachProfileChartProps {
  transect: BeachProfileTransectPoint[];
  breakPoints: BeachProfileBreakPoint[];
  heightUnit: string;
  locale: string;
  /** Current tidal elevation in meters relative to MSL. Positive = above MSL
   *  (high tide), negative = below (low tide). The water surface and shore
   *  intersection shift along the bathymetry slope accordingly. */
  tideLevel?: number | null;
}

// ---------------------------------------------------------------------------
// SVG layout constants
// ---------------------------------------------------------------------------

const VIEW_W = 800;
const VIEW_H = 250;       // ~3.2:1 aspect ratio — fits ~2 grid rows at full width
const PAD_TOP    = 25;    // room for wave height labels above surface
const PAD_BOTTOM = 48;    // room for x-axis labels + break distance labels
const PAD_LEFT   = 55;    // room for y-axis depth labels
const PAD_RIGHT  = 10;

const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP  - PAD_BOTTOM;

// ---------------------------------------------------------------------------
// 3-tier X-axis scale (preserves spatial intuition across spots)
//
// Short   (0–100m):  shorebreaks, wedge waves, tight beach breaks
// Standard (0–300m): 90% of beach breaks, reefs, point breaks (default)
// Extended (0–1000m): big-wave outer reefs, long point breaks
//
// Tier auto-selected from the outermost break point distance. A fully
// dynamic (fluid) scale destroys visual memory — sandbars and reef slopes
// stretch or squash, making it impossible to compare spots.
// ---------------------------------------------------------------------------

interface ScaleTier {
  maxDistance: number;
  tickStep: number;
}

const TIER_SHORT:    ScaleTier = { maxDistance: 100,  tickStep: 25 };
const TIER_STANDARD: ScaleTier = { maxDistance: 300,  tickStep: 50 };
const TIER_EXTENDED: ScaleTier = { maxDistance: 1000, tickStep: 200 };

function selectTier(
  breakPoints: BeachProfileBreakPoint[],
  transect: BeachProfileTransectPoint[],
): ScaleTier {
  const outerBreakDist = breakPoints.length > 0
    ? Math.max(...breakPoints.map((bp) => bp.distanceFromShore))
    : 0;

  if (outerBreakDist > 0 && outerBreakDist <= 100) return TIER_SHORT;
  if (outerBreakDist > 0 && outerBreakDist <= 300) return TIER_STANDARD;
  if (outerBreakDist > 300) return TIER_EXTENDED;

  // No breaks detected — pick tier from the transect's shallowest meaningful
  // range (where depth < 10m, i.e. the nearshore zone).
  const maxDist = Math.max(...transect.map((p) => p.distanceFromShore), 0);
  if (maxDist <= 100) return TIER_SHORT;
  if (maxDist <= 300) return TIER_STANDARD;
  return TIER_EXTENDED;
}

// ---------------------------------------------------------------------------
// Axis tick computation helpers
// ---------------------------------------------------------------------------

function computeDepthTicks(maxDepth: number): number[] {
  const step = maxDepth <= 3 ? 1 : maxDepth <= 10 ? 2 : 5;
  const maxTick = Math.ceil(maxDepth / step) * step;
  const ticks: number[] = [];
  for (let d = 0; d <= maxTick; d += step) {
    ticks.push(d);
  }
  return ticks;
}

function computeDistanceTicks(tier: ScaleTier): number[] {
  const ticks: number[] = [];
  for (let d = 0; d <= tier.maxDistance; d += tier.tickStep) {
    ticks.push(d);
  }
  return ticks;
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

/**
 * Map distanceFromShore to SVG x.
 * Shore (min distance) → right edge. Offshore (max distance) → left edge.
 */
function xScale(distance: number, xMin: number, xMax: number): number {
  if (xMax === xMin) return PAD_LEFT + CHART_W / 2;
  return PAD_LEFT + CHART_W * (1 - (distance - xMin) / (xMax - xMin));
}

/**
 * Map a data value in "elevation" units to SVG y.
 * elevation > 0 → above water surface (wave crest) → smaller SVG y (up)
 * elevation < 0 → below water surface (depth) → larger SVG y (down)
 *
 * @param elevation  positive = above surface; negative = below surface (use -depth)
 * @param surfaceY   SVG y of the water surface
 * @param unitsPerPx pixels per data unit (wave-height or depth)
 */
function yScale(elevation: number, surfaceY: number, unitsPerPx: number): number {
  // elevation is positive above, negative below. SVG y increases downward.
  return surfaceY - elevation * unitsPerPx;
}

// ---------------------------------------------------------------------------
// Polygon / polyline point builders
// ---------------------------------------------------------------------------

function buildSeafloorPolygon(
  transect: BeachProfileTransectPoint[],
  xMin: number,
  xMax: number,
  surfaceY: number,
  unitsPerPx: number,
): string {
  if (transect.length === 0) return '';

  // Points along the seafloor (depth as positive below surface → negative elevation)
  const floor = transect.map(
    (p) => `${xScale(p.distanceFromShore, xMin, xMax).toFixed(1)},${yScale(-p.depth, surfaceY, unitsPerPx).toFixed(1)}`,
  );

  // Bottom-right and bottom-left corners to close the polygon (below chart)
  const chartBottom = PAD_TOP + CHART_H;
  const rightEdge   = xScale(transect[transect.length - 1].distanceFromShore, xMin, xMax).toFixed(1);
  const leftEdge    = xScale(transect[0].distanceFromShore, xMin, xMax).toFixed(1);

  return [
    ...floor,
    `${rightEdge},${chartBottom}`,
    `${leftEdge},${chartBottom}`,
  ].join(' ');
}

function buildWaveEnvelopePolygon(
  transect: BeachProfileTransectPoint[],
  xMin: number,
  xMax: number,
  surfaceY: number,
  unitsPerPx: number,
): string {
  const withWave = transect.filter((p) => p.waveHeight !== null && p.waveHeight > 0);
  if (withWave.length < 2) return '';

  // Top edge: wave crest line (left → right)
  const crests = withWave.map(
    (p) =>
      `${xScale(p.distanceFromShore, xMin, xMax).toFixed(1)},${yScale(p.waveHeight as number, surfaceY, unitsPerPx).toFixed(1)}`,
  );

  // Bottom edge: water surface (right → left)
  const rightX = xScale(withWave[withWave.length - 1].distanceFromShore, xMin, xMax).toFixed(1);
  const leftX  = xScale(withWave[0].distanceFromShore, xMin, xMax).toFixed(1);

  return [
    ...crests,
    `${rightX},${surfaceY.toFixed(1)}`,
    `${leftX},${surfaceY.toFixed(1)}`,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BeachProfileChart({
  transect,
  breakPoints,
  heightUnit,
  locale,
  tideLevel = null,
}: BeachProfileChartProps) {
  if (transect.length === 0) {
    return null;
  }

  // ── Tier selection and data clipping ────────────────────────────────────
  const tier = selectTier(breakPoints, transect);
  const clipped = transect.filter((p) => p.distanceFromShore <= tier.maxDistance);
  const displayTransect = clipped.length >= 2 ? clipped : transect;

  const xMin = 0;
  const xMax = tier.maxDistance;

  // Tide-adjusted depth: the water surface sits at tideLevel above MSL, so
  // effective depth at each point = bathymetric_depth + tideLevel (high tide
  // adds water, making it deeper; low tide subtracts). When no tide data is
  // available, tideLevel = 0 (MSL).
  const tide = tideLevel ?? 0;

  const maxDepth = Math.max(...displayTransect.map((p) => p.depth + tide), 0.1);
  const maxWaveH = Math.max(...displayTransect.map((p) => p.waveHeight ?? 0), 0.1);

  const totalRange = maxDepth + maxWaveH;
  const unitsPerPx = CHART_H / totalRange;

  const surfaceY = PAD_TOP + maxWaveH * unitsPerPx;

  // Dynamic tidal shoreline: find the distance where the bathymetry crosses
  // the tide level (depth == tideLevel → submerged/exposed boundary). The
  // shore intersection shifts right (inland) at high tide, left (seaward)
  // at low tide. Interpolate between the two nearest transect points.
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

  // ── Axis ticks ────────────────────────────────────────────────────────────
  const depthTicks    = computeDepthTicks(maxDepth);
  const distanceTicks = computeDistanceTicks(tier);

  const chartBottom = PAD_TOP + CHART_H;

  // ── Polygon paths ─────────────────────────────────────────────────────────
  const seafloorPoints  = buildSeafloorPolygon(displayTransect, xMin, xMax, surfaceY, unitsPerPx);
  const waveEnvPoints   = buildWaveEnvelopePolygon(displayTransect, xMin, xMax, surfaceY, unitsPerPx);
  const seafloorPolyline = displayTransect
    .map(
      (p) =>
        `${xScale(p.distanceFromShore, xMin, xMax).toFixed(1)},${yScale(-p.depth, surfaceY, unitsPerPx).toFixed(1)}`,
    )
    .join(' ');

  // Water surface line end x coords
  const xLeft  = PAD_LEFT;
  const xRight = PAD_LEFT + CHART_W;

  // ── Break point markers ───────────────────────────────────────────────────

  // ── Aria label text ───────────────────────────────────────────────────────
  const bpCount     = breakPoints.length;
  const bpDescriptions = breakPoints
    .map((bp, i) =>
      `Break point ${i + 1}: ${bp.distanceFromShore.toFixed(0)} m from shore${
        bp.waveHeight !== null
          ? `, wave height ${bp.waveHeight.toFixed(1)} ${heightUnit}`
          : ''
      }.`,
    )
    .join(' ');
  const titleText = `Cross-shore beach profile. Seafloor depth and wave height across ${(xMax - xMin).toFixed(0)} m of ocean.${
    bpCount > 0 ? ` ${bpCount} break location${bpCount > 1 ? 's' : ''} marked. ${bpDescriptions}` : ''
  }`;

  const titleId = 'beach-profile-title';

  // ── Number formatting ─────────────────────────────────────────────────────
  const fmt1 = (n: number | null) =>
    n === null
      ? '—'
      : n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // ── Shared styles ─────────────────────────────────────────────────────────
  const axisLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    fill: 'var(--muted-foreground)',
    fontFamily: 'var(--font-chart, var(--font-sans, sans-serif))',
    fontFeatureSettings: '"tnum"',
  };

  return (
    <>
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
              x1={PAD_LEFT}
              y1={y}
              x2={xRight}
              y2={y}
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

        {/* ── 1. Bathymetric seafloor fill ── */}
        {seafloorPoints && (
          <polygon
            points={seafloorPoints}
            style={{
              fill: 'var(--beach-profile-sand, rgba(194, 166, 120, 0.6))',
              stroke: 'none',
            }}
          />
        )}

        {/* Seafloor outline for definition */}
        {seafloorPolyline && (
          <polyline
            points={seafloorPolyline}
            style={{
              fill: 'none',
              stroke: 'var(--beach-profile-sand-stroke, rgba(160, 130, 80, 0.8))',
              strokeWidth: 1.5,
            }}
          />
        )}

        {/* ── 2. Water surface line (extends from offshore to tidal shoreline) ── */}
        <line
          x1={xLeft}
          y1={surfaceY}
          x2={xScale(shoreIntersectDist, xMin, xMax)}
          y2={surfaceY}
          style={{
            stroke: 'var(--beach-profile-water, rgba(59, 130, 246, 0.5))',
            strokeWidth: 1.5,
          }}
        />
        {/* Tidal shoreline marker */}
        {shoreIntersectDist > 0 && (
          <circle
            cx={xScale(shoreIntersectDist, xMin, xMax)}
            cy={surfaceY}
            r={3}
            aria-hidden="true"
            style={{ fill: 'var(--beach-profile-water, rgba(59, 130, 246, 0.7))' }}
          />
        )}

        {/* ── 3. Wave height envelope fill ── */}
        {waveEnvPoints && (
          <polygon
            points={waveEnvPoints}
            style={{
              fill: 'rgba(59, 130, 246, 0.25)',
              stroke: 'rgba(59, 130, 246, 0.6)',
              strokeWidth: 1,
            }}
          />
        )}

        {/* ── 4. Break point markers ── */}
        {breakPoints.map((bp, i) => {
          const bpX = xScale(bp.distanceFromShore, xMin, xMax);
          // Top of the dashed line: at or just above the wave height at this x, or above surface
          const waveAtBp =
            bp.waveHeight !== null ? yScale(bp.waveHeight, surfaceY, unitsPerPx) : surfaceY - 8;
          const labelY = Math.max(waveAtBp - 6, PAD_TOP + 2);

          return (
            <g key={`bp-${i}`} aria-hidden="true">
              {/* Dashed vertical line */}
              <line
                x1={bpX}
                y1={labelY}
                x2={bpX}
                y2={yScale(-bp.depth, surfaceY, unitsPerPx)}
                style={{
                  stroke: 'var(--destructive)',
                  strokeWidth: 1.5,
                  strokeDasharray: '4,4',
                  strokeOpacity: 0.8,
                }}
              />
              {/* Wave height label at top of line */}
              {bp.waveHeight !== null && (
                <text
                  x={bpX}
                  y={labelY - 2}
                  textAnchor="middle"
                  style={{
                    fontSize: '11px',
                    fill: 'var(--destructive)',
                    fontFamily: 'var(--font-sans, sans-serif)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmt1(bp.waveHeight)}{heightUnit}
                </text>
              )}
              {/* Distance-from-shore label in x-axis padding area below chart */}
              <text
                x={bpX}
                y={chartBottom + 30}
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
                {bp.distanceFromShore.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* ── 5. Y-axis depth labels (left of chart area) ── */}
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

        {/* ── 6. X-axis tick marks and distance labels ── */}
        {distanceTicks.map((dist) => {
          const x = xScale(dist, xMin, xMax);
          return (
            <g key={`xtick-${dist}`} aria-hidden="true">
              {/* Tick mark */}
              <line
                x1={x}
                y1={chartBottom}
                x2={x}
                y2={chartBottom + 5}
                style={{
                  stroke: 'var(--muted-foreground)',
                  strokeWidth: 1,
                  strokeOpacity: 0.5,
                }}
              />
              {/* Distance label */}
              <text
                x={x}
                y={chartBottom + 16}
                textAnchor="middle"
                style={axisLabelStyle}
              >
                {dist}
              </text>
            </g>
          );
        })}

        {/* ── Distance axis label (bottom center) ── */}
        <text
          x={VIEW_W / 2}
          y={VIEW_H - 6}
          textAnchor="middle"
          aria-hidden="true"
          style={{
            fontSize: '10px',
            fill: 'var(--muted-foreground)',
            fontFamily: 'var(--font-sans, sans-serif)',
          }}
        >
          Distance from shore
        </text>

        {/* ── Tide level indicator (top-right, when tide data available) ── */}
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
            Tide: {tide > 0 ? '+' : ''}{tide.toFixed(1)}
          </text>
        )}
      </svg>

      {/* ── Screen-reader-only data table ── */}
      <table className="sr-only" aria-label="Beach profile transect data">
        <caption>Cross-shore beach profile: depth and wave height at each transect point</caption>
        <thead>
          <tr>
            <th scope="col">Distance from shore (m)</th>
            <th scope="col">Depth (m)</th>
            <th scope="col">Wave Height ({heightUnit})</th>
            <th scope="col">Swell Height ({heightUnit})</th>
            <th scope="col">Breaking Fraction</th>
          </tr>
        </thead>
        <tbody>
          {displayTransect.map((p, i) => (
            <tr key={i}>
              <td>{p.distanceFromShore.toFixed(0)}</td>
              <td>{p.depth.toFixed(1)}</td>
              <td>{fmt1(p.waveHeight)}</td>
              <td>{fmt1(p.swellHeight)}</td>
              <td>{p.breakingFraction !== null ? (p.breakingFraction * 100).toFixed(0) + '%' : '—'}</td>
            </tr>
          ))}
        </tbody>
        {breakPoints.length > 0 && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={5}>Break points (QB peaks)</th>
            </tr>
            {breakPoints.map((bp, i) => (
              <tr key={`foot-bp-${i}`}>
                <td>{bp.distanceFromShore.toFixed(0)}</td>
                <td>{bp.depth.toFixed(1)}</td>
                <td>{fmt1(bp.waveHeight)}</td>
                <td colSpan={2} />
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </>
  );
}
