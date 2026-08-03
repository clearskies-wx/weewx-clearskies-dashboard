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
import { Warning } from '@phosphor-icons/react';
import type { HeatMapProfileData, HeatMapTransectData, HeatMapBreakPoint, HeatMapEnvelopePoint } from '../../../api/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HeatMapCardProps {
  data: HeatMapProfileData | null;
  loading: boolean;
  /**
   * Fetch error (404 config error, network failure, etc.) — SURF-PUBLISH-
   * RESULTS-ONLY §3.6, 2026-07-25. Distinct from `data.modelStatus ===
   * "unavailable"` (the model ran the request successfully but produced no
   * answer for this hour): an error means the request itself failed and
   * must render visibly differently (role="alert", destructive styling)
   * from the honest "model has no result" state.
   */
  error?: Error | null;
  /** Retry callback shown alongside the error state. */
  onRetry?: () => void;
  /** Height unit label (e.g. "ft" or "m"). */
  heightUnit: string;
  /** Distance unit label (e.g. "ft" or "m"). */
  distanceUnit: string;
  locale: string;
  /**
   * BD-7 main-break-zone inclusive transect-index bounds (D5.2, 2026-08-02).
   * Sourced from the CURRENT primary `SurfForecast` entry (the `/surf`
   * endpoint) — NOT present on this card's own `data` prop (the
   * `/profile?transect_index=all` response has no BD-7/9 fields). Both
   * must be non-null to render the band; absent/null on pre-Round-2 cached
   * forecasts — no overlay renders then, chart is byte-identical to before
   * this round.
   */
  mainBreakZoneStartIndex?: number | null;
  /** See {@link mainBreakZoneStartIndex}. */
  mainBreakZoneEndIndex?: number | null;
  /**
   * BD-9 representative-transect index (D5.2, 2026-08-02) — same sourcing
   * note as {@link mainBreakZoneStartIndex}. NOT rendered (operator ruling
   * 2026-08-02: the representative-transect marker is developer/operator
   * context, meaningless to an end user — removed from the default render).
   * Kept in the prop interface for caller compatibility; the component
   * accepts and ignores this value.
   */
  representativeTransectIndex?: number | null;
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
// BD-7 main-break-zone gutter band colour (D5.2, 2026-08-02, lead-approved
// 2026-08-02) — purple-500, distinct from the red/amber/blue zone fills
// above so it reads as a different kind of annotation (a transect-index
// RANGE marker in the Y-axis gutter, not a cross-shore zone fill).
const MAIN_BREAK_ZONE_FILL = 'rgba(168, 85, 247, 0.75)';

// Extra bottom padding when the BD-7 overlay legend row is shown (D5.2).
// Only applied when the zone overlay is present, so a pre-Round-2 payload
// (no mainBreakZoneStartIndex/EndIndex) renders byte-identical to before
// this round. (Originally also gated by the BD-9 representative-transect
// overlay; that overlay is no longer rendered — operator ruling 2026-08-02.)
const PAD_BOTTOM_WITH_OVERLAY_LEGEND = PAD_BOTTOM + 22;

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
 * Compute the maximum cross-shore distance across all transects. Used both
 * as the historical "no tier" full-extent scan and as the tier-selection
 * fallback (selectHeatMapTier below) when no break points are present.
 */
function maxDistance(allTransects: HeatMapTransectData[]): number {
  let max = 0;
  for (const row of allTransects) {
    for (const pt of row.transect) {
      if (pt.distance > max) max = pt.distance;
    }
  }
  return max === 0 ? 1 : max;
}

// ---------------------------------------------------------------------------
// 3-tier X-axis scale — parity with BeachProfileChart.tsx (2026-08-02).
// Same thresholds/tick steps (100 / 300 / 1000 m, scaled by distanceUnit),
// same Math.abs(distance) break-magnitude selection criterion. Duplicated
// locally rather than shared/exported — lead ruling 2026-08-02: fine for
// now, a shared util is a separate task, not over-engineering this one.
// ---------------------------------------------------------------------------

interface ScaleTier { maxDistance: number; tickStep: number; }

/**
 * Mirrors BeachProfileChart's selectTier(), generalized to ALL rows: the
 * outermost break across every transect (not just one) drives tier choice,
 * so every row's break points land inside the chosen tier by construction
 * (each row's max abs-distance break is <= the cross-row max used here).
 * Math.abs() fix (2026-08-02): breakpoint distances can be negative
 * (TA-C19/ADR-093 Amendment 4) — Math.max on signed values previously would
 * have picked the least-negative break and always missed the `> 0` gates,
 * same bug BeachProfileChart had.
 */
function selectHeatMapTier(
  allBreakPoints: HeatMapBreakPoint[],
  allTransects: HeatMapTransectData[],
  tierShort: ScaleTier,
  tierStandard: ScaleTier,
  tierExtended: ScaleTier,
): ScaleTier {
  const outerBreakDist = allBreakPoints.length > 0
    ? Math.max(...allBreakPoints.map((bp) => Math.abs(bp.distance)))
    : 0;
  if (outerBreakDist > 0 && outerBreakDist <= tierShort.maxDistance)    return tierShort;
  if (outerBreakDist > 0 && outerBreakDist <= tierStandard.maxDistance) return tierStandard;
  if (outerBreakDist > tierStandard.maxDistance)                         return tierExtended;
  const maxDist = maxDistance(allTransects);
  if (maxDist <= tierShort.maxDistance)    return tierShort;
  if (maxDist <= tierStandard.maxDistance) return tierStandard;
  return tierExtended;
}

/**
 * TA-C19 (ADR-093 Amendment 4, confirmed live 2026-08-02, D4.2): `distance`
 * can be negative (a point landward of the reference waterline, since the
 * HAT extension). Without this, `distToX()`'s implicit min=0 pushed any
 * negative-distance point past the chart's right edge (off-canvas) — never
 * clamp/abs() a negative distance away (API-MANUAL). Defaults to 0 when no
 * point is negative, so the existing all-non-negative case is unaffected.
 * Since the 2026-08-02 tier-clipping fix, this scans the tier-CLIPPED
 * per-row transects (`displayTransects`), not the raw full transects —
 * consistent with BeachProfileChart's `xMin` (computed from its own
 * `displayTransect`, not the raw `transect` prop).
 */
function minDistanceClipped(displayTransects: HeatMapEnvelopePoint[][]): number {
  let min = 0;
  for (const dt of displayTransects) {
    for (const pt of dt) {
      if (pt.distance < min) min = pt.distance;
    }
  }
  return min;
}

/** Map a cross-shore distance to SVG x (shore = RIGHT, offshore = LEFT). */
function distToX(dist: number, minDist: number, maxDist: number): number {
  if (maxDist === minDist) return PAD_LEFT + CHART_W / 2;
  return PAD_LEFT + CHART_W * (1 - (dist - minDist) / (maxDist - minDist));
}

/** Map a row index to the SVG y of the top of that row. */
function rowToY(idx: number, rowH: number): number {
  return PAD_TOP + idx * rowH;
}

/**
 * Split break points by distance so the farther ones (outer bar) and closer ones
 * (inner bar / beach) can be rendered as distinct break-zone bands.
 * HeatMapBreakPoint has no explicit "location" tag, so we sort by distance
 * descending and treat the farthest as "outer" and the rest as "inner".
 */
function splitBreakPoints(breakPoints: HeatMapBreakPoint[]): {
  outer: HeatMapBreakPoint[];
  inner: HeatMapBreakPoint[];
} {
  if (breakPoints.length <= 1) return { outer: breakPoints, inner: [] };
  const sorted = [...breakPoints].sort((a, b) => b.distance - a.distance);
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

export function HeatMapCard({
  data, loading, error, onRetry, heightUnit, distanceUnit, locale,
  mainBreakZoneStartIndex = null, mainBreakZoneEndIndex = null,
}: HeatMapCardProps): ReactElement | null {
  const { t } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const titleId = useId();
  const descId  = useId();

  // Compute derived geometry once.
  // SURF-PUBLISH-RESULTS-ONLY §3.6 (2026-07-25): `data.profiles` is null,
  // not an empty array, when `modelStatus === "unavailable"` — guard on
  // `!data.profiles` (not `.length`) so a null payload never throws here.
  // BD-7 overlay applicability (D5.2) — computed outside the memo so both
  // the memo and the render body can use it; cheap (two comparisons).
  // BD-9 representative-transect marker removed from the render (operator
  // ruling 2026-08-02) — `showOverlayLegend` no longer factors it in.
  const hasZoneOverlay = mainBreakZoneStartIndex != null && mainBreakZoneEndIndex != null;
  const showOverlayLegend = hasZoneOverlay;

  const geometry = useMemo(() => {
    if (!data || !data.profiles || data.profiles.length === 0) return null;

    const rows = data.profiles;
    const N = rows.length;
    const rowH = Math.min(ROW_H_MAX, Math.max(ROW_H_MIN, Math.floor(300 / N)));
    const chartH = N * rowH;
    const bottomPad = showOverlayLegend ? PAD_BOTTOM_WITH_OVERLAY_LEGEND : PAD_BOTTOM;
    const viewH = PAD_TOP + chartH + bottomPad;

    // Tier-clipped X axis (2026-08-02, parity with BeachProfileChart's
    // 3-tier scale — see selectHeatMapTier above).
    const METER_TO_UNIT = distanceUnit === 'ft' ? 3.28084 : 1;
    const tierShort    = { maxDistance: Math.round(100  * METER_TO_UNIT), tickStep: Math.round(25  * METER_TO_UNIT) };
    const tierStandard = { maxDistance: Math.round(300  * METER_TO_UNIT), tickStep: Math.round(50  * METER_TO_UNIT) };
    const tierExtended = { maxDistance: Math.round(1000 * METER_TO_UNIT), tickStep: Math.round(200 * METER_TO_UNIT) };
    const allBreakPoints = rows.flatMap((row) => row.breakPoints);
    const tier = selectHeatMapTier(allBreakPoints, rows, tierShort, tierStandard, tierExtended);

    const maxDist = tier.maxDistance;
    // Per-row clipped transect — mirrors BeachProfileChart's `clipped`/
    // `displayTransect` fallback: keep the full row when clipping would
    // leave fewer than 2 points to draw a segment from.
    const displayTransects: HeatMapEnvelopePoint[][] = rows.map((row) => {
      const clipped = row.transect.filter((p) => p.distance <= maxDist);
      return clipped.length >= 2 ? clipped : row.transect;
    });
    const minDist = minDistanceClipped(displayTransects);

    // Compute max Hs across all rows for the colour scale.
    let maxHs = 0;
    for (const row of rows) {
      for (const bp of row.breakPoints) {
        if (bp.hs !== null && bp.hs !== undefined && bp.hs > maxHs) maxHs = bp.hs;
      }
      for (const pt of row.transect) {
        if (pt.hs !== null && pt.hs !== undefined && pt.hs > maxHs) maxHs = pt.hs;
      }
    }
    if (maxHs <= 0) maxHs = 1;

    return { rows, N, rowH, chartH, viewH, maxDist, minDist, maxHs, tier, displayTransects };
  }, [data, showOverlayLegend, distanceUnit]);

  // X-axis tick values — tier's own tickStep (2026-08-02, parity with
  // BeachProfileChart's computeDistanceTicks: 0..tier.maxDistance stepping
  // by tier.tickStep), replacing the old "round to a nice number" scheme
  // that was independent of tier selection.
  const xTicks = useMemo(() => {
    if (!geometry) return [];
    const { tier } = geometry;
    const ticks: number[] = [];
    for (let v = 0; v <= tier.maxDistance; v += tier.tickStep) ticks.push(v);
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

  // SURF-PUBLISH-RESULTS-ONLY §3.6 (2026-07-25): check order matters — the
  // fetch error FIRST (a response never arrived; reading `data.modelStatus`
  // off it would be wrong), THEN `modelStatus`, THEN the geometry/no-data
  // path. A 404 (config error) and a 200-with-null (genuine model gap) must
  // look visibly different — not both collapse into one "no data" message.
  if (error) {
    return (
      <div className="rounded-xl bg-[var(--card-glass)] p-[var(--card-pad)] flex items-center justify-center min-h-[200px]">
        <div role="alert" className="flex items-start gap-2">
          <Warning size={20} aria-hidden="true" className="text-destructive shrink-0 mt-0.5" />
          <div className="flex flex-col gap-2 items-start">
            <p className="text-destructive text-sm">{t('surfing.heatMap.loadError')}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded text-sm"
              >
                {tCommon('retry')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (data?.modelStatus === 'unavailable') {
    return (
      <div className="rounded-xl bg-[var(--card-glass)] p-[var(--card-pad)] flex items-center justify-center min-h-[200px]">
        <p className="text-[var(--muted-foreground)] text-sm" aria-live="polite">{t('surfing.heatMap.modelUnavailable')}</p>
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

  const { rows, N, rowH, viewH, maxDist, minDist, maxHs, displayTransects } = geometry;

  // Value-vs-position fix (D5 audit remediation, MAJOR finding): `rows` is
  // an ARRAY indexed by POSITION, but `mainBreakZoneStartIndex`/`EndIndex`
  // are `SurfForecast` TRANSECT-INDEX VALUES from a DIFFERENT endpoint. The
  // two only coincide when `rows[i].transectIndex === i` for every row —
  // true only when the marine service published every transect with no
  // gaps. Marine filters FAILED transects out of `per_transect` entirely
  // (surf_1d_pipeline.py:1683) — a real, observed behavior, not a
  // hypothetical — so a gap shifts every position after it. Positioning the
  // SVG overlay by VALUE (the old `rowToY(mainBreakZoneStartIndex!, rowH)`
  // etc.) would mark the wrong rows the moment a gap exists, while the
  // sr-only table (which already compared `row.transectIndex` VALUES per
  // row) stayed correct — a sighted/screen-reader divergence in exactly the
  // failure mode the a11y pairing exists to prevent. Fixed by construction:
  // derive POSITIONS from values the same way the table does, so the SVG
  // and the table agree on any data, gaps or not. (Originally covered both
  // BD-7 zone and BD-9 representative-transect overlays; BD-9 removed from
  // the render entirely, operator ruling 2026-08-02 — this note now
  // describes BD-7 only.)
  const zoneMemberPositions: number[] = hasZoneOverlay
    ? rows.reduce<number[]>((acc, r, i) => {
        if (r.transectIndex >= mainBreakZoneStartIndex! && r.transectIndex <= mainBreakZoneEndIndex!) acc.push(i);
        return acc;
      }, [])
    : [];
  const zoneBandValid = zoneMemberPositions.length > 0;
  // Band spans the array-position range covering every member row found —
  // NOT the raw index values, and not assumed contiguous (BD-7's own
  // scattered-failure-fallback caveat, PROVIDER-MANUAL §14.15).
  const zoneBandStartPos = zoneBandValid ? Math.min(...zoneMemberPositions) : -1;
  const zoneBandEndPos = zoneBandValid ? Math.max(...zoneMemberPositions) : -1;
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
    const rowOpacity = row.isStructureAffected ? 0.35 : 1;

    // Transect segments: each consecutive pair of envelope points forms a cell.
    // Colour = hs at the midpoint, or the leftmost point. Tier-clipped
    // (2026-08-02, parity with BeachProfileChart) — displayTransects[ri],
    // not the raw row.transect, so cells don't paint past the tier's
    // (possibly much smaller) x-axis bound.
    const pts = displayTransects[ri];

    if (pts.length >= 2) {
      for (let pi = 0; pi < pts.length - 1; pi++) {
        const d0 = pts[pi].distance;
        const d1 = pts[pi + 1].distance;
        const x0 = distToX(d0, minDist, maxDist);
        const x1 = distToX(d1, minDist, maxDist);
        const xLeft  = Math.min(x0, x1);
        const xRight = Math.max(x0, x1);
        const w = xRight - xLeft;
        if (w < 0.5) continue;

        // Prefer envelope point hs. Fall back to break-point proximity model.
        let segHs = 0;
        const ptHs = pts[pi].hs;
        if (ptHs !== null && ptHs !== undefined) {
          segHs = ptHs;
        } else if (row.breakPoints.length > 0) {
          const midDist = (d0 + d1) / 2;
          // Find nearest break point.
          let closest = row.breakPoints[0];
          let minGap = Math.abs(midDist - closest.distance);
          for (const bp of row.breakPoints) {
            const gap = Math.abs(midDist - bp.distance);
            if (gap < minGap) { minGap = gap; closest = bp; }
          }
          const bpHs = closest.hs ?? 0;
          const bpDist = closest.distance;
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
      // No envelope points — draw a single flat row coloured by the max break height.
      const rowHs = Math.max(...row.breakPoints.map(bp => bp.hs ?? 0));
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
        const x0 = distToX(impactZone.startDistance, minDist, maxDist);
        const x1 = distToX(impactZone.endDistance, minDist, maxDist);
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
        const x0 = distToX(foamZone.startDistance, minDist, maxDist);
        const x1 = distToX(foamZone.endDistance, minDist, maxDist);
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
        const bx = distToX(bp.distance, minDist, maxDist);
        // Break zone extent: 10% of CHART_W in each direction.
        const halfW = CHART_W * 0.05;
        zoneFills.push(
          <rect
            key={`bzone-${ri}-${bp.distance}`}
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
      const bx = distToX(bp.distance, minDist, maxDist);
      const cy = y + rowH / 2;
      breakGlyphs.push(
        <BreakerGlyph
          key={`glyph-${ri}-${bp.distance}`}
          cx={bx}
          cy={cy}
          type={bp.breakerType}
          rowH={rowH}
        />
      );
    }

    // 5. Structure hatching overlay for structure-affected transects.
    // (rendered below as a <rect fill=url(#hatch)> — collected via separate pass)
  }

  // Structure overlay rects — separate pass so they render on top of colour cells.
  const structureOverlays: ReactElement[] = [];
  for (let ri = 0; ri < rows.length; ri++) {
    if (!rows[ri].isStructureAffected) continue;
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
          {/* BD-7 column — same non-color-only equivalent as the gutter band (D5.2). Only present when the zone data is present AND valid for this response (avoids a misleading all-"No" column, and keeps this column in agreement with whether the band itself actually rendered). */}
          {zoneBandValid && (
            <th scope="col">{t('surfing.heatMap.mainBreakZoneLegend', 'Main break zone')}</th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isInZone = zoneBandValid && row.transectIndex >= mainBreakZoneStartIndex! && row.transectIndex <= mainBreakZoneEndIndex!;
          return (
            <tr key={row.transectIndex}>
              <th scope="row">
                {row.transectIndex}
              </th>
              <td>{!row.isStructureAffected ? t('yes', 'Yes') : t('no', 'No')}</td>
              <td>
                {row.breakPoints.length > 0
                  ? row.breakPoints.map(bp => bp.hs !== null && bp.hs !== undefined ? fmtNum(bp.hs) : '—').join(', ')
                  : '—'}
              </td>
              <td>
                {row.breakPoints.length > 0
                  ? row.breakPoints.map(bp => fmtNum(bp.distance)).join(', ')
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
              {zoneBandValid && (
                <td>{isInZone ? t('yes', 'Yes') : t('no', 'No')}</td>
              )}
            </tr>
          );
        })}
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
            {zoneBandValid && ` ${t('surfing.heatMap.mainBreakZoneDesc',
              'Main break zone spans transects {{start}} to {{end}}.',
              { start: mainBreakZoneStartIndex, end: mainBreakZoneEndIndex })}`}
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

          {/* ── BD-7 main-break-zone gutter band (D5.2, D5-audit remediation) ──
           *  Y-axis gutter is otherwise empty except the row-index labels
           *  (drawn below, right-aligned at x=PAD_LEFT-4 — text extends
           *  leftward from there but stays clear of x<24 for up to 3-digit
           *  indices at this font size). Placed at x=6..12, well clear.
           *  Positioned by zoneBandStartPos/EndPos (ARRAY POSITIONS derived
           *  from matching row.transectIndex VALUES, not the raw index
           *  values themselves — see the comment above where they're
           *  computed). Membership-based: no band when no row matches. */}
          {zoneBandValid && (
            <rect
              x={6}
              y={rowToY(zoneBandStartPos, rowH)}
              width={6}
              height={rowToY(zoneBandEndPos + 1, rowH) - rowToY(zoneBandStartPos, rowH)}
              rx={2}
              fill={MAIN_BREAK_ZONE_FILL}
              aria-hidden="true"
            />
          )}

          {/* BD-9 representative-transect marker (triangle + bolded row
           *  label) removed from the render — operator ruling 2026-08-02:
           *  developer/operator context, meaningless to an end user. */}

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
              {row.transectIndex}
            </text>
          ))}

          {/* X axis ticks and labels */}
          {xTicks.map((v) => {
            const x = distToX(v, minDist, maxDist);
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
          {rows.some(r => r.isStructureAffected) && (
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

          {/* ── BD-7 overlay legend row (D5.2) — new row below the existing
           *  legend line; only reserves the extra vertical space
           *  (PAD_BOTTOM_WITH_OVERLAY_LEGEND, see geometry above) when the
           *  zone overlay is actually shown. BD-9 representative-transect
           *  legend entry removed (operator ruling 2026-08-02). ── */}
          {zoneBandValid && (
            <g>
              <rect
                x={PAD_LEFT}
                y={legendY + 20}
                width={14}
                height={10}
                rx={2}
                fill={MAIN_BREAK_ZONE_FILL}
              />
              <text
                x={PAD_LEFT + 18}
                y={legendY + 29}
                fontSize={9}
                fill="var(--muted-foreground)"
                aria-hidden="true"
              >
                {t('surfing.heatMap.mainBreakZoneLegend', 'Main break zone')}
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
