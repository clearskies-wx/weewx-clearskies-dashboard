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
//   3. Breaker-type glyphs — spilling (horizontal line), plunging (curl arc),
//                            surging (vertical line) at each row's break point(s).
//   4. Multi-bar support   — two break-zone curves when rows have outer + inner bars.
//
// C3 (2026-08-08, L1-BOUNDARY-REBUILD-PLAN Phase C, P15) removed the
// structure-affected-area overlay (reduced-opacity rows + hatching pattern +
// legend entry) — operator ruling: confusing, and the structure's physical
// effect is already carried by the wave action itself (SWAN L4), which this
// card's Hs colour already reflects. `row.isStructureAffected` still backs
// the sr-only table's "Open" column (data, not a visual overlay) and stays
// available on each transect entry for a consumer that wants it.
//
// A11y (rules/coding.md §5):
//   - SVG: role="img" + aria-labelledby → <title> + <desc>
//   - sr-only <table> carries per-row Hs values and zone info for AT
//   - No colour-only signals: zone fills paired with text labels; break glyphs have
//     distinct shapes.
//   - Focus: interactive SVG is aria-hidden; all data exposed via sr-only table.
//
// X-axis: shore on RIGHT, offshore on LEFT (surfer's perspective; matches BeachProfileChart).
// Y-axis: REAL alongshore ground distance (C3, L1-BOUNDARY-REBUILD-PLAN
// Phase C3, P16/P15, 2026-08-09 PM) — `row.alongshoreM`, not transect index.
// Row 0's origin is alongshoreM=0 (south end, per the pipeline's own
// cumulative bookkeeping) and renders at the chart TOP; increasing
// alongshoreM renders further down. See "GROUND->CHART TRANSFORM" below.
//

// D7s (ROUND-D5-BEACH-PROFILE-CARD-BRIEF-2026-08-05, standing operator
// request — "this is why i want the smoothing on the heat map, so a few
// transects zeroing out does not make a difference"): display-side median
// filter over a 5-transect window (centered on each row, clamped at the
// row-count edge), applied at RENDER time only. Raw `data`/`row.transect`
// values are never mutated — `smoothedHsAt()` below reads them and returns
// a derived value used solely for the colour cell fill and its `<title>`
// tooltip. See `smoothedHsAt()` for the exact alignment method (same
// positional index across the row window, clamped per-row at that row's
// own point-array-length edge).

import { useMemo, useId } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Warning } from '@phosphor-icons/react';
import type { HeatMapProfileData, HeatMapTransectData, HeatMapBreakPoint, HeatMapEnvelopePoint } from '../../../api/types';
import { useImageryConfig } from '../../../hooks/useImageryConfig';

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
   * note as {@link mainBreakZoneStartIndex}. NOT rendered as a marker
   * (operator ruling 2026-08-02: the triangle/bold-label marker was
   * developer/operator context, meaningless to an end user — stays removed
   * from the default render). **Repurposed by C3 (2026-08-08,
   * L1-BOUNDARY-REBUILD-PLAN Phase C, P15):** when present and its row's
   * `transectBearingDeg` is non-null, this is the "beach bearing" reference
   * the orthophoto imagery layer rotates by — the closest single
   * beach-frame bearing the data carries (falls back to the middle row's
   * bearing, then no rotation, when absent — see `beachBearingDeg` below).
   */
  representativeTransectIndex?: number | null;
  /**
   * LM-2 (2026-08-03): the spot's latitude, used ONLY to fetch orthophoto
   * background imagery config (`GET /api/v1/imagery/config`) — DISPLAY
   * ONLY, never feeds SWAN/the 1D model/transect selection. Sourced from
   * data SurfingTab already fetches (`useSurfDetail`'s `coordinates`), not
   * a new fetch. Null/undefined → no imagery fetch, byte-identical render
   * to before this round.
   */
  spotLat?: number | null;
  /** See {@link spotLat}. */
  spotLon?: number | null;
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
// LM-2 (2026-08-03): Orthophoto background imagery — DISPLAY ONLY. Never
// feeds SWAN, the 1D model, transect selection, or any physics path.
//
// GROUND -> CHART TRANSFORM (C3 rebuild, 2026-08-09 PM, L1-BOUNDARY-REBUILD-
// PLAN Phase C3, P15/P16 — REPLACES the pre-existing "radial fan from one
// shared spot-centred origin" FOOTPRINT MODEL, deleted this round per the
// operator's revocation: "unacceptable... the underlying orthophotography
// and the heat map are NOT correctly co-registered at scale"):
//
//   - X (cross-shore): unchanged mechanism, now ground-correct by
//     construction — `row.transect[].distance` is each row's OWN real
//     cross-shore distance along its OWN real `transectBearingDeg` from its
//     OWN real origin (P16 fields below). `distToX()` maps it linearly; no
//     reprojection needed for the grid itself.
//   - Y (alongshore): `row.alongshoreM` (P16) — real cumulative alongshore
//     ground distance from row 0's real origin, monotonic by row index.
//     `alongToY()` (below) maps it linearly over the chart's real domain —
//     row 0 (the southernmost origin, alongshoreM=0) renders at the chart
//     TOP. Row bands are VARIABLE height (`computeRowBands()`), each
//     spanning the midpoint gap to its neighbours, so densely-sampled
//     stretches of coastline render visibly denser than sparse ones — the
//     Y axis is a real ruler, not a uniform index grid.
//   - Imagery bbox/rotation/buffer: derived from ONE fitted ground
//     transform (`fitGroundTransform()`) built from the served per-row
//     origins — a total-least-squares (PCA) fit of the real shoreline
//     tangent through those origins, plus a fitted offshore bearing (the
//     circular mean of every row's own `transectBearingDeg`, snapped to
//     whichever tangent-perpendicular it agrees with). One raster, one
//     rotation angle (coordinator ruling 2026-08-09 PM) — never a single
//     row's bearing or a hardcoded value. The 50 m visible buffer is a
//     GROUND distance on all four sides of the real (alongshore x
//     cross-shore) extent, converted to lat/lon corners via the SAME
//     transform, then enclosed in a north-up lat/lon bbox for the tile
//     fetch (imagery tiles are north-up; the mosaic <g> is rotated on
//     screen to match, same as before).
//
// Falls back to the pre-C3 uniform-index Y layout AND disables the imagery
// transform entirely (no rotation, no ground-fitted bbox) whenever fewer
// than 2 rows carry real `originLat`/`originLon`/`alongshoreM` — an older
// cached response predating P16. That fallback path renders byte-identical
// to the pre-C3 chart (KAT b lineage).
// ---------------------------------------------------------------------------

/** Max tiles fetched per mosaic side (4 -> up to 4x4=16 tiles). Named/documented, easily tuned. */
const IMAGERY_MOSAIC_MAX_TILES_PER_SIDE = 4;
/** Zoom clamp — within the API's own supported range [0, 20] (API-MANUAL §12a). */
const IMAGERY_ZOOM_MIN = 14;
const IMAGERY_ZOOM_MAX = 19;
/**
 * C3 (2026-08-08, P15) — visible ortho buffer beyond the heatmap's own
 * cross-shore/row extent, on all four sides, so a visitor can orient
 * against a landmark (pier, jetty) outside the modeled area. Folded into
 * both the fetch radius (more area requested) and the on-screen tile
 * placement (image drawn larger than the core plot rectangle, clipped at
 * the buffered — not the core — bound).
 */
const IMAGERY_VISIBLE_BUFFER_M = 50;
/**
 * Heat-map colour-cell fill opacity multiplier when an ortho background is
 * present — low enough the photo reads through, high enough the Hs colours
 * stay legible. Named/documented, easily tuned at the operator eyeball step.
 */
const HEATMAP_CELL_OPACITY_ON_ORTHO = 0.55;
/** Base heat-map colour-cell fill opacity with no ortho background — UNCHANGED from pre-LM-2 (0.85), preserves KAT (b) byte-identity. */
const HEATMAP_CELL_OPACITY_DEFAULT = 0.85;

const METERS_PER_DEGREE_LAT = 111320;

/** Converts a display-unit distance (ft or m) to meters. */
function toMeters(v: number, distanceUnit: string): number {
  const METER_TO_UNIT = distanceUnit === 'ft' ? 3.28084 : 1;
  return v / METER_TO_UNIT;
}

interface GeoBBox { south: number; west: number; north: number; east: number; }

// ---------------------------------------------------------------------------
// C3 GROUND->CHART TRANSFORM — pure functions, no React/hook state, so the
// ground-truth vitest (HeatMapCard.test.tsx) can exercise them directly
// against real lat/lon fixtures without rendering.
// ---------------------------------------------------------------------------

export interface LocalMeters { east: number; north: number; }
export interface LatLon { lat: number; lon: number; }

/** Equirectangular local-tangent-plane projection, meters from (refLat, refLon). */
export function latLonToLocalMeters(point: LatLon, refLat: number, refLon: number): LocalMeters {
  const cosLat = Math.cos((refLat * Math.PI) / 180);
  const metersPerDegLon = METERS_PER_DEGREE_LAT * Math.max(Math.abs(cosLat), 0.01);
  return {
    east: (point.lon - refLon) * metersPerDegLon,
    north: (point.lat - refLat) * METERS_PER_DEGREE_LAT,
  };
}

/** Inverse of {@link latLonToLocalMeters}. */
export function localMetersToLatLon(m: LocalMeters, refLat: number, refLon: number): LatLon {
  const cosLat = Math.cos((refLat * Math.PI) / 180);
  const metersPerDegLon = METERS_PER_DEGREE_LAT * Math.max(Math.abs(cosLat), 0.01);
  return {
    lat: refLat + m.north / METERS_PER_DEGREE_LAT,
    lon: refLon + m.east / metersPerDegLon,
  };
}

export interface GroundTransform {
  refLat: number;
  refLon: number;
  /** Alongshore unit vector (east, north) — the fitted shoreline tangent, oriented so increasing alongshoreM moves in this direction. */
  tangentUnit: LocalMeters;
  /** Offshore unit vector (east, north) — fitted from the circular mean of every row's own transectBearingDeg, snapped to the tangent-perpendicular it agrees with. */
  offshoreUnit: LocalMeters;
  /** Met-convention bearing (0=N..360) of {@link offshoreUnit} — feeds computeImageryRotationDeg for the mosaic rotation. */
  offshoreBearingDeg: number;
  /** Row 0's origin, in local meters relative to (refLat, refLon) — alongshoreM=0 anchor. */
  origin0: LocalMeters;
}

export interface GroundOrigin { lat: number; lon: number; alongshoreM: number; bearingDeg: number | null; }

/**
 * Fits ONE ground transform from the served per-row origins (P16) — a
 * total-least-squares (2x2 covariance eigenvector) fit of the real
 * shoreline tangent, plus a fitted offshore bearing (circular mean of every
 * row's own transectBearingDeg). Returns null when fewer than 2 origins are
 * available (nothing to fit a line through) — callers fall back to the
 * pre-C3 uniform layout in that case.
 */
export function fitGroundTransform(origins: GroundOrigin[]): GroundTransform | null {
  if (origins.length < 2) return null;
  const refLat = origins.reduce((s, o) => s + o.lat, 0) / origins.length;
  const refLon = origins.reduce((s, o) => s + o.lon, 0) / origins.length;

  const pts = origins.map((o) => ({
    ...latLonToLocalMeters(o, refLat, refLon),
    bearingDeg: o.bearingDeg,
  }));

  const meanEast = pts.reduce((s, p) => s + p.east, 0) / pts.length;
  const meanNorth = pts.reduce((s, p) => s + p.north, 0) / pts.length;
  let sEE = 0, sNN = 0, sEN = 0;
  for (const p of pts) {
    const de = p.east - meanEast;
    const dn = p.north - meanNorth;
    sEE += de * de; sNN += dn * dn; sEN += de * dn;
  }
  // Dominant eigenvector of the 2x2 covariance matrix [[sEE,sEN],[sEN,sNN]]
  // — the best-fit line direction (shoreline tangent) through the origins.
  const trace = sEE + sNN;
  const det = sEE * sNN - sEN * sEN;
  const disc = Math.sqrt(Math.max((trace * trace) / 4 - det, 0));
  const lambda1 = trace / 2 + disc;
  let te: number, tn: number;
  if (Math.abs(sEN) > 1e-9) {
    te = lambda1 - sNN;
    tn = sEN;
  } else if (sEE >= sNN) {
    te = 1; tn = 0;
  } else {
    te = 0; tn = 1;
  }
  const tLen = Math.hypot(te, tn) || 1;
  te /= tLen; tn /= tLen;

  // Orient the tangent so increasing alongshoreM moves in the +tangent
  // direction (row 0 -> last row), matching the server's own ordering.
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dEast = last.east - first.east;
  const dNorth = last.north - first.north;
  if (te * dEast + tn * dNorth < 0) { te = -te; tn = -tn; }

  // Fitted offshore bearing: circular mean of every row's own
  // transectBearingDeg, snapped to whichever tangent-perpendicular it
  // agrees with (the tangent alone has no seaward/landward sense).
  const perp1: LocalMeters = { east: tn, north: -te };
  const perp2: LocalMeters = { east: -tn, north: te };
  const bearings = pts.map((p) => p.bearingDeg).filter((b): b is number => b != null);
  let offshoreUnit: LocalMeters = perp1;
  if (bearings.length > 0) {
    let sinSum = 0, cosSum = 0;
    for (const b of bearings) {
      const rad = (b * Math.PI) / 180;
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
    }
    const meanRad = Math.atan2(sinSum, cosSum);
    const meanVec: LocalMeters = { east: Math.sin(meanRad), north: Math.cos(meanRad) };
    const d1 = perp1.east * meanVec.east + perp1.north * meanVec.north;
    const d2 = perp2.east * meanVec.east + perp2.north * meanVec.north;
    offshoreUnit = d1 >= d2 ? perp1 : perp2;
  }
  const offshoreBearingDeg = ((Math.atan2(offshoreUnit.east, offshoreUnit.north) * 180) / Math.PI + 360) % 360;

  return {
    refLat, refLon,
    tangentUnit: { east: te, north: tn },
    offshoreUnit,
    offshoreBearingDeg,
    origin0: { east: first.east, north: first.north },
  };
}

/**
 * Ground point (lat/lon) at a given alongshore position + cross-shore
 * distance (both meters, both measured from row 0's origin along the
 * fitted transform) — used ONLY for the imagery bbox corners (the grid
 * itself positions from `distance`/`alongshoreM` directly, no reprojection
 * needed there).
 */
export function groundPointAt(transform: GroundTransform, alongshoreM: number, crossM: number): LatLon {
  const east = transform.origin0.east
    + alongshoreM * transform.tangentUnit.east
    + crossM * transform.offshoreUnit.east;
  const north = transform.origin0.north
    + alongshoreM * transform.tangentUnit.north
    + crossM * transform.offshoreUnit.north;
  return localMetersToLatLon({ east, north }, transform.refLat, transform.refLon);
}

/**
 * Inverse of {@link groundPointAt} — given a real lat/lon point, returns its
 * (alongshoreM, crossM) ground-frame coordinates. `tangentUnit`/
 * `offshoreUnit` are orthonormal, so this is an exact dot-product inverse
 * (no least-squares/approximation). C3S (coordinator correction, 2026-08-09
 * PM) — used to project the imagery mosaic's OWN tile-snapped bbox corners
 * into the SAME ground frame the grid itself is drawn in, so the mosaic's
 * on-screen scale is derived from real geometry, never assumed equal to the
 * chart's declared rect.
 */
export function groundFrameCoords(transform: GroundTransform, point: LatLon): { alongshoreM: number; crossM: number } {
  const local = latLonToLocalMeters(point, transform.refLat, transform.refLon);
  const dx = local.east - transform.origin0.east;
  const dy = local.north - transform.origin0.north;
  return {
    alongshoreM: dx * transform.tangentUnit.east + dy * transform.tangentUnit.north,
    crossM: dx * transform.offshoreUnit.east + dy * transform.offshoreUnit.north,
  };
}

/** North-up lat/lon bbox enclosing a set of points. */
export function bboxFromPoints(points: LatLon[]): GeoBBox {
  return points.reduce(
    (acc, p) => ({
      south: Math.min(acc.south, p.lat),
      north: Math.max(acc.north, p.lat),
      west: Math.min(acc.west, p.lon),
      east: Math.max(acc.east, p.lon),
    }),
    { south: points[0].lat, north: points[0].lat, west: points[0].lon, east: points[0].lon },
  );
}

/**
 * C3 (2026-08-08/09, P15) — the SVG `rotate()` angle (degrees, clockwise on
 * screen) that turns a north-up mosaic image so the OFFSHORE compass
 * direction (`bearingDeg`, met/compass convention: 0=N, 90=E, 180=S, 270=W)
 * points chart-LEFT — this card's existing offshore convention (shore
 * right, offshore left, matching BeachProfileChart). `bearingDeg` is now
 * the FITTED transform's `offshoreBearingDeg` (2026-08-09 PM, coordinator
 * ruling: one raster gets one rotation angle, derived from the same fitted
 * transform) — the formula itself is unchanged.
 *
 * Derivation: an unrotated north-up image maps compass bearing β to screen
 * unit vector `(sin β, -cos β)` (β=0/N -> up, β=90/E -> right). Applying
 * SVG's `rotate(θ)` transform (standard rotation matrix; appears clockwise
 * on screen since SVG's y-axis points down) to that vector and solving for
 * the θ that lands it on `(-1, 0)` (chart-left) reduces to `θ = 270 - β`
 * (mod 360). Sanity checks: β=270 (offshore already due west, i.e. already
 * chart-left in an unrotated north-up image) -> θ=0, no rotation needed.
 * β=0 (offshore due north, "up" in an unrotated image) -> θ=270, rotating
 * the image 270° clockwise so its "up" edge swings around to point left.
 */
export function computeImageryRotationDeg(bearingDeg: number): number {
  return ((270 - bearingDeg) % 360 + 360) % 360;
}

// Standard slippy-map (Web Mercator) tile <-> lon/lat math. Pure arithmetic,
// no library — see https://en.wikipedia.org/wiki/Tiled_web_map (the same
// convention the API's NAIP proxy and ESRI's own XYZ template both use).
function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
  );
}
function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}
function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Approximate ground size (meters) of one 256px slippy tile at zoom z, latitude lat. */
function tileGroundSizeM(z: number, lat: number): number {
  const cosLat = Math.abs(Math.cos((lat * Math.PI) / 180));
  return (156543.03392 * Math.max(cosLat, 0.01) * 256) / 2 ** z;
}

/**
 * Picks the highest zoom (best resolution) within [IMAGERY_ZOOM_MIN,
 * IMAGERY_ZOOM_MAX] whose mosaic still fits within
 * IMAGERY_MOSAIC_MAX_TILES_PER_SIDE tiles per side for the given diameter.
 * Falls back to IMAGERY_ZOOM_MIN when even the minimum zoom's mosaic would
 * exceed the cap (the cap then binds in computeImageryTiles below, which
 * logs that condition — never silently under-covers without a trace).
 */
function selectImageryZoom(diameterM: number, lat: number): number {
  for (let z = IMAGERY_ZOOM_MAX; z >= IMAGERY_ZOOM_MIN; z--) {
    const tilesPerSide = diameterM / tileGroundSizeM(z, lat);
    if (tilesPerSide <= IMAGERY_MOSAIC_MAX_TILES_PER_SIDE) return z;
  }
  return IMAGERY_ZOOM_MIN;
}

interface ImageryTile {
  z: number;
  x: number;
  y: number;
  /** Screen-space position/size within the SVG viewBox. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

interface SnappedMosaicBBox { xMin: number; xMax: number; yMin: number; yMax: number; mosaicWest: number; mosaicEast: number; mosaicNorth: number; mosaicSouth: number; }

/**
 * C3S (coordinator correction, 2026-08-09 PM) — computes the TRUE tile-
 * snapped ground bbox the mosaic will actually cover at `zoom` (slippy tiles
 * snap to tile boundaries, so this is generally LARGER than `bbox`).
 * Extracted so the caller can project this REAL bbox's own corners through
 * the same ground scale `S` (not assume it equals the requested/declared
 * bbox — that was the "assumed rect" bug the coordinator caught: it would
 * have let the acceptance test measure the declared value, not the real
 * fetched-tile footprint). Clamps the tile count to
 * IMAGERY_MOSAIC_MAX_TILES_PER_SIDE per side, centered on the bbox — when
 * clamping actually reduces coverage (the cap binds), logs a console.debug
 * note rather than silently fetching a smaller area than `bbox` implied.
 */
function snapImageryBBoxToTiles(bbox: GeoBBox, zoom: number): SnappedMosaicBBox {
  const xMinRaw = lonToTileX(bbox.west, zoom);
  const xMaxRaw = lonToTileX(bbox.east, zoom);
  // North = smaller Y in Web Mercator tile coordinates.
  const yMinRaw = latToTileY(bbox.north, zoom);
  const yMaxRaw = latToTileY(bbox.south, zoom);

  let xMin = Math.min(xMinRaw, xMaxRaw);
  let xMax = Math.max(xMinRaw, xMaxRaw);
  let yMin = Math.min(yMinRaw, yMaxRaw);
  let yMax = Math.max(yMinRaw, yMaxRaw);

  const exceedsCap =
    xMax - xMin + 1 > IMAGERY_MOSAIC_MAX_TILES_PER_SIDE ||
    yMax - yMin + 1 > IMAGERY_MOSAIC_MAX_TILES_PER_SIDE;
  if (exceedsCap) {
    const cx = Math.floor((xMin + xMax) / 2);
    const cy = Math.floor((yMin + yMax) / 2);
    const half = Math.floor((IMAGERY_MOSAIC_MAX_TILES_PER_SIDE - 1) / 2);
    xMin = cx - half;
    xMax = cx + (IMAGERY_MOSAIC_MAX_TILES_PER_SIDE - 1 - half);
    yMin = cy - half;
    yMax = cy + (IMAGERY_MOSAIC_MAX_TILES_PER_SIDE - 1 - half);
    // Silent-coverage-cap class issue (lead ruling, LM-2) — documented and
    // logged, not invisible: the study circle implied by the requested
    // cross-shore/alongshore extent is larger than the mosaic actually
    // fetched at this zoom, so the ortho background covers less than the
    // full chart at its edges. Raising IMAGERY_MOSAIC_MAX_TILES_PER_SIDE
    // (more tiles fetched) or lowering IMAGERY_ZOOM_MIN (coarser resolution,
    // wider coverage per tile) both widen coverage; this is the constant to
    // tune first.
    // eslint-disable-next-line no-console
    console.debug(
      `[HeatMapCard] imagery mosaic tile cap (${IMAGERY_MOSAIC_MAX_TILES_PER_SIDE}/side) bound at zoom ${zoom} — ` +
      'study area extends beyond the fetched mosaic; only the center tiles are covered.',
    );
  }

  return {
    xMin, xMax, yMin, yMax,
    mosaicWest: tileXToLon(xMin, zoom),
    mosaicEast: tileXToLon(xMax + 1, zoom),
    mosaicNorth: tileYToLat(yMin, zoom),
    mosaicSouth: tileYToLat(yMax + 1, zoom),
  };
}

/**
 * Positions each tile within the mosaic's own north-up screen rectangle
 * (`chartX/Y/W/H` — the TRUE ground-scaled size/position of the tile-snapped
 * mosaic bbox, per `snapImageryBBoxToTiles`, NOT an assumed chart rect: see
 * that function's doc). The caller then rotates the whole returned group
 * about the mosaic's own center (see imageryLayer in the component) to
 * align true-north to this card's offshore-left convention.
 */
function computeImageryTiles(
  snapped: SnappedMosaicBBox,
  zoom: number,
  chartX: number,
  chartY: number,
  chartW: number,
  chartH: number,
): ImageryTile[] {
  const { xMin, xMax, yMin, yMax, mosaicWest, mosaicEast, mosaicNorth, mosaicSouth } = snapped;
  const lonSpan = mosaicEast - mosaicWest;
  const latSpan = mosaicNorth - mosaicSouth;
  if (lonSpan <= 0 || latSpan <= 0) return [];

  const lonToScreenX = (lon: number) => chartX + ((lon - mosaicWest) / lonSpan) * chartW;
  const latToScreenY = (lat: number) => chartY + ((mosaicNorth - lat) / latSpan) * chartH;

  const tiles: ImageryTile[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const sx = lonToScreenX(tileXToLon(x, zoom));
      const sxEnd = lonToScreenX(tileXToLon(x + 1, zoom));
      const sy = latToScreenY(tileYToLat(y, zoom));
      const syEnd = latToScreenY(tileYToLat(y + 1, zoom));
      tiles.push({ z: zoom, x, y, sx, sy, sw: sxEnd - sx, sh: syEnd - sy });
    }
  }
  return tiles;
}

/**
 * Substitutes `{z}`/`{x}`/`{y}` tokens in a tile URL template. Token-based,
 * never position-based — NAIP's proxy path (`.../{z}/{x}/{y}`) and ESRI's
 * own XYZ template (`.../{z}/{y}/{x}`) do not use the same path order.
 */
function substituteTileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

// ---------------------------------------------------------------------------
// Derived geometry helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// C3S (2026-08-09 PM, single-scale fix) — ONE ground scale `S` (px per
// metre) drives EVERY spatial element on this chart: X cells, Y cells, the
// imagery mosaic, glyphs, buffers. Replaces the old two-ruler system (tiered
// X-axis normalized/stretched to fill CHART_W regardless of true span, Y
// budgeted to an arbitrary 300/N pixel allotment, imagery fitted to a THIRD,
// independently-derived px-per-metre) — operator-caught: the 567m pier
// rendered shorter than ~200m transect strips, ~900ft south of its true row,
// surf cells over downtown. Any two points' pixel distance / S now equals
// their true ground distance, every direction, every pair.
//
//   S = CHART_W / frameSpanM
//   frameSpanM = (dataMaxM + BUFFER_M) - (dataMinM - BUFFER_M)
//   dataMinM/dataMaxM = min/max of EVERY row's real transect distance,
//     converted to metres — the true cross-shore extent, not a tier-clipped
//     subset.
//
// No more clipping: every real transect point renders at its true position;
// nothing is ever pushed off-canvas or stretched to fill unused width. A
// row's data naturally leaves the 50m buffer margin empty (e.g. the pier
// clips at the frame's offshore edge with only its inner ~176m visible —
// correct at true scale, not a bug).
// ---------------------------------------------------------------------------

/** Real cross-shore data extent (metres) across every row's raw transect points — no clipping, no tiers. */
function computeDataExtentM(rows: HeatMapTransectData[], distanceUnit: string): { minM: number; maxM: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    for (const pt of row.transect) {
      const m = toMeters(pt.distance, distanceUnit);
      if (m < min) min = m;
      if (m > max) max = m;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  return { minM: min, maxM: max };
}

/** Cross-shore distance, in METRES already, to SVG x — the raw ground-scale primitive every X placement (grid cells AND imagery corners) goes through. */
function crossMToX(crossM: number, frameMaxM: number, S: number): number {
  return PAD_LEFT + (frameMaxM - crossM) * S;
}

/**
 * Map a cross-shore distance (in `distanceUnit`) to SVG x (shore = RIGHT,
 * offshore = LEFT), through the ONE ground scale `S` and the frame's
 * offshore-most edge (`frameMaxM`, metres) — `x = PAD_LEFT + (frameMaxM -
 * distM) * S`.
 */
function distToX(dist: number, distanceUnit: string, frameMaxM: number, S: number): number {
  return crossMToX(toMeters(dist, distanceUnit), frameMaxM, S);
}

/** Alongshore ground distance, in METRES already, to SVG y — the raw ground-scale primitive every Y placement (grid rows AND imagery corners) goes through. */
function alongMToY(alongshoreM: number, alongMinM: number, S: number): number {
  return PAD_TOP + (alongshoreM - alongMinM + IMAGERY_VISIBLE_BUFFER_M) * S;
}

/**
 * Shared tick-step ladder (100m/25m, 300m/50m, else 200m — scaled by
 * distanceUnit) for BOTH axes now that neither uses a tier — same numbers
 * the old X-axis tiers and the Y-axis ticks already used independently
 * (D5.2/C3), now the single shared source for both.
 */
function computeAxisTicks(minUnit: number, maxUnit: number, distanceUnit: string): number[] {
  const METER_TO_UNIT = distanceUnit === 'ft' ? 3.28084 : 1;
  const span = maxUnit - minUnit;
  const tickStep = span <= 100 * METER_TO_UNIT ? 25 * METER_TO_UNIT
    : span <= 300 * METER_TO_UNIT ? 50 * METER_TO_UNIT
    : 200 * METER_TO_UNIT;
  const ticks: number[] = [];
  const first = Math.ceil(minUnit / tickStep) * tickStep;
  for (let v = first; v <= maxUnit; v += tickStep) ticks.push(v);
  if (ticks.length === 0 || ticks[0] > minUnit + 0.01) ticks.unshift(minUnit);
  return ticks;
}

// D7s smoothing window radius — 5-transect window = 2 rows on each side of
// the current row, centered.
const SMOOTHING_WINDOW_RADIUS = 2;

/**
 * D7s — centered median filter over a 5-transect window, applied at RENDER
 * time only (`data`/`row.transect` are never mutated). Alignment method
 * (lead-approved 2026-08-05): for row `ri`, point-array position `pi`,
 * gather the Hs value at the SAME positional index from each row in
 * `[ri-2 .. ri+2]` (clamped at the row-count edge), and within each of
 * those rows clamp `pi` to that row's own point-array-length edge (a
 * shorter neighboring row contributes its last point rather than being
 * skipped outright — rows are sampled at consistent resolution from the
 * same real (unclipped, C3S) domain, so positional alignment is a
 * reasonable, simple choice here per the brief's own instruction to propose
 * one).
 * Returns `null` only when every row in the window has zero points (or all
 * null Hs) — callers fall back to the pre-existing break-point proximity
 * model in that case, unchanged from before D7s.
 */
function smoothedHsAt(displayTransects: HeatMapEnvelopePoint[][], ri: number, pi: number): number | null {
  const n = displayTransects.length;
  const values: number[] = [];
  for (let r = Math.max(0, ri - SMOOTHING_WINDOW_RADIUS); r <= Math.min(n - 1, ri + SMOOTHING_WINDOW_RADIUS); r++) {
    const rowPts = displayTransects[r];
    if (rowPts.length === 0) continue;
    const idx = Math.min(pi, rowPts.length - 1);
    const hs = rowPts[idx].hs;
    if (hs !== null && hs !== undefined) values.push(hs);
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

/** Map a row index to the SVG y of the top of that row (pre-C3 uniform fallback, used only when P16 ground data is unavailable). */
function rowToY(idx: number, rowH: number): number {
  return PAD_TOP + idx * rowH;
}

export interface RowBand { top: number; bottom: number; center: number; }

/**
 * C3S (2026-08-09 PM, single-scale fix) — variable-height row bands from
 * REAL alongshore ground positions (`alongshoreM`), positioned through the
 * ONE ground scale `S` (`yOf`, caller-supplied — e.g. `(v) => alongMToY(v,
 * alongMinM, S)`), NOT linearly stretched into a fixed pixel budget. Each
 * row's band spans the midpoint gap to its neighbours (contiguous, no
 * overlap), so densely-sampled coastline renders visibly denser than sparse
 * stretches. The first/last row's OUTER edge mirrors its own inner
 * half-pitch (symmetric edge, coordinator-approved 2026-08-09 PM) rather
 * than stretching to the frame's buffer edge — color cells stay inside the
 * true data extent, same as the X axis (the 50m ground buffer stays an
 * empty margin, not filled by an edge row). `alongshoreValues` MUST be
 * non-decreasing by index (the server's own monotonic-by-index contract).
 */
export function computeRowBands(alongshoreValues: number[], yOf: (v: number) => number): RowBand[] {
  const n = alongshoreValues.length;
  if (n === 0) return [];
  const centers = alongshoreValues.map(yOf);
  if (n === 1) return [{ top: centers[0], bottom: centers[0], center: centers[0] }];
  const bands: RowBand[] = centers.map((center, i) => {
    const top = i === 0
      ? center - (centers[1] - centers[0]) / 2
      : (centers[i - 1] + center) / 2;
    const bottom = i === n - 1
      ? center + (centers[n - 1] - centers[n - 2]) / 2
      : (center + centers[i + 1]) / 2;
    return { top, bottom, center };
  });
  return bands;
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
  spotLat = null, spotLon = null,
  representativeTransectIndex = null,
}: HeatMapCardProps): ReactElement | null {
  const { t } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const titleId = useId();
  const descId  = useId();

  // LM-2 (2026-08-03): orthophoto background imagery config. React hooks
  // constraint (DASHBOARD-MANUAL §6) — called unconditionally, before any
  // early return below. `useImageryConfig` itself skips the fetch and
  // returns `data: null` when spotLat/spotLon are null (no plumbing yet) or
  // on any fetch failure (404 "imagery disabled", network error) — every
  // "no imagery" reason collapses to the same byte-identical render path.
  const { data: imageryConfig } = useImageryConfig(spotLat, spotLon);

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
    // Fallback-only row budget (pre-C3 uniform-index grid) — used ONLY when
    // ground alongshoreM data is unavailable (see hasGroundY below). The
    // primary ground-scale path never uses this.
    const rowH = Math.min(ROW_H_MAX, Math.max(ROW_H_MIN, Math.floor(300 / N)));
    const bottomPad = showOverlayLegend ? PAD_BOTTOM_WITH_OVERLAY_LEGEND : PAD_BOTTOM;

    // C3S (2026-08-09 PM, single-scale fix) — ONE ground scale S, from the
    // real cross-shore data extent (ALL rows, every raw transect point, no
    // clipping) plus the uniform 50m ground buffer on both sides. Every
    // spatial element on this chart (X cells, Y cells, imagery) converts
    // through this SAME S — see the module comment above.
    const { minM: dataMinM, maxM: dataMaxM } = computeDataExtentM(rows, distanceUnit);
    const frameMinM = dataMinM - IMAGERY_VISIBLE_BUFFER_M;
    const frameMaxM = dataMaxM + IMAGERY_VISIBLE_BUFFER_M;
    const frameSpanM = frameMaxM - frameMinM;
    const S = frameSpanM > 0 ? CHART_W / frameSpanM : 1;

    // No clipping, no tiers — every real transect point renders at its true
    // position (row.transect, unmodified).
    const displayTransects: HeatMapEnvelopePoint[][] = rows.map((row) => row.transect);

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

    // C3 (2026-08-09 PM, P16) — real alongshore row positions. Every row
    // must carry `alongshoreM` for the ground-truth Y axis to apply — a
    // single missing value falls the WHOLE chart back to the pre-C3
    // uniform-index grid (never a mix of the two schemes on one chart).
    const alongshoreValues = rows.map((r) => r.alongshoreM);
    const hasGroundY = alongshoreValues.every((v): v is number => v != null);
    const alongMinM = hasGroundY ? Math.min(...(alongshoreValues as number[])) : null;
    const alongMaxM = hasGroundY ? Math.max(...(alongshoreValues as number[])) : null;

    // C3S — chartH is the FULL Y extent including the 50m buffer both
    // sides, at the SAME scale S (parity with CHART_W, which is already the
    // full buffered cross-shore frame). Fallback path keeps its own
    // pre-existing index-budget height, unaffected by this fix.
    const chartH = (hasGroundY && alongMinM != null && alongMaxM != null)
      ? (alongMaxM - alongMinM + 2 * IMAGERY_VISIBLE_BUFFER_M) * S
      : N * rowH;
    const viewH = PAD_TOP + chartH + bottomPad;

    const rowBands: RowBand[] = (hasGroundY && alongMinM != null)
      ? computeRowBands(alongshoreValues as number[], (v) => alongMToY(v, alongMinM, S))
      : rows.map((_, i) => {
          const top = rowToY(i, rowH);
          return { top, bottom: top + rowH, center: top + rowH / 2 };
        });

    // C3 — the fitted ground transform (shoreline tangent + offshore
    // bearing) driving the imagery bbox/rotation. Needs >= 2 real origins;
    // falls back to no imagery transform (imagery layer omitted entirely)
    // otherwise — see imageryLayer below.
    const origins: GroundOrigin[] = rows
      .filter((r): r is HeatMapTransectData & { originLat: number; originLon: number; alongshoreM: number } =>
        r.originLat != null && r.originLon != null && r.alongshoreM != null)
      .map((r) => ({ lat: r.originLat, lon: r.originLon, alongshoreM: r.alongshoreM, bearingDeg: r.transectBearingDeg }));
    const groundTransform = origins.length >= 2 ? fitGroundTransform(origins) : null;

    return {
      rows, N, rowH, chartH, viewH, maxHs, displayTransects,
      rowBands, hasGroundY, alongMinM, alongMaxM, groundTransform,
      dataMinM, dataMaxM, frameMinM, frameMaxM, S,
    };
  }, [data, showOverlayLegend, distanceUnit, representativeTransectIndex]);

  // LM-2/C3 (2026-08-09 PM rebuild): ortho tile mosaic — see the
  // GROUND->CHART TRANSFORM comment block above. `null` (no imagery layer
  // at all) whenever imagery config is absent, geometry is null, OR the
  // fitted ground transform is unavailable (< 2 real per-row origins,
  // P16 not yet served) — no circle/radius approximation fallback; an
  // imagery layer that can't be ground-located correctly does not render,
  // per the operator's revocation of the old footprint-model imagery.
  const imageryLayer = useMemo(() => {
    if (!imageryConfig || !geometry || !geometry.groundTransform || !geometry.hasGroundY) return null;
    const transform = geometry.groundTransform;
    const { S, dataMinM, dataMaxM, alongMinM, alongMaxM, frameMaxM } = geometry;
    if (alongMinM == null || alongMaxM == null) return null;
    if (!(dataMaxM > dataMinM) || !(alongMaxM >= alongMinM)) return null;

    // C3 — the buffered study rectangle, in the SAME (alongshore, cross-
    // shore) ground frame the grid itself is drawn in — a real 50 m ground
    // buffer on all four sides, not a fixed on-screen fraction.
    const crossLo = dataMinM - IMAGERY_VISIBLE_BUFFER_M;
    const crossHi = dataMaxM + IMAGERY_VISIBLE_BUFFER_M;
    const alongLo = alongMinM - IMAGERY_VISIBLE_BUFFER_M;
    const alongHi = alongMaxM + IMAGERY_VISIBLE_BUFFER_M;

    // The 4 corners of the REQUESTED rectangle, projected to real lat/lon
    // via the ONE fitted transform, then enclosed in a north-up bbox for
    // the tile fetch (a fetch request only — see snapImageryBBoxToTiles
    // below for the bbox actually used to PLACE the tiles).
    const corners = [
      groundPointAt(transform, alongLo, crossLo),
      groundPointAt(transform, alongLo, crossHi),
      groundPointAt(transform, alongHi, crossLo),
      groundPointAt(transform, alongHi, crossHi),
    ];
    const requestedBbox = bboxFromPoints(corners);
    const diagonalM = Math.hypot(alongHi - alongLo, crossHi - crossLo);
    const zoom = selectImageryZoom(diagonalM, transform.refLat);

    // C3S (coordinator correction, 2026-08-09 PM) — the TRUE tile-snapped
    // mosaic bbox (slippy tiles snap to tile boundaries, so this is
    // generally LARGER than requestedBbox). Project ITS OWN corners through
    // the SAME ground scale S (via groundFrameCoords, the exact inverse of
    // groundPointAt) — never assume the fetched mosaic equals the requested
    // rectangle. This is what makes the imagery's implied px/m measurably
    // equal S: it is DERIVED from S here, not declared equal to it.
    const snapped = snapImageryBBoxToTiles(requestedBbox, zoom);
    const mosaicCenterLat = (snapped.mosaicNorth + snapped.mosaicSouth) / 2;
    const mosaicCenterLon = (snapped.mosaicWest + snapped.mosaicEast) / 2;
    const { alongshoreM: pivotAlongM, crossM: pivotCrossM } =
      groundFrameCoords(transform, { lat: mosaicCenterLat, lon: mosaicCenterLon });
    const pivotX = crossMToX(pivotCrossM, frameMaxM, S);
    const pivotY = alongMToY(pivotAlongM, alongMinM, S);

    // The mosaic's TRUE north-up ground size (metres), at the SAME scale S
    // — not the chart's declared rect.
    const cosLat = Math.cos((mosaicCenterLat * Math.PI) / 180);
    const mosaicWidthM = (snapped.mosaicEast - snapped.mosaicWest) * METERS_PER_DEGREE_LAT * Math.max(Math.abs(cosLat), 0.01);
    const mosaicHeightM = (snapped.mosaicNorth - snapped.mosaicSouth) * METERS_PER_DEGREE_LAT;
    const screenW = mosaicWidthM * S;
    const screenH = mosaicHeightM * S;
    const screenX = pivotX - screenW / 2;
    const screenY = pivotY - screenH / 2;

    const tiles = computeImageryTiles(snapped, zoom, screenX, screenY, screenW, screenH);
    // C3 (2026-08-09 PM, coordinator ruling) — one raster, one rotation
    // angle, derived from the SAME fitted transform (never a single row's
    // bearing). C3S: rotates about the mosaic's OWN center (`pivotX`,
    // `pivotY` — its true S-scaled ground position), not an arbitrary chart
    // center — a rotation-about-own-center of a true-scale, correctly
    // north-up-placed rectangle lands its corners at the SAME positions as
    // directly projecting the real corners through groundFrameCoords.
    const rotationDeg = computeImageryRotationDeg(transform.offshoreBearingDeg);

    return { tiles, rotationDeg, pivotX, pivotY, screenX, screenY, screenW, screenH };
  }, [imageryConfig, geometry]);

  // X-axis tick values — over the REAL cross-shore data extent (dataMinM,
  // dataMaxM), shared tick-step ladder with the Y axis (computeAxisTicks).
  // C3S: replaces the old tier's fixed maxDistance/tickStep pair.
  const xTicks = useMemo(() => {
    if (!geometry) return [];
    const METER_TO_UNIT = distanceUnit === 'ft' ? 3.28084 : 1;
    const minUnit = geometry.dataMinM * METER_TO_UNIT;
    const maxUnit = geometry.dataMaxM * METER_TO_UNIT;
    return computeAxisTicks(minUnit, maxUnit, distanceUnit);
  }, [geometry, distanceUnit]);

  // C3 (2026-08-09 PM) — Y-axis ticks over the REAL alongshore ground
  // domain, same unit family as X (distanceUnit), same shared tick-step
  // ladder (computeAxisTicks) keyed by the along-range span instead of the
  // cross-shore range. No ground data -> no Y ticks at all (pre-C3 fallback
  // renders row-index labels instead — see the render body).
  const yTicks = useMemo(() => {
    if (!geometry || !geometry.hasGroundY || geometry.alongMinM == null || geometry.alongMaxM == null) return [];
    const METER_TO_UNIT = distanceUnit === 'ft' ? 3.28084 : 1;
    const minUnit = geometry.alongMinM * METER_TO_UNIT;
    const maxUnit = geometry.alongMaxM * METER_TO_UNIT;
    return computeAxisTicks(minUnit, maxUnit, distanceUnit);
  }, [geometry, distanceUnit]);

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

  const { rows, N, rowH, chartH, viewH, maxHs, displayTransects, rowBands, hasGroundY, frameMaxM, S } = geometry;

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
  const legendY = PAD_TOP + chartH + 28;

  // LM-2/C3: whether an ortho background actually renders this pass
  // (imagery config present AND at least one tile computed). Drives the
  // reduced colour-cell opacity and the background-rect/tile-mosaic branch
  // below — when false, both render EXACTLY as before this round (KAT b).
  const hasImageryBackground = !!imageryLayer && imageryLayer.tiles.length > 0;
  const cellOpacity = hasImageryBackground ? HEATMAP_CELL_OPACITY_ON_ORTHO : HEATMAP_CELL_OPACITY_DEFAULT;
  const imageryClipId = `heatmap-imagery-clip-${titleId.replace(/:/g, '')}`;

  // ── Build SVG elements ────────────────────────────────────────────────────

  // 1. Colour cells: for each row, subdivide the transect into segments.
  //    Each segment's colour = Hs at that cross-shore distance (if available
  //    from transect point data, otherwise from nearest break point).
  const colorCells: ReactElement[] = [];
  const zoneFills: ReactElement[] = [];
  const breakGlyphs: ReactElement[] = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    // C3 — the row's real (or pre-C3-fallback uniform) band, from
    // `geometry.rowBands`, not a uniform index*rowH grid.
    const band = rowBands[ri];
    const y = band.top;
    const bandH = band.bottom - band.top;

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
        const x0 = distToX(d0, distanceUnit, frameMaxM, S);
        const x1 = distToX(d1, distanceUnit, frameMaxM, S);
        const xLeft  = Math.min(x0, x1);
        const xRight = Math.max(x0, x1);
        const w = xRight - xLeft;
        if (w < 0.5) continue;

        // D7s: prefer the median-5-smoothed Hs at this row/position (falls
        // back to the pre-existing break-point proximity model only when
        // every row in the smoothing window has no usable Hs here — the
        // same "no data at all" case the pre-D7s code handled). Raw
        // `pts[pi].hs` is read only inside smoothedHsAt(); it is never
        // written back.
        let segHs = 0;
        const smoothedHs = smoothedHsAt(displayTransects, ri, pi);
        if (smoothedHs !== null) {
          segHs = smoothedHs;
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

        const fill = hsToColor(segHs, maxHs, cellOpacity);
        colorCells.push(
          <rect
            key={`cell-${ri}-${pi}`}
            x={xLeft}
            y={y}
            width={w}
            height={bandH}
            fill={fill}
          >
            {/* D7s: native SVG tooltip shows the smoothed value only (one
                value shown, no raw/smoothed pair — keep it simple, per the
                brief). */}
            <title>{`${fmtNum(segHs)} ${heightUnit}`}</title>
          </rect>
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
          height={bandH}
          fill={hsToColor(rowHs, maxHs, cellOpacity)}
        />
      );
    }

    // 2. Zone overlays: surfZones from the API.
    // SurfZoneExtent has startDistance (outer) and endDistance (inner/closer to shore).
    if (row.surfZones) {
      const { impactZone, foamZone } = row.surfZones;
      if (impactZone != null) {
        const x0 = distToX(impactZone.startDistance, distanceUnit, frameMaxM, S);
        const x1 = distToX(impactZone.endDistance, distanceUnit, frameMaxM, S);
        const xL = Math.min(x0, x1);
        const xR = Math.max(x0, x1);
        if (xR - xL > 0.5) {
          zoneFills.push(
            <rect
              key={`impact-${ri}`}
              x={xL}
              y={y}
              width={xR - xL}
              height={bandH}
              fill={ZONE_IMPACT_FILL}
            />
          );
        }
      }
      if (foamZone != null) {
        const x0 = distToX(foamZone.startDistance, distanceUnit, frameMaxM, S);
        const x1 = distToX(foamZone.endDistance, distanceUnit, frameMaxM, S);
        const xL = Math.min(x0, x1);
        const xR = Math.max(x0, x1);
        if (xR - xL > 0.5) {
          zoneFills.push(
            <rect
              key={`foam-${ri}`}
              x={xL}
              y={y}
              width={xR - xL}
              height={bandH}
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
        const bx = distToX(bp.distance, distanceUnit, frameMaxM, S);
        // Break zone extent: 10% of CHART_W in each direction.
        const halfW = CHART_W * 0.05;
        zoneFills.push(
          <rect
            key={`bzone-${ri}-${bp.distance}`}
            x={bx - halfW}
            y={y}
            width={halfW * 2}
            height={bandH}
            fill={ZONE_BREAK_FILL}
          />
        );
      }
    }

    // 4. Breaker type glyphs.
    for (const bp of row.breakPoints) {
      if (!bp.breakerType) continue;
      const bx = distToX(bp.distance, distanceUnit, frameMaxM, S);
      const cy = y + bandH / 2;
      breakGlyphs.push(
        <BreakerGlyph
          key={`glyph-${ri}-${bp.distance}`}
          cx={bx}
          cy={cy}
          type={bp.breakerType}
          rowH={bandH}
        />
      );
    }

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
            {hasImageryBackground && ` ${t('surfing.heatMap.orthoImageryDesc',
              'An aerial photo of the beach is shown as a background for geographic context.')}`}
          </desc>

          {/* Defs: LM-2/C3 — clip the ortho tile mosaic to the BUFFERED chart
           *  rectangle (core plot + the C3 50m visible buffer on all sides)
           *  so rotated/oversized tile edges never spill past that bound
           *  into the Y-axis gutter or legend area. Only present when an
           *  ortho background actually renders — omitted entirely otherwise
           *  (KAT b DOM identity). */}
          <defs>
            {hasImageryBackground && imageryLayer && (
              <clipPath id={imageryClipId}>
                <rect x={PAD_LEFT} y={PAD_TOP} width={CHART_W} height={chartH} />
              </clipPath>
            )}
          </defs>

          {/* Chart background — LM-2: an ortho tile mosaic renders here
           *  instead of the plain translucent rect when imagery is
           *  available, so the semi-transparent colour cells above read as
           *  an overlay on the real beach photo. No imagery -> the ORIGINAL
           *  rect, unchanged (KAT b byte-identity). C3S (coordinator
           *  correction, 2026-08-09 PM): the mosaic <g> is a TRUE-scale
           *  (ground scale S) north-up rectangle, rotated about its OWN
           *  center (`imageryLayer.pivotX/pivotY` — its real S-scaled
           *  ground position, from the tile-snapped mosaic bbox, NOT the
           *  chart's declared rect) by the beach bearing
           *  (`imageryLayer.rotationDeg`, 0 = no rotation) — mathematically
           *  equal to directly projecting the mosaic's real corners through
           *  the ground frame. The outer clip (unrotated, at the CORE chart
           *  rect — the mosaic's true extent generally exceeds it, by
           *  design: the 50m buffer beyond the data plus tile-snap
           *  overhang) keeps the visible photo bounded to the chart. */}
          {hasImageryBackground && imageryLayer ? (
            <g aria-hidden="true" clipPath={`url(#${imageryClipId})`}>
              <g transform={`rotate(${imageryLayer.rotationDeg} ${imageryLayer.pivotX} ${imageryLayer.pivotY})`}>
                {imageryLayer.tiles.map((tile) => (
                  <image
                    key={`ortho-${tile.z}-${tile.x}-${tile.y}`}
                    href={substituteTileUrl(imageryConfig!.tileUrl, tile.z, tile.x, tile.y)}
                    x={tile.sx}
                    y={tile.sy}
                    width={tile.sw}
                    height={tile.sh}
                    preserveAspectRatio="none"
                  />
                ))}
              </g>
            </g>
          ) : (
            <rect
              x={PAD_LEFT}
              y={PAD_TOP}
              width={CHART_W}
              height={chartH}
              fill="var(--card-glass)"
              opacity={0.3}
            />
          )}

          {/* Row separator lines — C3: at each real band boundary (top of
           *  row 0, then every band's bottom edge), not a uniform i*rowH
           *  grid. */}
          {[rowBands[0]?.top ?? PAD_TOP, ...rowBands.map((b) => b.bottom)].map((sepY, i) => (
            <line
              key={`sep-${i}`}
              x1={PAD_LEFT}
              y1={sepY}
              x2={PAD_LEFT + CHART_W}
              y2={sepY}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.12}
              strokeWidth={0.5}
            />
          ))}

          {/* Colour cells (bottom layer) */}
          {colorCells}

          {/* Zone overlays */}
          {zoneFills}

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
              y={rowBands[zoneBandStartPos].top}
              width={6}
              height={rowBands[zoneBandEndPos].bottom - rowBands[zoneBandStartPos].top}
              rx={2}
              fill={MAIN_BREAK_ZONE_FILL}
              aria-hidden="true"
            />
          )}

          {/* BD-9 representative-transect marker (triangle + bolded row
           *  label) removed from the render — operator ruling 2026-08-02:
           *  developer/operator context, meaningless to an end user. */}

          {/* Y axis — C3S (2026-08-09 PM, single-scale rebuild): REAL
           *  alongshore ground-distance ticks (`yTicks`, meters converted to
           *  distanceUnit, positioned via `alongMToY` — the SAME ground
           *  scale S the grid itself uses) — the transect-INDEX labels are
           *  DELETED per the operator's ruling ("no one gives a shit about"
           *  row numbers). Falls back to the pre-C3 density-aware index
           *  labels ONLY when ground data is unavailable (older cached
           *  response, no P16 fields) — same `labelStep` density-aware logic
           *  as before in that fallback. */}
          {hasGroundY && geometry.alongMinM != null
            ? yTicks.map((v) => {
                const METER_TO_UNIT = distanceUnit === 'ft' ? 3.28084 : 1;
                const yPix = alongMToY(v / METER_TO_UNIT, geometry.alongMinM!, S);
                return (
                  <g key={`ytick-${v}`} aria-hidden="true">
                    <line x1={PAD_LEFT - 4} y1={yPix} x2={PAD_LEFT} y2={yPix} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
                    <text x={PAD_LEFT - 6} y={yPix + 3.5} fontSize={9} fill="var(--muted-foreground)" textAnchor="end">
                      {fmtNum(v)}
                    </text>
                  </g>
                );
              })
            : rows.map((row, ri) => {
                const labelStep = Math.max(1, Math.ceil(12 / rowH));
                if (ri % labelStep !== 0 && ri !== rows.length - 1) return null;
                return (
                  <text
                    key={`ylabel-${ri}`}
                    x={PAD_LEFT - 4}
                    y={rowToY(ri, rowH) + rowH / 2 + 3.5}
                    fontSize={10}
                    fill="var(--muted-foreground)"
                    textAnchor="end"
                    aria-hidden="true"
                  >
                    {row.transectIndex}
                  </text>
                );
              })}

          {/* C3 (2026-08-09 PM, P15) — Y-axis title. Real alongshore
           *  distance, same unit family as X, when ground data is
           *  available; the pre-C3 ordinal "Transect" title otherwise
           *  (fallback path, no fabricated unit on data that has none). */}
          <text
            transform="rotate(-90)"
            x={-(PAD_TOP + chartH / 2)}
            y={10}
            fontSize={9}
            fill="var(--muted-foreground)"
            textAnchor="middle"
            aria-hidden="true"
          >
            {hasGroundY
              ? t('surfing.heatMap.alongshoreAxisLabel', 'Alongshore distance ({{unit}})', { unit: distanceUnit })
              : t('surfing.heatMap.transectAxisLabel', 'Transect')}
          </text>

          {/* X axis ticks and labels */}
          {xTicks.map((v) => {
            const x = distToX(v, distanceUnit, frameMaxM, S);
            return (
              <g key={`xtick-${v}`}>
                <line
                  x1={x}
                  y1={PAD_TOP + chartH}
                  x2={x}
                  y2={PAD_TOP + chartH + 4}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.5}
                />
                <text
                  x={x}
                  y={PAD_TOP + chartH + 14}
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
            y={PAD_TOP + chartH + 26}
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

      {/* LM-2: imagery attribution — ToS-mandated text, rendered verbatim
       *  (never through t(), DASHBOARD-MANUAL §7 / API-MANUAL §12:
       *  textTranslatable is false for every provider in v0.1). Visible
       *  (not sr-only) — mirrors the radar card's own inline attribution
       *  line styling (DESIGN-MANUAL §19). Absent entirely when no imagery
       *  config (KAT b DOM identity). */}
      {hasImageryBackground && (
        <p
          className="mt-1 text-[var(--muted-foreground)]"
          style={{ fontSize: 'var(--text-micro)' }}
        >
          {imageryConfig!.attribution}
        </p>
      )}

      {/* D7s — plain-words smoothing note (standing operator request). */}
      <p className="mt-1 text-[var(--muted-foreground)]" style={{ fontSize: 'var(--text-micro)' }}>
        {t('surfing.heatMap.smoothingNote', "Values are smoothed across neighboring transects so isolated model dropouts don't appear as gaps.")}
      </p>

      {/* sr-only data table for assistive technology */}
      {srTable}
    </div>
  );
}
