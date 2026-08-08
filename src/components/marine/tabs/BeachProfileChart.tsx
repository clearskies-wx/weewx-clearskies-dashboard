// BeachProfileChart.tsx — Complete cross-shore beach profile visualization.
//
// D5.1 (ROUND-D5-BEACH-PROFILE-CARD-BRIEF-2026-08-05) — rebuild to the
// operator-approved mockup (docs/planning/mockups/beach-profile-redesign-
// mockup.html, D5 iteration 3). The mockup's LOOK is the binding design
// authority; its implementation technique (vanilla JS + SVG) is not — this
// is a faithful React/SVG port of the same rendering decisions:
//   - Sand fill: the raw signed `beachElevation` profile landward of the
//     waterline, blended with the depth-derived seabed seaward of it (one
//     continuous "bed" curve, exactly like the mockup's `bedAt()`).
//   - Water column: deep -> mid gradient fill under a hand-drawn wave
//     surface (shoaling + breaking decay, secondary bumps at each
//     non-primary break) synthesized from Hs/period, same technique as the
//     mockup's `surf` array.
//   - Whitewater: translucent band under the crest, shoreward of the
//     outermost break.
//   - D6: per-break impact/foam bands (`perBreakZones`) render by default
//     when present; falls back to the aggregate `surfZones` bands
//     otherwise. D5.2: any band with width <= a float tolerance is skipped
//     entirely (API-MANUAL "audit F3" consumer note, operator ruling
//     2026-08-05).
//   - Waterline placement from `waterlineDistance`; still-water/tide datum
//     line; legend; caption chips (partition/face/tide/waterline).
//
// Previous version: T5.3 (SURF-1D-IMPLEMENTATION-PLAN Phase 5).
// Data source: GET /api/v1/surf/{locationId}/profile (ADR-097 / T5.2).
//
// Survived the rebuild (brief D5.1 "must survive" list): transect
// selector, unit handling (ft/m), loading/error states (handled by the
// caller, BeachProfileCardBody.tsx), accessibility (SVG title + sr-only
// data table).
//
// Dropped from the rebuild (not present in the approved mockup, per "the
// mockup's LOOK is binding" and "mockups show exactly what was asked —
// nothing more", rules/coding.md §3): the wave-shapes cross-section toggle
// and the jacking-factor annotations. The underlying `waveShapes`/
// `jackingFactors` API fields are untouched — only this display component
// no longer renders them.
//
// X-axis: shore on RIGHT, offshore on LEFT (surfer's perspective).
// Y-axis: real elevation relative to the vertical datum (LMSL), matching
//   the mockup — NOT depth-below-surface (the pre-D5 chart's convention).
//
// A11y (rules/coding.md §5):
//   - SVG: role="img" + aria-labelledby → embedded <title>
//   - Transect selector: <label> + <select> — keyboard-reachable
//   - sr-only <table> carries all numeric transect data and zone info
//   - No color-only signals: zones/legend items pair color with text
//     labels; the legend is the non-color-only equivalent for every fill

import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';
import type {
  BeachProfileTransectPoint,
  BeachProfileBreakPoint,
  BeachProfileSurfZones,
  BeachProfileTransectInfo,
  BeachProfilePerBreakZone,
  BeachProfileElevationPoint,
  SurfZoneExtent,
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
  /** Current tidal elevation in display units relative to the vertical datum. Positive = above datum. */
  tideLevel?: number | null;
  /** Vertical datum for the elevation axis label (e.g. "LMSL", "NAVD88"). Null = omit datum from label. */
  datum?: string | null;
  /** Aggregate surf zone extents from the 1D model. Fallback when `perBreakZones` is absent/empty. */
  surfZones?: BeachProfileSurfZones | null;
  /**
   * D6 (2026-08-05) — one impact/foam zone pair PER published break,
   * outermost-first. When present and non-empty, this is the ONLY zone
   * rendering mode (no user toggle — lead call, D6: "the toggle in the
   * mockup was a review affordance, not shipping UI"). Falls back to
   * `surfZones` when absent/empty.
   */
  perBreakZones?: BeachProfilePerBreakZone[] | null;
  /**
   * Tide-aware waterline cross-shore distance (Round P). Null falls back to
   * the dynamic tide/depth intersection this chart already computes, so
   * pre-Round-P cached responses render exactly as before.
   */
  waterlineDistance?: number | null;
  /**
   * Raw signed beach-elevation profile (Round P) — draws the real dry sand
   * landward of the waterline. Null/empty falls back to the depth-derived
   * seabed for the whole domain (pre-Round-P behavior).
   */
  beachElevation?: BeachProfileElevationPoint[] | null;
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
const PAD_TOP    = 32;   // room for break-crest labels above the drawn wave
const PAD_BOTTOM = 72;   // room for x-axis labels + zone band strip
const PAD_LEFT   = 72;   // room for y-axis elevation labels + rotated axis title
const PAD_RIGHT  = 12;

const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP  - PAD_BOTTOM;

// D5.2 — float-tolerance for "zero width" band skip (display units). Chosen
// well above ordinary float noise from unit conversion, well below any
// visually meaningful band width.
const ZONE_WIDTH_EPSILON = 0.01;

// Dense-sampling resolution for the bed (sand+seafloor) curve and the wave
// surface curve — matches the mockup's "draw a real line from many samples"
// technique (mockup step=2 for the bed, step=1.25 for the surface, both in
// feet over a ~470ft domain => ~200-375 samples). Fixed sample COUNT here
// instead of a fixed physical step so a very large (Extended-tier) domain
// doesn't blow up the point count.
const BED_SAMPLE_COUNT = 160;
const SURFACE_SAMPLE_COUNT = 160;

// ---------------------------------------------------------------------------
// 3-tier X-axis scale — UNCHANGED from the pre-D5 chart (tier-selection bug
// fix 2026-08-02, Math.abs() on signed break distances). The mockup does
// not dictate tick spacing; this logic is orthogonal to the visual rebuild.
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
    ? Math.max(...breakPoints.map((bp) => Math.abs(bp.distance)))
    : 0;
  if (outerBreakDist > 0 && outerBreakDist <= tierShort.maxDistance)    return tierShort;
  if (outerBreakDist > 0 && outerBreakDist <= tierStandard.maxDistance) return tierStandard;
  if (outerBreakDist > tierStandard.maxDistance)                         return tierExtended;
  const maxDist = Math.max(...transect.map((p) => p.distance), 0);
  if (maxDist <= tierShort.maxDistance)    return tierShort;
  if (maxDist <= tierStandard.maxDistance) return tierStandard;
  return tierExtended;
}

function computeDistanceTicks(tier: ScaleTier, xMin: number): number[] {
  const ticks: number[] = [];
  const negFirst = Math.ceil(xMin / tier.tickStep) * tier.tickStep;
  for (let d = negFirst; d <= tier.maxDistance; d += tier.tickStep) ticks.push(d);
  // The dry-beach strip is narrower than one tick step — label its landward
  // edge so the axis doesn't just stop at 0 (operator, 2026-08-05: the axis
  // must show negative numbers over the sand).
  if (ticks[0] >= 0 && xMin < 0) ticks.unshift(Math.ceil(xMin / 5) * 5);
  return ticks;
}

/** Elevation axis ticks — step chosen from the real dynamic range (mirrors the old depth-tick step selection, now signed). */
function computeElevationTicks(top: number, bottom: number): number[] {
  const range = top - bottom;
  const step = range <= 8 ? 1 : range <= 20 ? 2 : 5;
  const topTick = Math.ceil(top / step) * step;
  const bottomTick = Math.floor(bottom / step) * step;
  const ticks: number[] = [];
  for (let e = topTick; e >= bottomTick; e -= step) ticks.push(e);
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

/** Real elevation (LMSL-relative) → SVG y. Larger elevation = smaller y (up). */
function yScale(elevation: number, top: number, bottom: number): number {
  return PAD_TOP + ((top - elevation) / (top - bottom)) * CHART_H;
}

// ---------------------------------------------------------------------------
// Interpolation helpers — clamp-to-edge (never extrapolate), matching the
// mockup's interpArr().
// ---------------------------------------------------------------------------

function interpTransectValue(
  sortedDesc: BeachProfileTransectPoint[],
  distance: number,
  key: 'depth' | 'hs',
): number {
  if (sortedDesc.length === 0) return 0;
  const value = (p: BeachProfileTransectPoint) => (key === 'depth' ? p.depth : (p.hs ?? 0));
  const first = sortedDesc[0];
  const last = sortedDesc[sortedDesc.length - 1];
  if (distance >= first.distance) return value(first);
  if (distance <= last.distance) return value(last);
  for (let i = 1; i < sortedDesc.length; i++) {
    if (distance >= sortedDesc[i].distance) {
      const x0 = sortedDesc[i].distance;
      const x1 = sortedDesc[i - 1].distance;
      const t = x1 === x0 ? 0 : (distance - x0) / (x1 - x0);
      return value(sortedDesc[i]) * (1 - t) + value(sortedDesc[i - 1]) * t;
    }
  }
  return value(last);
}

function interpElevation(sortedAsc: BeachProfileElevationPoint[], distance: number): number {
  if (sortedAsc.length === 0) return 0;
  const first = sortedAsc[0];
  const last = sortedAsc[sortedAsc.length - 1];
  if (distance <= first.distance) return first.elevation;
  if (distance >= last.distance) return last.elevation;
  for (let i = 1; i < sortedAsc.length; i++) {
    if (distance <= sortedAsc[i].distance) {
      const x0 = sortedAsc[i - 1].distance;
      const x1 = sortedAsc[i].distance;
      const t = x1 === x0 ? 0 : (distance - x0) / (x1 - x0);
      return sortedAsc[i - 1].elevation * (1 - t) + sortedAsc[i].elevation * t;
    }
  }
  return last.elevation;
}

// ---------------------------------------------------------------------------
// Path builder
// ---------------------------------------------------------------------------

function pathFromPoints(points: Array<[number, number]>): string {
  return points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
}

// ---------------------------------------------------------------------------
// D5.2 — zero-width band skip
// ---------------------------------------------------------------------------

function zoneWidth(zone: SurfZoneExtent | null | undefined): number {
  if (!zone) return 0;
  return Math.abs(zone.startDistance - zone.endDistance);
}

interface RenderBand {
  start: number;
  end: number;
  kind: 'impact' | 'foam';
  key: string;
}

/** D6 — one band per break's own impact extent, skipping zero-width bands
 * (D5.2). Foam zones removed entirely (operator, 2026-08-05: "not helping"). */
function bandsFromPerBreakZones(perBreakZones: BeachProfilePerBreakZone[]): RenderBand[] {
  const bands: RenderBand[] = [];
  perBreakZones.forEach((pbz, i) => {
    if (zoneWidth(pbz.impactZone) > ZONE_WIDTH_EPSILON) {
      bands.push({ start: pbz.impactZone.startDistance, end: pbz.impactZone.endDistance, kind: 'impact', key: `impact-${i}` });
    }
  });
  return bands;
}

/** Fallback — the aggregate surfZones bands, same zero-width skip. */
function bandsFromAggregateZones(zones: BeachProfileSurfZones | null | undefined): RenderBand[] {
  const bands: RenderBand[] = [];
  if (zoneWidth(zones?.impactZone) > ZONE_WIDTH_EPSILON) {
    bands.push({ start: zones!.impactZone!.startDistance, end: zones!.impactZone!.endDistance, kind: 'impact', key: 'impact-agg' });
  }
  return bands;
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
  perBreakZones = null,
  waterlineDistance = null,
  beachElevation = null,
  transects = null,
  selectedTransect,
  onTransectChange,
}: BeachProfileChartProps) {
  const { t } = useTranslation('marine');

  if (transect.length === 0) return null;

  // ── Distance unit scaling ───────────────────────────────────────────────
  const METER_TO_UNIT = distanceUnit === 'ft' ? 3.28084 : 1;
  const tierShort    = { maxDistance: Math.round(100  * METER_TO_UNIT), tickStep: Math.round(25  * METER_TO_UNIT) };
  const tierStandard = { maxDistance: Math.round(300  * METER_TO_UNIT), tickStep: Math.round(50  * METER_TO_UNIT) };
  const tierExtended = { maxDistance: Math.round(1000 * METER_TO_UNIT), tickStep: Math.round(200 * METER_TO_UNIT) };

  const tier = selectTier(breakPoints, transect, tierShort, tierStandard, tierExtended);
  const clipped = transect.filter((p) => p.distance <= tier.maxDistance);
  const displayTransect = clipped.length >= 2 ? clipped : transect;

  const xMax = tier.maxDistance;

  const tide = tideLevel ?? 0;

  // Dynamic tidal shoreline (pre-Round-P fallback waterline) — unchanged
  // from the pre-D5 chart's own computation.
  let shoreIntersectDist = 0;
  if (displayTransect.length >= 2) {
    const sorted = [...displayTransect].sort((a, b) => a.distance - b.distance);
    for (let i = 0; i < sorted.length - 1; i++) {
      const d0 = sorted[i].depth;
      const d1 = sorted[i + 1].depth;
      if (d0 <= tide && d1 > tide) {
        const frac = (tide - d0) / (d1 - d0);
        shoreIntersectDist = sorted[i].distance + frac * (sorted[i + 1].distance - sorted[i].distance);
        break;
      }
    }
  }
  const waterlineD = waterlineDistance ?? shoreIntersectDist;

  // TA-C19 (ADR-093 Amendment 4): `distance` can be negative — xMin extends
  // landward so no point renders off-canvas — but capped (operator,
  // 2026-08-05): the raw beachElevation series runs hundreds of feet inland
  // and the sand dominated the chart. Show at most ~50 ft of dry sand
  // landward of the waterline.
  const DRY_BEACH_MARGIN = 15.24 * METER_TO_UNIT; // 50 ft
  const xMin = Math.max(
    Math.min(0, ...displayTransect.map((p) => p.distance)),
    Math.min(0, waterlineD - DRY_BEACH_MARGIN),
  );

  const transectDesc = [...displayTransect].sort((a, b) => b.distance - a.distance);
  const depthAt = (d: number) => interpTransectValue(transectDesc, d, 'depth');
  const hsAt = (d: number) => interpTransectValue(transectDesc, d, 'hs');

  // ── Bed (sand + seafloor) curve — one continuous elevation function,
  // exactly like the mockup's bedAt(): depth-derived seaward of the
  // waterline, raw signed beachElevation landward of it. Falls back to
  // depth-derived across the WHOLE domain when beachElevation is absent
  // (pre-Round-P responses render exactly as the pre-D5 chart did). ────────
  const hasBeachElevation = !!(beachElevation && beachElevation.length > 0);
  const beachAsc = hasBeachElevation ? [...beachElevation!].sort((a, b) => a.distance - b.distance) : [];
  const bedAt = (d: number): number => {
    if (hasBeachElevation && d < waterlineD) return interpElevation(beachAsc, d);
    return tide - depthAt(d);
  };

  // ── Dense bed samples across the full visible domain ───────────────────
  const bedSamples: Array<[number, number]> = [];
  const bedStep = (xMax - xMin) / BED_SAMPLE_COUNT || 1;
  for (let d = xMax; d > xMin; d -= bedStep) bedSamples.push([d, bedAt(d)]);
  bedSamples.push([xMin, bedAt(xMin)]);

  // ── Wave surface synthesis — shoaling + breaking decay, secondary bumps
  // at non-primary breaks, swash taper to the waterline. Rendering-only
  // technique ported from the approved mockup (not a physics model output —
  // display decoration over the model's own Hs/period values). ───────────
  const maxWaveH = Math.max(...displayTransect.map((p) => p.hs ?? 0), 0.1);
  const outerBreak = breakPoints.length > 0
    ? breakPoints.reduce((a, b) => (Math.abs(a.distance) > Math.abs(b.distance) ? a : b))
    : null;
  const G = distanceUnit === 'ft' ? 32.174 : 9.80665;
  const periodS = outerBreak?.partitionInfo?.periodS ?? 10;
  const DEPTH_FLOOR = 0.4572 * METER_TO_UNIT;      // 1.5 ft
  const MIN_WAVELENGTH = 18.288 * METER_TO_UNIT;   // 60 ft
  const PRIMARY_BUMP_WINDOW = 6.7056 * METER_TO_UNIT;  // 22 ft
  const SECONDARY_BUMP_WINDOW = 2.7432 * METER_TO_UNIT; // 9 ft
  const SWASH_TAPER = 9.144 * METER_TO_UNIT;       // 30 ft

  function surfaceElevationAt(d: number, theta: number): number {
    if (!outerBreak) {
      // No breaks: smooth non-oscillating shoaling envelope, no whitewater.
      const taper = Math.min(1, Math.max(0, (d - waterlineD) / SWASH_TAPER));
      const eta = 0.6 * hsAt(d) * taper;
      return Math.max(tide + eta, bedAt(d) + 0.05 * METER_TO_UNIT);
    }
    const broken = d < outerBreak.distance;
    let amp = 0.6 * hsAt(d);
    amp *= 1 + 0.32 * Math.exp(-(((d - outerBreak.distance) / PRIMARY_BUMP_WINDOW) ** 2));
    if (broken) amp *= 0.75;
    const f = (Math.cos(theta) + 0.42 * Math.cos(2 * theta)) / 1.42;
    let eta = amp * f;
    for (const bp of breakPoints) {
      if (bp === outerBreak) continue;
      const faceH = bp.faceHeight ?? bp.hs ?? 0;
      eta += 0.55 * faceH * Math.exp(-(((d - bp.distance) / SECONDARY_BUMP_WINDOW) ** 2));
    }
    const taper = Math.min(1, Math.max(0, (d - waterlineD) / SWASH_TAPER));
    const raised = tide + eta * taper;
    return Math.max(raised, bedAt(d) + 0.05 * METER_TO_UNIT);
  }

  // Phase accumulation from offshore to the waterline (dispersion-driven
  // local wavelength), then re-centered so theta=0 sits at the outer break.
  const surfaceStep = (xMax - waterlineD) / SURFACE_SAMPLE_COUNT || 1;
  const phaseSamples: Array<{ d: number; theta: number }> = [];
  {
    let theta = 0;
    for (let d = xMax; d >= waterlineD; d -= surfaceStep) {
      const depth = Math.max(depthAt(d), DEPTH_FLOOR);
      const wavelength = Math.max(periodS * Math.sqrt(G * depth), MIN_WAVELENGTH);
      phaseSamples.push({ d, theta });
      theta += (2 * Math.PI * surfaceStep) / wavelength;
    }
    if (phaseSamples.length === 0 || phaseSamples[phaseSamples.length - 1].d > waterlineD) {
      phaseSamples.push({ d: waterlineD, theta });
    }
  }
  const thetaAtBreak = outerBreak
    ? phaseSamples.reduce((best, s) => (Math.abs(s.d - outerBreak.distance) < Math.abs(best.d - outerBreak.distance) ? s : best), phaseSamples[0]).theta
    : 0;

  const surfaceSamples: Array<[number, number, boolean]> = phaseSamples.map(({ d, theta }) => {
    const broken = outerBreak ? d < outerBreak.distance : false;
    return [d, surfaceElevationAt(d, theta - thetaAtBreak), broken];
  });

  // ── Y-axis dynamic range (LMSL-relative elevation) ─────────────────────
  const bedElevations = bedSamples.map(([, e]) => e);
  const surfaceElevations = surfaceSamples.map(([, e]) => e);
  const bedMin = Math.min(...bedElevations);
  const bedMax = Math.max(...bedElevations, ...surfaceElevations);
  const yTop = Math.max(bedMax, tide + maxWaveH * 1.3, tide + 1) + 1;
  const yBottom = Math.floor(bedMin) - 1;

  const elevationTicks = computeElevationTicks(yTop, yBottom);
  const distanceTicks = computeDistanceTicks(tier, xMin);
  const chartBottom = PAD_TOP + CHART_H;
  const xLeft = PAD_LEFT;
  const xRight = PAD_LEFT + CHART_W;

  const yOf = (e: number) => yScale(e, yTop, yBottom);
  const xOf = (d: number) => xScale(d, xMin, xMax);

  // ── Number formatting ─────────────────────────────────────────────────
  const fmt1 = (n: number | null | undefined): string => {
    if (n == null) return '—';
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  };
  const fmt0 = (n: number | null | undefined): string => {
    if (n == null) return '—';
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
  };

  // ── Bed (sand/seafloor) path ─────────────────────────────────────────
  const bedLinePoints: Array<[number, number]> = bedSamples.map(([d, e]) => [xOf(d), yOf(e)]);
  const bedFillPath = `${pathFromPoints(bedLinePoints)}L${xOf(xMin).toFixed(1)} ${(PAD_TOP + CHART_H).toFixed(1)}L${xOf(xMax).toFixed(1)} ${(PAD_TOP + CHART_H).toFixed(1)}Z`;
  const bedStrokePath = pathFromPoints(bedLinePoints);

  // ── Water fill + whitewater ──────────────────────────────────────────
  const surfaceLinePoints: Array<[number, number]> = surfaceSamples.map(([d, e]) => [xOf(d), yOf(e)]);
  const waterBedPoints: Array<[number, number]> = bedSamples
    .filter(([d]) => d >= waterlineD - 0.001)
    .map(([d, e]) => [xOf(d), yOf(e)]);
  const waterFillPath = surfaceLinePoints.length > 0 && waterBedPoints.length > 0
    ? `${pathFromPoints([...surfaceLinePoints, ...[...waterBedPoints].reverse()])}Z`
    : '';
  const surfaceStrokePath = pathFromPoints(surfaceLinePoints);

  const whitewaterSamples = surfaceSamples.filter(([, , broken]) => broken);
  let whitewaterPath = '';
  if (whitewaterSamples.length > 1) {
    const top: Array<[number, number]> = whitewaterSamples.map(([d, e]) => [xOf(d), yOf(e)]);
    const under: Array<[number, number]> = whitewaterSamples.map(([d, e]) => {
      const depthBelow = Math.min(0.55 * METER_TO_UNIT, 0.4 * hsAt(d) + 0.2 * METER_TO_UNIT);
      return [xOf(d), yOf(Math.max(e - depthBelow, bedAt(d) + 0.05 * METER_TO_UNIT))];
    });
    whitewaterPath = `${pathFromPoints([...top, ...under.reverse()])}Z`;
  }

  // ── D6/D5.2 — zone bands ────────────────────────────────────────────
  const bands: RenderBand[] = (perBreakZones && perBreakZones.length > 0)
    ? bandsFromPerBreakZones(perBreakZones)
    : bandsFromAggregateZones(surfZones);

  function bandPath(band: RenderBand): string {
    const lo = Math.max(Math.min(band.start, band.end), xMin);
    const hi = Math.min(Math.max(band.start, band.end), xMax);
    if (hi <= lo) return '';
    const seg = bedSamples.filter(([d]) => d >= lo && d <= hi);
    if (seg.length < 1) return '';
    const points: Array<[number, number]> = [
      [xOf(hi), yOf(tide)],
      ...seg.map(([d, e]) => [xOf(d), yOf(e)] as [number, number]),
      [xOf(lo), yOf(tide)],
    ];
    return `${pathFromPoints(points)}Z`;
  }

  // ── Break-point crest labels (face height + breaker type), collision-
  // avoidance stagger — same technique as the pre-D5 chart, now referenced
  // against the synthesized crest elevation instead of the old Hs-envelope
  // surface. ────────────────────────────────────────────────────────────
  function estimateLabelWidth(text: string, fontSizePx: number): number {
    return text.length * fontSizePx * 0.62 + 8;
  }

  const BP_LABEL_STAGGER_PX = 16;
  const BP_LABEL_MAX_LEVELS = 6;
  const BP_LABEL_MAX_Y = VIEW_H - 4;

  interface LabelBox { x1: number; x2: number; y1: number; y2: number }
  function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
    return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  }

  function crestElevationAt(d: number): number {
    const nearest = surfaceSamples.reduce(
      (best, s) => (Math.abs(s[0] - d) < Math.abs(best[0] - d) ? s : best),
      surfaceSamples[0] ?? [d, tide, false],
    );
    return nearest[1];
  }

  function breakLabelTexts(bp: BeachProfileBreakPoint) {
    const displayHeight = bp.faceHeight ?? bp.hs;
    return {
      height: displayHeight !== null ? `${fmt1(displayHeight)} ${heightUnit}` : '',
      breaker: bp.breakerType ? t(`surfing.beachProfile.breakType.${bp.breakerType}`) : '',
    };
  }

  function breakLabelBoxes(bpX: number, crestY: number, level: number, texts: { height: string; breaker: string }): LabelBox[] {
    const stagger = level * BP_LABEL_STAGGER_PX;
    const boxes: LabelBox[] = [];
    if (texts.height) {
      const w = estimateLabelWidth(texts.height, 12);
      const y = Math.max(crestY - 8 - stagger, PAD_TOP + 4);
      boxes.push({ x1: bpX - w / 2, x2: bpX + w / 2, y1: y - 11, y2: y + 3 });
    }
    if (texts.breaker) {
      const w = estimateLabelWidth(texts.breaker, 10);
      const y = Math.min(Math.max(crestY - 8 - stagger + 13, PAD_TOP + 16), BP_LABEL_MAX_Y);
      boxes.push({ x1: bpX - w / 2, x2: bpX + w / 2, y1: y - 9, y2: y + 3 });
    }
    return boxes;
  }

  function computeBreakLabelStagger(bps: BeachProfileBreakPoint[]): number[] {
    const order = bps.map((bp, index) => ({ index, x: xOf(bp.distance) })).sort((a, b) => a.x - b.x);
    const levels = new Array(bps.length).fill(0);
    const placedBoxes: LabelBox[][] = [];
    for (const { index } of order) {
      const bp = bps[index];
      const bpX = xOf(bp.distance);
      const crestY = yOf(crestElevationAt(bp.distance));
      const texts = breakLabelTexts(bp);
      let level = 0;
      let candidate = breakLabelBoxes(bpX, crestY, level, texts);
      while (
        level < BP_LABEL_MAX_LEVELS &&
        placedBoxes.some((existing) => candidate.some((cb) => existing.some((eb) => boxesOverlap(cb, eb))))
      ) {
        level += 1;
        candidate = breakLabelBoxes(bpX, crestY, level, texts);
      }
      levels[index] = level;
      placedBoxes.push(candidate);
    }
    return levels;
  }
  // WC-D3: show only the dominant partition's break annotation — drawing
  // multiple breaks at the same bar location is confusing, not informative.
  // The surf height range (modelSurfHeightMin–Max) communicates "multiple
  // swells breaking here" on the Current Swell Conditions card instead.
  const dominantBreakPoints = breakPoints.length > 0
    ? [breakPoints.reduce((best, bp) =>
        (bp.faceHeight ?? bp.hs ?? 0) > (best.faceHeight ?? best.hs ?? 0) ? bp : best
      )]
    : [];
  const breakLabelLevels = computeBreakLabelStagger(dominantBreakPoints);

  // Caption line removed (operator, 2026-08-05): the partition/face/tide/
  // waterline chips duplicated information shown elsewhere on the tab.

  // ── Axis label strings ────────────────────────────────────────────────
  const yAxisTitle = datum
    ? t('surfing.beachProfile.elevationAxisLabel', { unit: distanceUnit, datum })
    : t('surfing.beachProfile.elevationAxisLabelNoDatum', { unit: distanceUnit });
  const xAxisTitle = t('surfing.beachProfile.distanceAxisLabel', { unit: distanceUnit });

  // ── Aria description ─────────────────────────────────────────────────
  // NOTE (carried over, pre-existing gap — not introduced by D5.1): the
  // " {{n}} {{unit}} from shore" / ", {{height}} {{unit}} face height"
  // fragments below concatenate translated (t()) and untranslated English
  // word order (rules/coding.md §6.1). Left unchanged from the pre-D5
  // chart — fixing it needs new composed locale keys across all 13
  // locales, which is out of this round's scope (visual rebuild); flagged
  // in the D5 closeout for a follow-up i18n pass. `.toFixed()` calls here
  // ARE fixed to use the file's own locale-aware fmt0/fmt1 (this text
  // reaches assistive technology, so it's "display text" per §6.4, not the
  // SVG-path-coordinate exception).
  const bpCount = dominantBreakPoints.length;
  const bpDescriptions = dominantBreakPoints.map((bp, i) => {
    const typeStr = bp.breakerType ? ` (${t(`surfing.beachProfile.breakType.${bp.breakerType}`)})` : '';
    const heightVal = bp.faceHeight ?? bp.hs;
    return `${t('surfing.beachProfile.breakPointAria', { n: i + 1 })} ${fmt0(bp.distance)} ${distanceUnit} from shore${heightVal !== null ? `, ${fmt1(heightVal)} ${heightUnit} face height${typeStr}` : ''}.`;
  }).join(' ');
  const titleText = `${t('surfing.beachProfile.ariaTitle', { range: fmt0(xMax - xMin), unit: distanceUnit })}${bpCount > 0 ? ` ${bpDescriptions}` : ''}`;
  const titleId = 'beach-profile-title';

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

  // ── Transect selector value (for the <select>) ─────────────────────────
  const selectorValue = selectedTransect === undefined ? 'best_peak' : String(selectedTransect);

  const clipId = 'beach-profile-plot-clip';

  return (
    <div className="flex flex-col gap-2">
      {/* ── Controls row: transect selector ── */}
      {transects && transects.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 'var(--text-label)' }}>
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
              style={{ fontSize: 'var(--text-label)', padding: '0.2rem 0.5rem', minHeight: '28px' }}
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
        </div>
      )}

      {/* ── SVG visualization ── */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{titleText}</title>

        <defs>
          <linearGradient id="beach-profile-water-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--beach-profile-water-mid)" stopOpacity="0.38" />
            <stop offset="1" stopColor="var(--beach-profile-water-deep)" stopOpacity="0.62" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x={PAD_LEFT} y={PAD_TOP} width={CHART_W} height={CHART_H} />
          </clipPath>
        </defs>

        {/* ── 0. Y-axis horizontal gridlines ── */}
        {elevationTicks.map((e) => (
          <line
            key={`ygrid-${e}`}
            x1={PAD_LEFT} y1={yOf(e)} x2={xRight} y2={yOf(e)}
            aria-hidden="true"
            style={{
              stroke: 'var(--border, rgba(100,100,100,0.3))',
              strokeWidth: 0.5,
              strokeDasharray: e === 0 ? undefined : '3,4',
              strokeOpacity: 0.5,
            }}
          />
        ))}

        <g clipPath={`url(#${clipId})`}>
          {/* ── 1. Water fill (deep -> mid gradient) ── */}
          {waterFillPath && (
            <path d={waterFillPath} aria-hidden="true" style={{ fill: 'url(#beach-profile-water-gradient)', stroke: 'none' }} />
          )}

          {/* ── 2. D6/D5.2 zone bands (impact/foam), drawn under the whitewater/surface stroke ── */}
          {bands.map((band) => {
            const d = bandPath(band);
            if (!d) return null;
            return (
              <path
                key={band.key}
                d={d}
                aria-hidden="true"
                style={{ fill: band.kind === 'impact' ? 'var(--beach-profile-impact)' : 'var(--beach-profile-foam)' }}
              />
            );
          })}

          {/* ── 3. Whitewater overlay (shoreward of the outermost break) ── */}
          {whitewaterPath && (
            <path d={whitewaterPath} aria-hidden="true" style={{ fill: 'var(--beach-profile-whitewater)' }} />
          )}

          {/* ── 4. Wave surface stroke ── */}
          {surfaceStrokePath && (
            <path
              d={surfaceStrokePath}
              aria-hidden="true"
              style={{ fill: 'none', stroke: 'var(--beach-profile-water-stroke)', strokeWidth: 2, strokeLinejoin: 'round' }}
            />
          )}

          {/* ── 5. Sand fill + seafloor/beach boundary stroke ── */}
          <path d={bedFillPath} aria-hidden="true" style={{ fill: 'var(--beach-profile-sand)', stroke: 'none' }} />
          <path d={bedStrokePath} aria-hidden="true" style={{ fill: 'none', stroke: 'var(--beach-profile-sand-edge)', strokeWidth: 1.5 }} />
        </g>

        {/* ── Still-water / tide datum line — line only; the text label was
             removed (operator, 2026-08-05: overprinting noise). ── */}
        <line
          x1={PAD_LEFT} x2={xRight} y1={yOf(tide)} y2={yOf(tide)}
          aria-hidden="true"
          style={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '5,4', strokeOpacity: 0.6 }}
        />

        {/* ── Waterline marker — label sits near the sand/bed height at the
             waterline (mockup: `y(bedAt(WL)) - 30`), not at a fixed chart-top
             offset, so it doesn't collide with the break-crest labels that
             live higher up near the wave surface. ── */}
        {/* Marker line only; the "WATERLINE …" text label was removed
             (operator, 2026-08-05: overprinting noise). */}
        {waterlineDistance != null && xOf(waterlineDistance) >= xLeft && xOf(waterlineDistance) <= xRight && (
          <line
            x1={xOf(waterlineDistance)} x2={xOf(waterlineDistance)}
            y1={PAD_TOP} y2={chartBottom + 4}
            aria-hidden="true"
            style={{ stroke: 'var(--beach-profile-waterline-marker)', strokeWidth: 1.2, strokeDasharray: '2,3' }}
          />
        )}

        {/* ── D6/D5.2 zone band strip + labels below the x-axis ── */}
        {bands.map((band) => {
          const lo = Math.max(Math.min(band.start, band.end), xMin);
          const hi = Math.min(Math.max(band.start, band.end), xMax);
          if (hi <= lo) return null;
          const x1 = xOf(hi);
          const x2 = xOf(lo);
          const left = Math.min(x1, x2);
          const width = Math.max(Math.abs(x2 - x1), 2);
          const ink = band.kind === 'impact' ? 'var(--beach-profile-impact-ink)' : 'var(--beach-profile-foam-ink)';
          const fill = band.kind === 'impact' ? 'var(--beach-profile-impact)' : 'var(--beach-profile-foam)';
          const label = band.kind === 'impact' ? t('surfing.beachProfile.impactZone') : t('surfing.beachProfile.foamZone');
          return (
            <g key={`strip-${band.key}`} aria-hidden="true">
              <rect x={left + 1} y={chartBottom + 22} width={width - 2} height={13} rx={3} style={{ fill }} />
              {width > 46 && (
                <text x={left + width / 2} y={chartBottom + 31} textAnchor="middle" style={{ ...zoneLabelStyle, fill: ink }}>
                  {label}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Break-point crest labels ── */}
        {dominantBreakPoints.map((bp, i) => {
          const bpX = xOf(bp.distance);
          const crestY = yOf(crestElevationAt(bp.distance));
          const stagger = breakLabelLevels[i] * BP_LABEL_STAGGER_PX;
          const { height: heightText, breaker: breakerText } = breakLabelTexts(bp);
          const heightY = Math.max(crestY - 8 - stagger, PAD_TOP + 4);
          const breakerY = Math.min(Math.max(heightY + 13, PAD_TOP + 16), BP_LABEL_MAX_Y);
          return (
            <g key={`bp-${i}`} aria-hidden="true">
              <line
                x1={bpX} y1={heightY + 4} x2={bpX} y2={crestY}
                style={{ stroke: 'var(--beach-profile-impact-ink)', strokeWidth: 1, strokeOpacity: 0.6 }}
              />
              {heightText && (
                <text
                  x={bpX} y={heightY}
                  textAnchor="middle"
                  style={{
                    fontSize: '12px',
                    fill: 'var(--foreground)',
                    fontFamily: 'var(--font-sans, sans-serif)',
                    fontWeight: 700,
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {heightText}
                </text>
              )}
              {breakerText && (
                <text
                  x={bpX} y={breakerY}
                  textAnchor="middle"
                  style={{ fontSize: '10px', fill: 'var(--muted-foreground)', fontFamily: 'var(--font-sans, sans-serif)' }}
                >
                  {breakerText}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Y-axis elevation labels ── */}
        {elevationTicks.map((e) => (
          <text
            key={`ylabel-${e}`}
            x={PAD_LEFT - 6} y={yOf(e)}
            textAnchor="end" dominantBaseline="middle"
            aria-hidden="true"
            style={axisLabelStyle}
          >
            {e === 0 ? '0' : (e > 0 ? `+${e}` : `${e}`)}
          </text>
        ))}

        {/* ── Y-axis title (rotated) ── */}
        <text
          transform="rotate(-90)"
          x={-(PAD_TOP + CHART_H / 2)} y={12}
          textAnchor="middle" dominantBaseline="middle"
          aria-hidden="true"
          style={axisTitleStyle}
        >
          {yAxisTitle}
        </text>

        {/* ── X-axis ticks + distance labels ── */}
        <line x1={PAD_LEFT} x2={xRight} y1={chartBottom} y2={chartBottom} aria-hidden="true" style={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeOpacity: 0.5 }} />
        {distanceTicks.map((dist) => {
          const dx = xOf(dist);
          return (
            <g key={`xtick-${dist}`} aria-hidden="true">
              <line x1={dx} y1={chartBottom} x2={dx} y2={chartBottom + 5} style={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeOpacity: 0.5 }} />
              <text x={dx} y={chartBottom + 16} textAnchor="middle" style={axisLabelStyle}>
                {new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(dist)}
              </text>
            </g>
          );
        })}

        {/* ── X-axis title ── */}
        <text x={PAD_LEFT + CHART_W / 2} y={VIEW_H - 4} textAnchor="middle" aria-hidden="true" style={axisTitleStyle}>
          {xAxisTitle}
        </text>
      </svg>

      {/* ── Legend (mockup: Water / Whitewater / Impact zone / Foam zone / Sand — no D6 toggle, per-break zones ship as the default) ── */}
      <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 'var(--text-micro)' }}>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, display: 'inline-block', background: 'linear-gradient(180deg, var(--beach-profile-water-mid), var(--beach-profile-water-deep))', opacity: 0.6 }} />
          {t('surfing.beachProfile.legendWater')}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, display: 'inline-block', background: 'var(--beach-profile-whitewater)', boxShadow: 'inset 0 0 0 1px var(--border)' }} />
          {t('surfing.beachProfile.legendWhitewater')}
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--beach-profile-impact-ink)', fontWeight: 600 }}>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, display: 'inline-block', background: 'var(--beach-profile-impact)' }} />
          {t('surfing.beachProfile.impactZone')}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, display: 'inline-block', background: 'var(--beach-profile-sand)' }} />
          {t('surfing.beachProfile.legendSand')}
        </span>
      </div>

      {/* ── Screen-reader-only data table ── */}
      <table className="sr-only" aria-label={t('surfing.beachProfile.srTableLabel')}>
        <caption>
          {t('surfing.beachProfile.srTableCaption')}
          {bands.filter((b) => b.kind === 'impact').length > 0
            ? bands.filter((b) => b.kind === 'impact').map((b) => ` ${t('surfing.beachProfile.impactZone')}: ${fmt0(Math.min(b.start, b.end))}–${fmt0(Math.max(b.start, b.end))} ${distanceUnit} from shore.`).join('')
            : ''}
          {bands.filter((b) => b.kind === 'foam').length > 0
            ? bands.filter((b) => b.kind === 'foam').map((b) => ` ${t('surfing.beachProfile.foamZone')}: ${fmt0(Math.min(b.start, b.end))}–${fmt0(Math.max(b.start, b.end))} ${distanceUnit} from shore.`).join('')
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
              <td>{new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(p.distance)}</td>
              <td>{fmt1(p.depth)}</td>
              <td>{fmt1(p.hs)}</td>
              <td>{fmt1(p.swellHeight)}</td>
              <td>{p.breakingFraction != null ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(p.breakingFraction) : '—'}</td>
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
                <td>{new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bp.distance)}</td>
                <td>{fmt1(bp.depth)}</td>
                <td>{fmt1(bp.faceHeight ?? bp.hs)}</td>
                <td colSpan={2}>{bp.breakerType ? t(`surfing.beachProfile.breakType.${bp.breakerType}`) : ''}</td>
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  );
}
