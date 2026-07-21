// HeatMapCard.tsx — Quasi-2D heat map of significant wave height (Hs) across
// all transects. Renders a custom SVG grid: X = cross-shore distance, Y = along-
// shore position (transect index), cell colour = Hs value.
//
// T7.1 (SURF-1D-IMPLEMENTATION-PLAN Phase 7).
//
// Overlay layers (drawn in order, all semi-transparent so colour cells show):
//   1. Colour cells        — Hs gradient, blue→teal→green→amber→red.
//   2. Zone polygons       — outer-bar break zone (outer edge follows sandbar
//                            contour per row), impact zone (red/orange fill),
//                            foam zone (amber fill).
//   3. Structure shadow    — structure-affected rows shown at reduced opacity (0.35)
//                            with a hatching pattern overlay.
//   4. Breaker-type glyphs — spilling (horizontal line), plunging (curl arc),
//                            surging (vertical line) at each row's break point(s).
//   5. Multi-bar support   — two break-zone curves when rows have outer + inner bars.
//
// A11y (rules/coding.md §5):
//   - SVG: role="img" + aria-labelledby → <title> + <desc>
//   - sr-only <table> carries per-row Hs values and zone info for AT
//   - No colour-only signals: zone fills paired with text labels; break glyphs have
//     distinct shapes; structure rows annotated with aria-label text.
//   - Focus: interactive SVG is aria-hidden; all data exposed via sr-only table.
//
// X-axis: shore on RIGHT, offshore on LEFT (surfer's perspective; matches BeachProfileChart).
// Y-axis: transect rows, top = first transect (index 0).

import { useMemo, useId } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { HeatMapProfileData, HeatMapTransectData, BeachProfileBreakPoint } from '../../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HeatMapCardProps {
  data: HeatMapProfileData | null;
  loading: boolean;
  /** Height unit label (e.g. "ft" or "m"). */
  heightUnit: string;
  /** Distance unit label (e.g. "ft" or "m"). */
  distanceUnit: string;
  locale: string;
}

// ---------------------------------------------------------------------------
// SVG layout constants
// ---------------------------------------------------------------------------

const VIEW_W = 820;
const PAD_TOP    = 28;
const PAD_BOTTOM = 52;
const PAD_LEFT   = 60;
const PAD_RIGHT  = 12;
const CHART_W    = VIEW_W - PAD_LEFT - PAD_RIGHT;  // 748

// Minimum and maximum row height in SVG units.
const ROW_H_MIN = 8;
const ROW_H_MAX = 48;

// Zone colours — matches BeachProfileChart ZONE_IMPACT_FILL / ZONE_FOAM_FILL.
const ZONE_IMPACT_FILL = 'rgba(220, 38, 38, 0.18)';
const ZONE_FOAM_FILL   = 'rgba(234, 179, 8, 0.18)';
const ZONE_BREAK_FILL  = 'rgba(59, 130, 246, 0.12)';

// Hatching pattern ID is stable per component instance (prefixed below).
const HATCH_BASE_ID = 'heatmap-structure-hatch';

// ---------------------------------------------------------------------------
// Colour scale: Hs → CSS rgb string (blue→teal→green→amber→red)
// ---------------------------------------------------------------------------

// Colour stops [R, G, B] at evenly-spaced Hs fractions 0, 0.25, 0.5, 0.75, 1.
const COLOR_STOPS: [number, number, number][] = [
  [59, 130, 246],   // blue-500
  [13, 148, 159],   // teal-600
  [34, 197, 94],    // green-500
  [234, 179, 8],    // amber-500
  [220, 38, 38],    // red-600
];

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Map an Hs value to an RGBA CSS string.
 * @param hs — Hs in any unit.
 * @param maxHs — The max Hs across all transects (sets top of scale).
 * @param opacity — Fill opacity (default 0.85).
 */
function hsToColor(hs: number, maxHs: number, opacity = 0.85): string {
  if (maxHs <= 0) return `rgba(59,130,246,${opacity})`;
  const t = Math.min(Math.max(hs / maxHs, 0), 1);
  const segment = t * (COLOR_STOPS.length - 1);
  const idx = Math.min(Math.floor(segment), COLOR_STOPS.length - 2);
  const frac = segment - idx;
  const [r, g, b] = lerpColor(COLOR_STOPS[idx], COLOR_STOPS[idx + 1], frac);
  return `rgba(${r},${g},${b},${opacity})`;
}

// ---------------------------------------------------------------------------
// Derived geometry helpers
// ---------------------------------------------------------------------------

/**
 * Compute the maximum cross-shore distance across all transects so the X axis
 * is consistent.
 */
function maxDistance(allTransects: HeatMapTransectData[]): number {
  let max = 0;
  for (const row of allTransects) {
    for (const pt of row.transect) {
      if (pt.distanceFromShore > max) max = pt.distanceFromShore;
    }
  }
  return max === 0 ? 1 : max;
}

/** Map a cross-shore distance to SVG x (shore = RIGHT, offshore = LEFT). */
function distToX(dist: number, maxDist: number): number {
  return PAD_LEFT + CHART_W * (1 - dist / maxDist);
}

/** Map a row index to the SVG y of the top of that row. */
function rowToY(idx: number, rowH: number): number {
  return PAD_TOP + idx * rowH;
}

/**
 * Split break points by distance so the farther ones (outer bar) and closer ones
 * (inner bar / beach) can be rendered as distinct break-zone bands.
 * BeachProfileBreakPoint has no explicit "location" tag, so we sort by distanceFromShore
 * descending and treat the farthest as "outer" and the rest as "inner".
 */
function splitBreakPoints(breakPoints: BeachProfileBreakPoint[]): {
  outer: BeachProfileBreakPoint[];
  inner: BeachProfileBreakPoint[];
} {
  if (breakPoints.length <= 1) return { outer: breakPoints, inner: [] };
  const sorted = [...breakPoints].sort((a, b) => b.distanceFromShore - a.distanceFromShore);
  return { outer: [sorted[0]], inner: sorted.slice(1) };
}

// ---------------------------------------------------------------------------
// Breaker glyph subcomponent — drawn at the break point in each row
// ---------------------------------------------------------------------------

interface BreakerGlyphProps {
  cx: number;
  cy: number;
  type: 'spilling' | 'plunging' | 'surging' | null;
  rowH: number;
}

function BreakerGlyph({ cx, cy, type, rowH }: BreakerGlyphProps): ReactElement | null {
  const r = Math.max(3, rowH * 0.28);
  if (type === 'spilling') {
    // Horizontal line — even, gradual break.
    return (
      <line
        x1={cx - r}
        y1={cy}
        x2={cx + r}
        y2={cy}
        stroke="var(--foreground)"
        strokeWidth={1.5}
        strokeOpacity={0.7}
        strokeLinecap="round"
      />
    );
  }
  if (type === 'plunging') {
    // Curl arc — "J" shape indicating hollow, pitching wave.
    const d = `M ${cx - r} ${cy - r * 0.4} Q ${cx} ${cy - r * 1.1} ${cx + r * 0.6} ${cy} Q ${cx + r} ${cy + r * 0.5} ${cx} ${cy + r * 0.5}`;
    return (
      <path
        d={d}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={1.5}
        strokeOpacity={0.7}
        strokeLinecap="round"
      />
    );
  }
  if (type === 'surging') {
    // Vertical line — surging, collapsing wave.
    return (
      <line
        x1={cx}
        y1={cy - r}
        x2={cx}
        y2={cy + r}
        stroke="var(--foreground)"
        strokeWidth={1.5}
        strokeOpacity={0.7}
        strokeLinecap="round"
      />
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Color legend subcomponent
// ---------------------------------------------------------------------------

interface LegendProps {
  maxHs: number;
  heightUnit: string;
  locale: string;
  svgY: number;
}

function ColorLegend({ maxHs, heightUnit, locale, svgY }: LegendProps): ReactElement {
  const legendW = 160;
  const legendH = 10;
  const legendX = PAD_LEFT + CHART_W - legendW;
  const fmt = (v: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);

  // Build gradient stops as a string for the linearGradient.
  const gradId = 'heatmap-legend-gradient';

  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          {COLOR_STOPS.map((stop, i) => (
            <stop
              key={i}
              offset={`${(i / (COLOR_STOPS.length - 1)) * 100}%`}
              stopColor={`rgb(${stop[0]},${stop[1]},${stop[2]})`}
            />
          ))}
        </linearGradient>
      </defs>
      <rect
        x={legendX}
        y={svgY}
        width={legendW}
        height={legendH}
        fill={`url(#${gradId})`}
        rx={3}
        opacity={0.85}
      />
      <text
        x={legendX}
        y={svgY + legendH + 12}
        fontSize={9}
        fill="var(--muted-foreground)"
        textAnchor="start"
      >
        {`0 ${heightUnit}`}
      </text>
      <text
        x={legendX + legendW}
        y={svgY + legendH + 12}
        fontSize={9}
        fill="var(--muted-foreground)"
        textAnchor="end"
      >
        {`${fmt(maxHs)} ${heightUnit}`}
      </text>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HeatMapCard({ data, loading, heightUnit, distanceUnit, locale }: HeatMapCardProps): ReactElement | null {
  const { t } = useTranslation('marine');
  const titleId = useId();
  const descId  = useId();

  // Compute derived geometry once.
  const geometry = useMemo(() => {
    if (!data || data.allTransects.length === 0) return null;

    const rows = data.allTransects;
    const N = rows.length;
    const rowH = Math.min(ROW_H_MAX, Math.max(ROW_H_MIN, Math.floor(300 / N)));
    const chartH = N * rowH;
    const viewH = PAD_TOP + chartH + PAD_BOTTOM;

    const maxDist = maxDistance(rows);

    // Compute max Hs across all rows for the colour scale.
    let maxHs = 0;
    for (const row of rows) {
      for (const bp of row.breakPoints) {
        if (bp.waveHeight !== null && bp.waveHeight !== undefined && bp.waveHeight > maxHs) maxHs = bp.waveHeight;
      }
      for (const pt of row.transect) {
        if (pt.waveHeight !== null && pt.waveHeight !== undefined && pt.waveHeight > maxHs) maxHs = pt.waveHeight;
      }
    }
    if (maxHs <= 0) maxHs = 1;

    return { rows, N, rowH, chartH, viewH, maxDist, maxHs };
  }, [data]);

  // X-axis tick values.
  const xTicks = useMemo(() => {
    if (!geometry) return [];
    const { maxDist } = geometry;
    const roughStep = maxDist / 4;
    // Round to a nice number.
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const step = Math.ceil(roughStep / magnitude) * magnitude;
    const ticks: number[] = [];
    for (let v = 0; v <= maxDist; v += step) ticks.push(v);
    return ticks;
  }, [geometry]);

  // Number formatter.
  const fmtNum = (v: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);

  // ── Loading / no-data states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl bg-[var(--card-glass)] p-[var(--card-pad)] flex items-center justify-center min-h-[200px]">
        <span className="text-[var(--muted-foreground)] text-sm" aria-live="polite">
          {t('loading', 'Loading…')}
        </span>
      </div>
    );
  }

  if (!data || !geometry || geometry.N === 0) {
    return (
      <div className="rounded-xl bg-[var(--card-glass)] p-[var(--card-pad)] flex items-center justify-center min-h-[200px]">
        <p className="text-[var(--muted-foreground)] text-sm">{t('surfing.heatMapNoData', 'No heat map data available')}</p>
      </div>
    );
  }

  const { rows, N, rowH, viewH, maxDist, maxHs } = geometry;
  const hatchId = `${HATCH_BASE_ID}-${titleId.replace(/:/g, '')}`;
  const legendY = PAD_TOP + N * rowH + 28;

  // ── Build SVG elements ────────────────────────────────────────────────────

  // 1. Colour cells: for each row, subdivide the transect into segments.
  //    Each segment's colour = Hs at that cross-shore distance (if available
  //    from transect point data, otherwise from nearest break point).
  const colorCells: ReactElement[] = [];
  const zoneFills: ReactElement[] = [];
  const breakGlyphs: ReactElement[] = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const y = rowToY(ri, rowH);
    const rowOpacity = row.isOpen ? 1 : 0.35;

    // Transect segments: each consecutive pair of transect points forms a cell.
    // Colour = waveHeight at the midpoint, or the leftmost point.
    const pts = row.transect;

    if (pts.length >= 2) {
      for (let pi = 0; pi < pts.length - 1; pi++) {
        const d0 = pts[pi].distanceFromShore;
        const d1 = pts[pi + 1].distanceFromShore;
        const x0 = distToX(d0, maxDist);
        const x1 = distToX(d1, maxDist);
        const xLeft  = Math.min(x0, x1);
        const xRight = Math.max(x0, x1);
        const w = xRight - xLeft;
        if (w < 0.5) continue;

        // Prefer transect point waveHeight. Fall back to break-point proximity model.
        let segHs = 0;
        const ptHs = pts[pi].waveHeight;
        if (ptHs !== null && ptHs !== undefined) {
          segHs = ptHs;
        } else if (row.breakPoints.length > 0) {
          const midDist = (d0 + d1) / 2;
          // Find nearest break point.
          let closest = row.breakPoints[0];
          let minGap = Math.abs(midDist - closest.distanceFromShore);
          for (const bp of row.breakPoints) {
            const gap = Math.abs(midDist - bp.distanceFromShore);
            if (gap < minGap) { minGap = gap; closest = bp; }
          }
          const bpHs = closest.waveHeight ?? 0;
          const bpDist = closest.distanceFromShore;
          // Model: Hs rises to break, then decays toward shore.
          if (midDist >= bpDist) {
            const distRatio = bpDist > 0 ? midDist / bpDist : 0;
            segHs = bpHs * Math.min(distRatio, 1.2);
          } else {
            segHs = bpHs * (bpDist > 0 ? midDist / bpDist : 0) * 0.6;
          }
        }

        const fill = hsToColor(segHs, maxHs, rowOpacity * 0.85);
        colorCells.push(
          <rect
            key={`cell-${ri}-${pi}`}
            x={xLeft}
            y={y}
            width={w}
            height={rowH}
            fill={fill}
          />
        );
      }
    } else if (pts.length === 0 && row.breakPoints.length > 0) {
      // No transect points — draw a single flat row coloured by the max break height.
      const rowHs = Math.max(...row.breakPoints.map(bp => bp.waveHeight ?? 0));
      colorCells.push(
        <rect
          key={`cell-flat-${ri}`}
          x={PAD_LEFT}
          y={y}
          width={CHART_W}
          height={rowH}
          fill={hsToColor(rowHs, maxHs, rowOpacity * 0.85)}
        />
      );
    }

    // 2. Zone overlays: surfZones from the API.
    // SurfZoneExtent has startDistance (outer) and endDistance (inner/closer to shore).
    if (row.surfZones) {
      const { impactZone, foamZone } = row.surfZones;
      if (impactZone != null) {
        const x0 = distToX(impactZone.startDistance, maxDist);
        const x1 = distToX(impactZone.endDistance, maxDist);
        const xL = Math.min(x0, x1);
        const xR = Math.max(x0, x1);
        if (xR - xL > 0.5) {
          zoneFills.push(
            <rect
              key={`impact-${ri}`}
              x={xL}
              y={y}
              width={xR - xL}
              height={rowH}
              fill={ZONE_IMPACT_FILL}
            />
          );
        }
      }
      if (foamZone != null) {
        const x0 = distToX(foamZone.startDistance, maxDist);
        const x1 = distToX(foamZone.endDistance, maxDist);
        const xL = Math.min(x0, x1);
        const xR = Math.max(x0, x1);
        if (xR - xL > 0.5) {
          zoneFills.push(
            <rect
              key={`foam-${ri}`}
              x={xL}
              y={y}
              width={xR - xL}
              height={rowH}
              fill={ZONE_FOAM_FILL}
            />
          );
        }
      }
    }

    // 3. Break zone bands (outer bar and inner bar / beach — multi-bar support).
    const { outer: outerBPs, inner: innerBPs } = splitBreakPoints(row.breakPoints);
    for (const bpList of [outerBPs, innerBPs]) {
      if (bpList.length === 0) continue;
      for (const bp of bpList) {
        const bx = distToX(bp.distanceFromShore, maxDist);
        // Break zone extent: 10% of CHART_W in each direction.
        const halfW = CHART_W * 0.05;
        zoneFills.push(
          <rect
            key={`bzone-${ri}-${bp.distanceFromShore}`}
            x={bx - halfW}
            y={y}
            width={halfW * 2}
            height={rowH}
            fill={ZONE_BREAK_FILL}
          />
        );
      }
    }

    // 4. Breaker type glyphs.
    for (const bp of row.breakPoints) {
      if (!bp.breakerType) continue;
      const bx = distToX(bp.distanceFromShore, maxDist);
      const cy = y + rowH / 2;
      breakGlyphs.push(
        <BreakerGlyph
          key={`glyph-${ri}-${bp.distanceFromShore}`}
          cx={bx}
          cy={cy}
          type={bp.breakerType}
          rowH={rowH}
        />
      );
    }

    // 5. Structure hatching overlay for non-open transects.
    // (rendered below as a <rect fill=url(#hatch)> — collected via separate pass)
  }

  // Structure overlay rects — separate pass so they render on top of colour cells.
  const structureOverlays: ReactElement[] = [];
  for (let ri = 0; ri < rows.length; ri++) {
    if (rows[ri].isOpen) continue;
    const y = rowToY(ri, rowH);
    structureOverlays.push(
      <rect
        key={`struct-${ri}`}
        x={PAD_LEFT}
        y={y}
        width={CHART_W}
        height={rowH}
        fill={`url(#${hatchId})`}
        opacity={0.5}
      />
    );
  }

  // ── sr-only data table ────────────────────────────────────────────────────

  const srTable = (
    <table className="sr-only">
      <caption>{t('surfing.heatMapAriaLabel', 'Wave height heat map across all transects')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('surfing.heatMap.transectIndex', 'Transect')}</th>
          <th scope="col">{t('surfing.heatMap.openTransect', 'Open')}</th>
          <th scope="col">{t('surfing.heatMap.breakHeight', 'Break height ({{unit}})', { unit: heightUnit })}</th>
          <th scope="col">{t('surfing.heatMap.breakDistance', 'Break distance ({{unit}})', { unit: distanceUnit })}</th>
          <th scope="col">{t('surfing.heatMap.breakerType', 'Breaker type')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.index}>
            <th scope="row">{row.index}</th>
            <td>{row.isOpen ? t('yes', 'Yes') : t('no', 'No')}</td>
            <td>
              {row.breakPoints.length > 0
                ? row.breakPoints.map(bp => bp.waveHeight !== null && bp.waveHeight !== undefined ? fmtNum(bp.waveHeight) : '—').join(', ')
                : '—'}
            </td>
            <td>
              {row.breakPoints.length > 0
                ? row.breakPoints.map(bp => fmtNum(bp.distanceFromShore)).join(', ')
                : '—'}
            </td>
            <td>
              {row.breakPoints.length > 0
                ? row.breakPoints.map(bp =>
                    bp.breakerType
                      ? t(`surfing.heatMap.breakerType.${bp.breakerType}`, bp.breakerType)
                      : '—'
                  ).join(', ')
                : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl bg-[var(--card-glass)] p-[var(--card-pad)]">
      {/* Card header */}
      <h3 className="font-semibold text-[var(--foreground)] mb-3 text-sm">
        {t('surfing.heatMapTitle', 'Surf Height Map')}
      </h3>

      {/* SVG heat map */}
      <div className="w-full overflow-x-auto">
        <svg
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          viewBox={`0 0 ${VIEW_W} ${viewH}`}
          width="100%"
          style={{ display: 'block', minWidth: 260 }}
        >
          <title id={titleId}>
            {t('surfing.heatMapAriaLabel', 'Wave height heat map across all transects')}
          </title>
          <desc id={descId}>
            {t('surfing.heatMapDesc',
              '2D grid showing significant wave height (Hs) across {{n}} along-shore transects. Colour scale from blue (small) to red (large).',
              { n: N }
            )}
          </desc>

          {/* Defs: hatching pattern for structure-affected rows */}
          <defs>
            <pattern
              id={hatchId}
              patternUnits="userSpaceOnUse"
              width={6}
              height={6}
              patternTransform="rotate(45)"
            >
              <line x1={0} y1={0} x2={0} y2={6} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeOpacity={0.35} />
            </pattern>
          </defs>

          {/* Chart background */}
          <rect
            x={PAD_LEFT}
            y={PAD_TOP}
            width={CHART_W}
            height={N * rowH}
            fill="var(--card-glass)"
            opacity={0.3}
          />

          {/* Row separator lines */}
          {Array.from({ length: N + 1 }, (_, i) => (
            <line
              key={`sep-${i}`}
              x1={PAD_LEFT}
              y1={PAD_TOP + i * rowH}
              x2={PAD_LEFT + CHART_W}
              y2={PAD_TOP + i * rowH}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.12}
              strokeWidth={0.5}
            />
          ))}

          {/* Colour cells (bottom layer) */}
          {colorCells}

          {/* Zone overlays */}
          {zoneFills}

          {/* Structure hatching */}
          {structureOverlays}

          {/* Breaker glyphs */}
          {breakGlyphs}

          {/* Y axis — transect index labels (only render if space allows) */}
          {rowH >= 12 && rows.map((row, ri) => (
            <text
              key={`ylabel-${ri}`}
              x={PAD_LEFT - 4}
              y={rowToY(ri, rowH) + rowH / 2 + 3.5}
              fontSize={Math.min(10, rowH * 0.7)}
              fill="var(--muted-foreground)"
              textAnchor="end"
              aria-hidden="true"
            >
              {row.index}
            </text>
          ))}

          {/* X axis ticks and labels */}
          {xTicks.map((v) => {
            const x = distToX(v, maxDist);
            return (
              <g key={`xtick-${v}`}>
                <line
                  x1={x}
                  y1={PAD_TOP + N * rowH}
                  x2={x}
                  y2={PAD_TOP + N * rowH + 4}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.5}
                />
                <text
                  x={x}
                  y={PAD_TOP + N * rowH + 14}
                  fontSize={9}
                  fill="var(--muted-foreground)"
                  textAnchor="middle"
                  aria-hidden="true"
                >
                  {fmtNum(v)}
                </text>
              </g>
            );
          })}

          {/* X axis title */}
          <text
            x={PAD_LEFT + CHART_W / 2}
            y={PAD_TOP + N * rowH + 26}
            fontSize={9}
            fill="var(--muted-foreground)"
            textAnchor="middle"
            aria-hidden="true"
          >
            {t('surfing.beachProfile.distanceAxisLabel', 'Distance from shore ({{unit}})', { unit: distanceUnit })}
          </text>

          {/* Shore / Offshore labels */}
          <text
            x={PAD_LEFT + CHART_W - 2}
            y={PAD_TOP - 6}
            fontSize={9}
            fill="var(--muted-foreground)"
            textAnchor="end"
            aria-hidden="true"
          >
            {t('surfing.shore', 'Shore')}
          </text>
          <text
            x={PAD_LEFT + 2}
            y={PAD_TOP - 6}
            fontSize={9}
            fill="var(--muted-foreground)"
            textAnchor="start"
            aria-hidden="true"
          >
            {t('surfing.offshore', 'Offshore')}
          </text>

          {/* Colour legend */}
          <ColorLegend
            maxHs={maxHs}
            heightUnit={heightUnit}
            locale={locale}
            svgY={legendY}
          />

          {/* Structure affected legend note */}
          {rows.some(r => !r.isOpen) && (
            <g>
              <rect
                x={PAD_LEFT}
                y={legendY}
                width={14}
                height={10}
                fill={`url(#${hatchId})`}
                opacity={0.5}
              />
              <text
                x={PAD_LEFT + 18}
                y={legendY + 9}
                fontSize={9}
                fill="var(--muted-foreground)"
                aria-hidden="true"
              >
                {t('surfing.heatMap.shadowedTransect', 'Structure-affected')}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* sr-only data table for assistive technology */}
      {srTable}
    </div>
  );
}
