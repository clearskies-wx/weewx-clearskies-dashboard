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
}

// ---------------------------------------------------------------------------
// SVG layout constants
// ---------------------------------------------------------------------------

const VIEW_W = 800;
const VIEW_H = 300;
const PAD_TOP    = 40;  // room for wave height labels above surface
const PAD_BOTTOM = 30;  // room for distance axis below chart
const PAD_LEFT   = 10;
const PAD_RIGHT  = 10;

const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP  - PAD_BOTTOM;

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
}: BeachProfileChartProps) {
  if (transect.length === 0) {
    return null;
  }

  // ── Data extents ──────────────────────────────────────────────────────────
  const xMin = Math.min(...transect.map((p) => p.distanceFromShore));
  const xMax = Math.max(...transect.map((p) => p.distanceFromShore));

  const maxDepth = Math.max(...transect.map((p) => p.depth), 0.1);
  const maxWaveH = Math.max(...transect.map((p) => p.waveHeight ?? 0), 0.1);

  // Total y range covers depth below + wave height above the surface.
  const totalRange = maxDepth + maxWaveH;
  const unitsPerPx = CHART_H / totalRange;

  // Water surface position in SVG y: allocate space proportional to wave height
  const surfaceY = PAD_TOP + maxWaveH * unitsPerPx;

  // ── Polygon paths ─────────────────────────────────────────────────────────
  const seafloorPoints  = buildSeafloorPolygon(transect, xMin, xMax, surfaceY, unitsPerPx);
  const waveEnvPoints   = buildWaveEnvelopePolygon(transect, xMin, xMax, surfaceY, unitsPerPx);
  const seafloorPolyline = transect
    .map(
      (p) =>
        `${xScale(p.distanceFromShore, xMin, xMax).toFixed(1)},${yScale(-p.depth, surfaceY, unitsPerPx).toFixed(1)}`,
    )
    .join(' ');

  // Water surface line end x coords
  const xLeft  = PAD_LEFT;
  const xRight = PAD_LEFT + CHART_W;

  // ── Break point markers ───────────────────────────────────────────────────
  const chartBottom = PAD_TOP + CHART_H;

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

        {/* ── 2. Water surface line ── */}
        <line
          x1={xLeft}
          y1={surfaceY}
          x2={xRight}
          y2={surfaceY}
          style={{
            stroke: 'var(--beach-profile-water, rgba(59, 130, 246, 0.5))',
            strokeWidth: 1.5,
          }}
        />

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
            </g>
          );
        })}

        {/* ── Shore label (right) ── */}
        <text
          x={xRight - 4}
          y={surfaceY + 14}
          textAnchor="end"
          aria-hidden="true"
          style={{
            fontSize: '10px',
            fill: 'var(--muted-foreground)',
            fontFamily: 'var(--font-sans, sans-serif)',
          }}
        >
          Shore
        </text>

        {/* ── Offshore label (left) ── */}
        <text
          x={xLeft + 4}
          y={surfaceY + 14}
          textAnchor="start"
          aria-hidden="true"
          style={{
            fontSize: '10px',
            fill: 'var(--muted-foreground)',
            fontFamily: 'var(--font-sans, sans-serif)',
          }}
        >
          Offshore
        </text>

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
          Distance from shore (m)
        </text>
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
          {transect.map((p, i) => (
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
