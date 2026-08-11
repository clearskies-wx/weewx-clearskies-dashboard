// HeatMapCard.test.tsx — SURF-PUBLISH-RESULTS-ONLY §3.6 (2026-07-25).
//
// Same contract as BeachProfileCardBody.test.tsx, for the all-transect
// (?transect_index=all) response this card renders:
//   - Fetch error -> role="alert", destructive styling, retry button.
//   - modelStatus: "unavailable" (profiles: null) -> muted informational
//     text naming the model gap. NOT an alert. Must not crash on the null
//     `profiles` array (this is the exact shape that used to throw at
//     `data.profiles.length` before this round's null-guard fix).
//   - modelStatus: "ok" -> the SVG heat map renders as before.
//   - Error takes priority over modelStatus/data, matching the ordering
//     rule applied to BeachProfileCardBody.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, within, fireEvent } from '@testing-library/react';
import {
  HeatMapCard,
  computeImageryRotationDeg,
  fitGroundTransform,
  groundFrameCoords,
} from './HeatMapCard';
import type { LatLon } from './HeatMapCard';
import type {
  HeatMapProfileDataOk,
  HeatMapProfileDataUnavailable,
  HeatMapTransectData,
  ImageryConfigResponse,
} from '../../../api/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

// LM-2 (2026-08-03): HeatMapCard now calls useImageryConfig() unconditionally
// (React hooks rule). Mocked at the module level (not the underlying
// useApiQuery/fetchApi chain) so: (a) every PRE-EXISTING test in this file
// keeps its exact byte-identical render — the default mock return below
// (`data: null`) is exactly what the real hook would resolve to for
// baseProps, which never sets spotLat/spotLon; (b) the new imagery KATs
// below get full, synchronous control over the imagery config without
// needing a real fetch or an IdleDetectorProvider ancestor.
const mockUseImageryConfig = vi.fn();
vi.mock('../../../hooks/useImageryConfig', () => ({
  useImageryConfig: (...args: unknown[]) => mockUseImageryConfig(...args),
}));

beforeEach(() => {
  mockUseImageryConfig.mockReset();
  mockUseImageryConfig.mockReturnValue({ data: null, loading: false });
});

const NAIP_CONFIG: ImageryConfigResponse = {
  provider: 'naip',
  tileUrl: '/api/v1/imagery/tiles/{z}/{x}/{y}',
  attribution: 'USGS National Agriculture Imagery Program (NAIP) — public domain',
  proxyMode: 'api',
  bounds: { south: 24.396308, west: -125.0, north: 49.384358, east: -66.93457 },
};

const ESRI_CONFIG: ImageryConfigResponse = {
  provider: 'esri',
  tileUrl: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
  proxyMode: 'direct',
  bounds: null,
};

// React's useId() prefixes its id string with an internal render-root
// counter that increments across EVERY render() call within a single test
// process (not reset per test/render root) — so the exact `_r_XX_` suffix
// captured from a standalone one-render golden snapshot never matches the
// same component rendered later in a full suite run, even though nothing
// about the component's actual output changed. Normalizes every distinct
// `_r_..._` token to a stable positional placeholder (same raw id -> same
// placeholder everywhere it recurs, e.g. titleId used in both
// `aria-labelledby` and the hatch pattern's id prefix) before comparing —
// every other byte (tags, attributes, coordinates, fills, text) is still
// compared exactly.
function normalizeReactIds(html: string): string {
  const seen = new Map<string, string>();
  let counter = 0;
  return html.replace(/_r_[0-9a-zA-Z]+_/g, (match) => {
    if (!seen.has(match)) seen.set(match, `_ID${counter++}_`);
    return seen.get(match)!;
  });
}

const ROW: HeatMapTransectData = {
  transectIndex: 0,
  isStructureAffected: false,
  transectBearingDeg: 245,
  transect: [
    { distance: 300, depth: 9, hs: 2.8, swellHeight: 2.6, breakingFraction: null },
    { distance: 50, depth: 2, hs: 3.4, swellHeight: 2.9, breakingFraction: 0.7 },
  ],
  breakPoints: [],
  waveShapes: [],
  surfZones: null,
  jackingFactors: [],
  handoffDepthM: 4.8,
  handoffSourceLevel: 'L3',
};

// TA-C19 (ADR-093 Amendment 4, D4.2): a live capture (profile-fixture.json,
// huntington-city-beach-pier, 2026-08-02) had a real transect point at
// distance -25.94 — landward of the reference waterline (HAT extension).
// This row reproduces that shape so the negative-distance axis-domain fix
// can be asserted against a real observed value, not a synthetic guess.
const ROW_WITH_NEGATIVE_DISTANCE: HeatMapTransectData = {
  transectIndex: 39,
  isStructureAffected: false,
  transectBearingDeg: 250,
  transect: [
    { distance: 68.56, depth: 1.943, hs: 0.8206, swellHeight: 0.62, breakingFraction: null },
    { distance: 25.59, depth: 1.113, hs: 0.8125, swellHeight: 0.55, breakingFraction: 0.4 },
    { distance: -25.94, depth: 0.01, hs: 0.0073, swellHeight: 0.01, breakingFraction: 0.9 },
  ],
  breakPoints: [],
  waveShapes: [],
  surfZones: null,
  jackingFactors: [],
  handoffDepthM: 1.4068,
  handoffSourceLevel: 'L4',
};

// Mirrors HeatMapCard.tsx's SVG layout constants (VIEW_W=820, PAD_LEFT=60,
// PAD_RIGHT=12 -> CHART_W=748) — not exported from the component, so the
// drawable-area bounds are restated here for the in-canvas assertion below.
const PAD_LEFT = 60;
const CHART_W = 748;

// Mirrors HeatMapCard.tsx's MAIN_BREAK_ZONE_FILL constant (D5.2) — not
// exported, restated for the overlay-presence assertions below.
const MAIN_BREAK_ZONE_FILL = 'rgba(168, 85, 247, 0.75)';

// D5.1 pinning fixture — REAL live data (profile-all-fixture.json,
// huntington-city-beach-pier, 2026-08-02, transectIndex 4), not synthesized:
// a genuine double-break transect (two breakPoints, same partition — outer
// bar at 42.06m, inner bar at 24.87m) that ALSO carries negative-distance
// points (-0.92 down to -35.24, landward of the reference waterline). One
// fixture proves both D5.1 findings against the same real transect: (a)
// double-break rendering was already generic/correct pre-D5 (no code
// change), (b) D4's negative-distance domain fix holds for a transect that
// also has a real double break.
const ROW_DOUBLE_BREAK_LIVE: HeatMapTransectData = {
  transectIndex: 4,
  isStructureAffected: true,
  transectBearingDeg: 239.99309346343887,
  transect: [
    { distance: 67.84, depth: 1.456, hs: 0.7552867151844674 },
    { distance: 59.25, depth: 1.296, hs: 0.7635210153288052 },
    { distance: 50.65, depth: 1.133, hs: 0.7615883379327697 },
    { distance: 42.06, depth: 0.973, hs: 0.71029 },
    { distance: 33.46, depth: 0.819, hs: 0.5978699999999999 },
    { distance: 24.87, depth: 0.6639999999999999, hs: 0.48471999999999993 },
    { distance: 16.27, depth: 0.514, hs: 0.37522 },
    { distance: 7.68, depth: 0.371, hs: 0.27083 },
    { distance: -0.92, depth: 0.24, hs: 0.1752 },
    { distance: -9.5, depth: 0.10200000000000001, hs: 0.07446 },
    { distance: -18.08, depth: 0.01, hs: 0.0073 },
    { distance: -26.66, depth: 0.01, hs: 0.0073 },
    { distance: -35.24, depth: 0.01, hs: 0.0073 },
  ],
  breakPoints: [
    {
      distance: 42.06, depth: 0.973, hs: 0.71029, faceHeight: 0.9020682999999999,
      breakerType: 'spilling', iribarren: 0.337,
      partitionInfo: { partitionIndex: 0, periodS: 13.0539, directionDeg: 196.902, classification: 'groundswell', heightM: 0.4955 },
    },
    {
      distance: 24.87, depth: 0.6639999999999999, hs: 0.48471999999999993, faceHeight: 0.6155943999999999,
      breakerType: 'spilling', iribarren: 0.327,
      partitionInfo: { partitionIndex: 0, periodS: 13.0539, directionDeg: 196.902, classification: 'groundswell', heightM: 0.4955 },
    },
  ],
  waveShapes: [],
  surfZones: {
    impactZone: { startDistance: 50.65, endDistance: 33.46, startDepth: 0.879, endDepth: 0.565 },
    foamZone: { startDistance: 33.46, endDistance: 24.87, startDepth: 0.565, endDepth: 0.41 },
    totalSurfZone: { widthM: 25.779999999999998, startDistance: 50.65, endDistance: 24.87 },
    reformTrough: null,
  },
  jackingFactors: [],
  handoffDepthM: 1.2287671232876711,
  handoffSourceLevel: 'L4',
};

const UNAVAILABLE_RESPONSE: HeatMapProfileDataUnavailable = {
  locationId: 'huntington-city-beach-pier',
  timestep: null,
  modelStatus: 'unavailable',
  profiles: null,
  perPartitionBreaks: null,
  metadata: {
    axisUnits: { x: 'ft', y: 'ft' },
    verticalDatum: null,
    transectCount: null,
    openTransectCount: null,
    handoffDepthM: null,
    handoffSourceLevel: null,
  },
};

const OK_RESPONSE: HeatMapProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-07-25T19:00:00Z',
  modelStatus: 'ok',
  profiles: [ROW],
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'ft', y: 'ft' },
    verticalDatum: 'NAVD88',
    transectCount: 1,
    openTransectCount: 1,
    handoffDepthM: 4.8,
    handoffSourceLevel: 'L3',
  },
};

const OK_RESPONSE_NEGATIVE_DISTANCE: HeatMapProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-08-02T00:00:00Z',
  modelStatus: 'ok',
  profiles: [ROW_WITH_NEGATIVE_DISTANCE],
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'm', y: 'm' },
    verticalDatum: 'LMSL',
    transectCount: 143,
    openTransectCount: 118,
    handoffDepthM: 1.4068,
    handoffSourceLevel: 'L4',
  },
};

const OK_RESPONSE_DOUBLE_BREAK: HeatMapProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-08-02T00:00:00Z',
  modelStatus: 'ok',
  profiles: [ROW_DOUBLE_BREAK_LIVE],
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'm', y: 'm' },
    verticalDatum: 'LMSL',
    transectCount: 143,
    openTransectCount: 114,
    handoffDepthM: 1.2287671232876711,
    handoffSourceLevel: 'L4',
  },
};

// D5.2 overlay fixture — 5 simple rows (indices 0-4) so a zone band
// (1..3) and a representative marker (2) both have real row geometry to
// assert against. Synthetic transect points (same style as ROW above);
// D5.1's live-data proof is the double-break fixture above, this fixture
// exercises the NEW overlay feature's geometry/null-safety, not the
// negative-distance fix (already covered elsewhere).
function buildRow(transectIndex: number): HeatMapTransectData {
  return {
    transectIndex,
    isStructureAffected: false,
    transectBearingDeg: 245,
    transect: [
      { distance: 100, depth: 3, hs: 1.2 },
      { distance: 10, depth: 0.5, hs: 0.8 },
    ],
    breakPoints: [],
    waveShapes: [],
    surfZones: null,
    jackingFactors: [],
    handoffDepthM: 2,
    handoffSourceLevel: 'L3',
  };
}

const OK_RESPONSE_5_ROWS: HeatMapProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-08-02T00:00:00Z',
  modelStatus: 'ok',
  profiles: [0, 1, 2, 3, 4].map(buildRow),
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'm', y: 'm' },
    verticalDatum: 'LMSL',
    transectCount: 5,
    openTransectCount: 5,
    handoffDepthM: 2,
    handoffSourceLevel: 'L3',
  },
};

// ---------------------------------------------------------------------------
// C3 (2026-08-09 PM, P16) — ground-origin fixture. Real-shaped lat/lon
// origins spaced along a shoreline tangent bearing ~335° (perpendicular to
// the fixture's own transectBearingDeg=245°, so the fitted offshore bearing
// lands exactly on 245° — same rotation the pre-C3 footprint-model tests
// expected, letting the buffer/rotation math stay comparable while the
// SOURCE of the bearing changes from "one row's own field" to "the fitted
// transform"). Origins run NORTH as alongshoreM increases (row 0 = south),
// spaced 50 m apart along the tangent, near Huntington City Beach Pier
// (33.6534, -118.0039 area, per the plan's named ground-truth anchor).
// ---------------------------------------------------------------------------
const ORIGIN_REF_LAT = 33.6595;
const ORIGIN_REF_LON = -118.0064;
const ORIGIN_TANGENT_BEARING_DEG = 335; // perpendicular to transectBearingDeg=245
const ORIGIN_STEP_M = 50;
function originForRow(i: number): { lat: number; lon: number } {
  const bearingRad = (ORIGIN_TANGENT_BEARING_DEG * Math.PI) / 180;
  const eastM = i * ORIGIN_STEP_M * Math.sin(bearingRad);
  const northM = i * ORIGIN_STEP_M * Math.cos(bearingRad);
  const cosLat = Math.cos((ORIGIN_REF_LAT * Math.PI) / 180);
  return {
    lat: ORIGIN_REF_LAT + northM / 111320,
    lon: ORIGIN_REF_LON + eastM / (111320 * cosLat),
  };
}
function buildRowWithOrigin(transectIndex: number): HeatMapTransectData {
  const origin = originForRow(transectIndex);
  return {
    ...buildRow(transectIndex),
    originLat: origin.lat,
    originLon: origin.lon,
    alongshoreM: transectIndex * ORIGIN_STEP_M,
  };
}
const OK_RESPONSE_5_ROWS_WITH_ORIGINS: HeatMapProfileDataOk = {
  ...OK_RESPONSE_5_ROWS,
  profiles: [0, 1, 2, 3, 4].map(buildRowWithOrigin),
};

// D7s median-5 smoothing fixture — 5 rows, one segment per row (2 transect
// points each, same shape as buildRow above). Row 2 is "zeroed out" (a real
// model-failure pattern per the operator's standing request: "so a few
// transects zeroing out does not make a difference"). Hand-computed
// expected medians (radius-2 window, clamped at the row-count edge, values
// sorted ascending):
//   row0 window=[row0,row1,row2]           hs=[0.0,1.0,1.1]      -> median 1.0
//   row2 window=[row0,row1,row2,row3,row4] hs=[0.0,1.0,1.1,1.3,1.4] -> median 1.1
//   row4 window=[row2,row3,row4]           hs=[0.0,1.3,1.4]      -> median 1.3
// (row1/row3 fall on an even-count window with a fractional midpoint —
// intentionally not asserted here to avoid Intl rounding ambiguity; row0/
// row2/row4 give unambiguous single-value medians.)
const SMOOTHING_HS = [1.0, 1.1, 0.0, 1.3, 1.4];
function buildSmoothingRow(transectIndex: number, hsOffshore: number): HeatMapTransectData {
  return {
    transectIndex,
    isStructureAffected: false,
    transectBearingDeg: 245,
    transect: [
      { distance: 100, depth: 3, hs: hsOffshore },
      { distance: 10, depth: 0.5, hs: hsOffshore * 0.8 },
    ],
    breakPoints: [],
    waveShapes: [],
    surfZones: null,
    jackingFactors: [],
    handoffDepthM: 2,
    handoffSourceLevel: 'L3',
  };
}
const OK_RESPONSE_SMOOTHING: HeatMapProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-08-05T00:00:00Z',
  modelStatus: 'ok',
  profiles: SMOOTHING_HS.map((hs, i) => buildSmoothingRow(i, hs)),
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'ft', y: 'ft' },
    verticalDatum: 'NAVD88',
    transectCount: 5,
    openTransectCount: 5,
    handoffDepthM: 2,
    handoffSourceLevel: 'L3',
  },
};

// D5-audit MAJOR remediation KAT (auditor's exact gap scenario): 20
// conceptual transects (0..19) with #5 MISSING — marine filters failed
// transects out of per_transect entirely (surf_1d_pipeline.py:1683), so
// `rows` here has 19 entries, not 20, and `rows[i].transectIndex !== i`
// for every i >= 5. Zone [10, 12], representative 11. Expected (worked by
// hand, matching the auditor's own numbers): representative transectIndex
// 11 sits at ARRAY POSITION 10 (positions: 0->tI0, 1->tI1, ..., 4->tI4,
// 5->tI6, 6->tI7, 7->tI8, 8->tI9, 9->tI10, 10->tI11, 11->tI12, ...) — NOT
// position 11 (which is what the pre-remediation value-as-position bug
// would have used). Zone members (transectIndex 10, 11, 12) sit at
// positions 9, 10, 11.
const GAP_ROWS: HeatMapTransectData[] = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(buildRow);
const OK_RESPONSE_GAP: HeatMapProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-08-02T00:00:00Z',
  modelStatus: 'ok',
  profiles: GAP_ROWS,
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'm', y: 'm' },
    verticalDatum: 'LMSL',
    transectCount: 20,
    openTransectCount: 19,
    handoffDepthM: 2,
    handoffSourceLevel: 'L3',
  },
};
// Mirrors HeatMapCard.tsx's rowToY()/PAD_TOP/ROW_H_MIN/ROW_H_MAX — not
// exported, restated here so the gap-KAT can assert exact pixel positions
// rather than just "some rect exists somewhere".
const GAP_PAD_TOP = 28;
const GAP_ROW_H = Math.min(48, Math.max(8, Math.floor(300 / GAP_ROWS.length))); // 19 rows -> 15
function gapRowToY(pos: number): number {
  return GAP_PAD_TOP + pos * GAP_ROW_H;
}

// Tier-selection parity fix (2026-08-02) — see the test using this fixture,
// below, for the full rationale. Two rows, each with ONE negative break
// point (-223, -240 — same real Huntington Beach numbers as the
// BeachProfileChart fixture), transects extending out to 2227m offshore
// (the pre-fix full-extent fallback distance from the bug report).
const ROW_NEG_A: HeatMapTransectData = {
  transectIndex: 0,
  isStructureAffected: false,
  transectBearingDeg: 245,
  transect: [
    { distance: 2227, depth: 15, hs: 3.5 },
    { distance: 300, depth: 3, hs: 1.5 },
    { distance: 0, depth: 0.5, hs: 0.3 },
    { distance: -223, depth: 0.05, hs: 0.02 },
  ],
  breakPoints: [
    { distance: -223, depth: 0.05, hs: 0.02, breakerType: 'spilling' },
  ],
  waveShapes: [],
  surfZones: null,
  jackingFactors: [],
  handoffDepthM: 0.05,
  handoffSourceLevel: 'L4',
};

const ROW_NEG_B: HeatMapTransectData = {
  transectIndex: 1,
  isStructureAffected: false,
  transectBearingDeg: 245,
  transect: [
    { distance: 2227, depth: 15, hs: 3.5 },
    { distance: 300, depth: 3, hs: 1.5 },
    { distance: 0, depth: 0.5, hs: 0.3 },
    { distance: -240, depth: 0.02, hs: 0.01 },
  ],
  breakPoints: [
    { distance: -240, depth: 0.02, hs: 0.01, breakerType: 'spilling' },
  ],
  waveShapes: [],
  surfZones: null,
  jackingFactors: [],
  handoffDepthM: 0.02,
  handoffSourceLevel: 'L4',
};

const OK_RESPONSE_ALL_NEGATIVE_BREAKS: HeatMapProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-08-02T00:00:00Z',
  modelStatus: 'ok',
  profiles: [ROW_NEG_A, ROW_NEG_B],
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'm', y: 'm' },
    verticalDatum: 'LMSL',
    transectCount: 2,
    openTransectCount: 2,
    handoffDepthM: 0.05,
    handoffSourceLevel: 'L4',
  },
};

// ---------------------------------------------------------------------------
// H0 (2026-08-10, MARINE-PAGE-FIXIT-PLAN §H0, the C3S recorded next-session
// action) — registration known-answer fixture. PIER_BASE is the same
// pier-base coordinate the C3 GROUND-TRUTH block below already treats as the
// operator's named ground-truth anchor (see that block's "independent check"
// test) — used HERE as the served `originLat`/`originLon` of row 0 (the
// "pier-base transect origin served by the profile endpoint"), so the KAT
// exercises a REAL served ground anchor, not a synthetic point unrelated to
// the data contract.
// ---------------------------------------------------------------------------
const H0_PIER_BASE: LatLon = { lat: 33.6568667, lon: -118.0024017 };
const H0_TANGENT_BEARING_DEG = 335; // perpendicular to transectBearingDeg=245, same convention as ORIGIN_TANGENT_BEARING_DEG above
const H0_STEP_M = 50;
function h0OriginForRow(i: number): { lat: number; lon: number } {
  const bearingRad = (H0_TANGENT_BEARING_DEG * Math.PI) / 180;
  const cosLat = Math.cos((H0_PIER_BASE.lat * Math.PI) / 180);
  return {
    lat: H0_PIER_BASE.lat + (i * H0_STEP_M * Math.cos(bearingRad)) / 111320,
    lon: H0_PIER_BASE.lon + (i * H0_STEP_M * Math.sin(bearingRad)) / (111320 * cosLat),
  };
}
function h0BuildRow(i: number): HeatMapTransectData {
  const origin = h0OriginForRow(i);
  return {
    transectIndex: i,
    isStructureAffected: false,
    transectBearingDeg: 245,
    transect: [
      { distance: 100, depth: 3, hs: 1.2 },
      { distance: 10, depth: 0.5, hs: 0.8 },
    ],
    breakPoints: [],
    waveShapes: [],
    surfZones: null,
    jackingFactors: [],
    handoffDepthM: 2,
    handoffSourceLevel: 'L3',
    originLat: origin.lat,
    originLon: origin.lon,
    alongshoreM: i * H0_STEP_M,
  };
}
// Row 0's origin is h0OriginForRow(0) === H0_PIER_BASE exactly (i=0 -> zero
// offset) — the served anchor IS the pier-base point.
const H0_RESPONSE: HeatMapProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-08-10T00:00:00Z',
  modelStatus: 'ok',
  profiles: [0, 1].map(h0BuildRow),
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'm', y: 'm' },
    verticalDatum: 'LMSL',
    transectCount: 2,
    openTransectCount: 2,
    handoffDepthM: 2,
    handoffSourceLevel: 'L3',
  },
};

// ---------------------------------------------------------------------------
// H-ACCEPT-STRUCK fix (2026-08-1x) — operator: "waves breaking in the
// middle of the beach". Root cause (verified against the live payload, row
// transectIndex 81): served transect points run to distance -235.7m
// (landward of the waterline), carrying residual near-zero hs (~0.013m at
// 0.03m depth) — the 1D model's domain runs to HAT, so this dry-beach
// padding exists on every row. Reproduces the LIVE numbers (not a
// synthetic guess), with "wet" points (hs 0.3-1.5) all at/seaward of
// waterlineDistance=0, and two dry-beach padding points landward of it
// mirroring the live shape (-50m/hs 0.05, -235.7m/hs 0.013 — the exact
// live distance/depth pairing).
// ---------------------------------------------------------------------------
function buildDryPaddingRow(transectIndex: number): HeatMapTransectData {
  return {
    transectIndex,
    isStructureAffected: false,
    transectBearingDeg: 245,
    transect: [
      { distance: 100, depth: 5, hs: 1.5 },
      { distance: 20, depth: 1, hs: 0.8 },
      { distance: 0, depth: 0.5, hs: 0.3 },
      { distance: -50, depth: 0.1, hs: 0.05 },
      { distance: -235.7, depth: 0.03, hs: 0.013 },
    ],
    breakPoints: [],
    waveShapes: [],
    surfZones: null,
    jackingFactors: [],
    handoffDepthM: 2,
    handoffSourceLevel: 'L3',
    waterlineDistance: 0,
  };
}
const OK_RESPONSE_DRY_PADDING: HeatMapProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-08-11T00:00:00Z',
  modelStatus: 'ok',
  profiles: [0, 1].map(buildDryPaddingRow),
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'm', y: 'm' },
    verticalDatum: 'LMSL',
    transectCount: 2,
    openTransectCount: 2,
    handoffDepthM: 2,
    handoffSourceLevel: 'L3',
  },
};

const FETCH_ERROR = new Error('404: Surf location not found');

const baseProps = {
  heightUnit: 'ft',
  distanceUnit: 'ft',
  locale: 'en',
};

describe('HeatMapCard', () => {
  it('loading: renders a loading indicator, no alert, no chart', () => {
    const { queryByRole } = render(
      <HeatMapCard {...baseProps} data={null} loading={true} />,
    );
    expect(queryByRole('alert')).toBeNull();
    expect(queryByRole('img')).toBeNull();
  });

  it('error: renders role="alert" with destructive text and a working retry button', () => {
    const onRetry = vi.fn();
    const { getByRole } = render(
      <HeatMapCard {...baseProps} data={null} loading={false} error={FETCH_ERROR} onRetry={onRetry} />,
    );
    const alert = getByRole('alert');
    expect(alert.textContent).toContain('surfing.heatMap.loadError');

    getByRole('button', { name: 'retry' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error takes priority even when stale "ok" data is still cached', () => {
    // Mirrors useApiQuery's real behavior: a background refetch failure sets
    // `error` without clearing previously cached `data`. The error must
    // still win so a visitor is told the fetch failed, not shown a
    // silently-stale chart.
    const { getByRole, queryByRole } = render(
      <HeatMapCard {...baseProps} data={OK_RESPONSE} loading={false} error={FETCH_ERROR} />,
    );
    expect(getByRole('alert')).toBeDefined();
    expect(queryByRole('img')).toBeNull();
  });

  it('modelStatus "unavailable": renders informational text with NO alert role, and does not throw on profiles: null', () => {
    let queryByRole: ReturnType<typeof render>['queryByRole'];
    let getByText: ReturnType<typeof render>['getByText'];
    expect(() => {
      ({ queryByRole, getByText } = render(
        <HeatMapCard {...baseProps} data={UNAVAILABLE_RESPONSE} loading={false} />,
      ));
    }).not.toThrow();
    expect(queryByRole!('alert')).toBeNull();
    expect(getByText!('surfing.heatMap.modelUnavailable')).toBeDefined();
  });

  it('modelStatus "ok": renders the SVG heat map (role="img"), not an error or unavailable message', () => {
    const { getByRole, queryByRole, queryByText } = render(
      <HeatMapCard {...baseProps} data={OK_RESPONSE} loading={false} />,
    );
    expect(getByRole('img')).toBeDefined();
    expect(queryByRole('alert')).toBeNull();
    expect(queryByText('surfing.heatMap.modelUnavailable')).toBeNull();
  });

  it('no data yet (skip / not fetched): renders the pre-existing generic empty state, not an alert', () => {
    const { queryByRole, getByText } = render(
      <HeatMapCard {...baseProps} data={null} loading={false} />,
    );
    expect(queryByRole('alert')).toBeNull();
    expect(getByText('surfing.heatMapNoData')).toBeDefined();
  });

  // TA-C19 / D4.2: negative `distance` values (landward of the reference
  // waterline, ADR-093 Amendment 4) must render INSIDE the chart's drawable
  // area, not merely "not throw" — a negative distance previously computed
  // an SVG x past the right edge (off-canvas) because the x-domain's min was
  // hardcoded to 0. Every <rect> in the rendered SVG (colour cells, zone
  // fills, chart background, legend) must stay within [PAD_LEFT, PAD_LEFT +
  // CHART_W] now that the domain extends to the true observed minimum.
  it('negative distance (TA-C19): every rendered cell stays within the drawable area', () => {
    const { container } = render(
      <HeatMapCard {...baseProps} data={OK_RESPONSE_NEGATIVE_DISTANCE} loading={false} />,
    );
    const rects = container.querySelectorAll('svg rect');
    expect(rects.length).toBeGreaterThan(0);
    const EPSILON = 0.5; // SVG coordinates are rounded/toFixed(1) — allow sub-pixel slack.
    for (const rect of Array.from(rects)) {
      const x = Number(rect.getAttribute('x'));
      const width = Number(rect.getAttribute('width'));
      expect(Number.isNaN(x)).toBe(false);
      expect(Number.isNaN(width)).toBe(false);
      expect(x).toBeGreaterThanOrEqual(PAD_LEFT - EPSILON);
      expect(x + width).toBeLessThanOrEqual(PAD_LEFT + CHART_W + EPSILON);
    }
  });

  // D5.1 — real live double-break transect (transectIndex 4, also carries
  // negative-distance points). Confirms splitBreakPoints() (outer/inner)
  // and the negative-distance domain fix both hold together on genuine
  // multi-bar data — the first time this has been replayed through the
  // component with real double-break data.
  it('double-break (D5.1, live transectIndex 4): both break points appear in the sr-only table, all coordinates in-canvas', () => {
    const { container, getByText } = render(
      <HeatMapCard {...baseProps} data={OK_RESPONSE_DOUBLE_BREAK} loading={false} />,
    );
    // sr-only table's break-distance cell joins all breakPoints with ', ' —
    // two live break distances (42.06m outer, 24.87m rounded to 1dp by fmtNum).
    const cell = getByText(/42\.1, 24\.9/);
    expect(cell).toBeDefined();

    const EPSILON = 0.5;
    const rects = container.querySelectorAll('svg rect');
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of Array.from(rects)) {
      const x = Number(rect.getAttribute('x'));
      const width = Number(rect.getAttribute('width'));
      expect(x).toBeGreaterThanOrEqual(PAD_LEFT - EPSILON);
      expect(x + width).toBeLessThanOrEqual(PAD_LEFT + CHART_W + EPSILON);
    }
  });

  // C3S (2026-08-09 PM, single-scale fix) — REPLACES the old "tier
  // selection parity" test. The tier concept (BeachProfileChart-mirrored
  // 100/300/1000m clipping) is DELETED per the C3S design: the operator's
  // bug was exactly this class of independently-derived scale/clipping
  // logic producing a DIFFERENT ruler than the rest of the chart. Now the
  // far 2227m point (which the old tier system would have clipped
  // entirely, capping the visible axis at 300) RENDERS — the frame is built
  // FROM the true data extent (min -240, max 2227), so nothing is clipped
  // and nothing overflows the drawable area, by construction.
  // Falsifiable: reverting to tier-based clipping would either throw (no
  // `tier` in scope) or clip the far point back out of [PAD_LEFT,
  // PAD_LEFT+CHART_W] at a different (smaller) x than asserted below.
  it('C3S — no tier clipping: the full ~2227m data extent renders inside the frame, at the single ground scale S', () => {
    const { container } = render(
      <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_ALL_NEGATIVE_BREAKS} loading={false} />,
    );
    // Excludes the break-zone-band rect (fill=ZONE_BREAK_FILL): a
    // PRE-EXISTING, unrelated overflow in break-point rendering (bx +/- a
    // fixed 5%-of-chart-width halfW, no edge clamp) — not introduced by
    // C3S, and break-point rendering is out of scope for this task (MUST
    // NOT TOUCH), same exclusion the test this replaces already carried.
    const ZONE_BREAK_FILL = 'rgba(59, 130, 246, 0.12)';
    const EPSILON = 0.5;
    const rects = Array.from(container.querySelectorAll('svg rect'))
      .filter((r) => r.getAttribute('fill') !== ZONE_BREAK_FILL);
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      const x = Number(rect.getAttribute('x'));
      const width = Number(rect.getAttribute('width'));
      expect(x).toBeGreaterThanOrEqual(PAD_LEFT - EPSILON);
      expect(x + width).toBeLessThanOrEqual(PAD_LEFT + CHART_W + EPSILON);
    }

    // The far 2227m point is now the frame's offshore-most DATA extent
    // (both rows share it) — it sits exactly 50m (the ground buffer) short
    // of the frame's own offshore edge, at the SAME scale S every other
    // element on this chart uses. Independent formula (not imported from
    // the component): dataMin=-240 (ROW_NEG_B), dataMax=2227 (both rows).
    const dataMinM = -240;
    const dataMaxM = 2227;
    const frameMinM = dataMinM - 50;
    const frameMaxM = dataMaxM + 50;
    const S = 748 / (frameMaxM - frameMinM);
    const expectedXOfFarPoint = PAD_LEFT + (frameMaxM - dataMaxM) * S;
    const cellRects = rects.filter((r) => /^rgba\(\d+,\d+,\d+,[\d.]+\)$/.test(r.getAttribute('fill') ?? ''));
    expect(cellRects.length).toBeGreaterThan(0);
    const minX = Math.min(...cellRects.map((r) => Number(r.getAttribute('x'))));
    expect(minX).toBeCloseTo(expectedXOfFarPoint, 0);
  });

  // ── D5.2 — BD-7 overlay (BD-9 representative-transect marker removed
  //    from the render, operator ruling 2026-08-02 — "the user of the site
  //    will not [know what that means]"). BD-9-specific tests below were
  //    updated to assert the marker/label/legend/suffix does NOT render
  //    even when `representativeTransectIndex` is still passed — proving
  //    the now-unused prop is harmlessly ignored, not that it crashes. ──
  describe('D5.2 — BD-7/BD-9 overlays', () => {
    it('renders the main-break-zone band (purple rect) spanning the given row range when both bounds are present', () => {
      const { container } = render(
        <HeatMapCard
          {...baseProps}
          data={OK_RESPONSE_5_ROWS}
          loading={false}
          mainBreakZoneStartIndex={1}
          mainBreakZoneEndIndex={3}
        />,
      );
      // Filter on width=6 too — the legend swatch below (width=14) shares
      // the same fill colour, and this query must isolate the GUTTER BAND
      // specifically, not "any purple rect".
      const bandRects = Array.from(container.querySelectorAll('svg rect'))
        .filter((r) => r.getAttribute('fill') === MAIN_BREAK_ZONE_FILL && r.getAttribute('width') === '6');
      expect(bandRects.length).toBe(1);
      // Band must be in the Y-axis gutter (x < PAD_LEFT), never over the colour cells.
      const x = Number(bandRects[0].getAttribute('x'));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(PAD_LEFT);
    });

    it('does NOT render the band when either bound is null (old/pre-Round-2 payload) — byte-identical to no-overlay render', () => {
      const withOverlay = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} mainBreakZoneStartIndex={null} mainBreakZoneEndIndex={null} representativeTransectIndex={null} />,
      );
      const withoutOverlayProp = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} />,
      );
      const bandA = Array.from(withOverlay.container.querySelectorAll('svg rect')).filter((r) => r.getAttribute('fill') === MAIN_BREAK_ZONE_FILL);
      const bandB = Array.from(withoutOverlayProp.container.querySelectorAll('svg rect')).filter((r) => r.getAttribute('fill') === MAIN_BREAK_ZONE_FILL);
      expect(bandA.length).toBe(0);
      expect(bandB.length).toBe(0);
      // Same total SVG markup length either way (explicit null vs. omitted prop) — proves the default-prop path and explicit-null path are identical, and neither adds the overlay legend's extra bottom padding.
      expect(withOverlay.container.querySelector('svg[role="img"]')?.getAttribute('viewBox'))
        .toBe(withoutOverlayProp.container.querySelector('svg[role="img"]')?.getAttribute('viewBox'));
    });

    // BD-9 removed from the render (operator ruling 2026-08-02) — the
    // triangle marker and bolded row label no longer appear, even when
    // representativeTransectIndex is passed. `representativeTransectIndex`
    // stays in HeatMapCardProps for caller compatibility; the component
    // just never reads it now.
    it('ignores representativeTransectIndex: no triangle marker, no bolded row label', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} representativeTransectIndex={2} />,
      );
      const triangle = Array.from(container.querySelectorAll('svg polygon'))
        .find((p) => p.getAttribute('fill') === 'var(--foreground)');
      expect(triangle).toBeUndefined();
      const texts = Array.from(container.querySelectorAll('svg text'));
      const allLabels = texts.filter((el) => ['0', '1', '2', '3', '4'].includes(el.textContent ?? ''));
      expect(allLabels.length).toBeGreaterThan(0);
      for (const el of allLabels) {
        expect(el.getAttribute('font-weight')).toBeNull();
      }
    });

    // D5-audit MAJOR remediation: range-guards are now MEMBERSHIP-based
    // (does any row's transectIndex fall in [start..end]?), not a bounds
    // check against N. A huge endIndex (e.g. 999) is NOT automatically
    // invalid — if the zone's lower bound still overlaps real rows, the
    // visible portion of the zone legitimately renders (this is correct:
    // the zone conceptually extends beyond what this response's own
    // transect set covers). The only genuinely "no band" case is when
    // NO row's transectIndex falls in the range at all.
    it('a partially out-of-range zone (huge endIndex) still renders the band over the rows that DO fall in range', () => {
      expect(() => render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} mainBreakZoneStartIndex={1} mainBreakZoneEndIndex={999} />,
      )).not.toThrow();
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} mainBreakZoneStartIndex={1} mainBreakZoneEndIndex={999} />,
      );
      // OK_RESPONSE_5_ROWS has transectIndex 0..4 — rows 1,2,3,4 fall in
      // [1, 999], row 0 does not. Band should cover array positions 1..4.
      const bandRects = Array.from(container.querySelectorAll('svg rect'))
        .filter((r) => r.getAttribute('fill') === MAIN_BREAK_ZONE_FILL && r.getAttribute('width') === '6');
      expect(bandRects.length).toBe(1);
    });

    it('range-guard: a zone range that matches NO row does not crash and does not render the band', () => {
      expect(() => render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} mainBreakZoneStartIndex={500} mainBreakZoneEndIndex={999} />,
      )).not.toThrow();
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} mainBreakZoneStartIndex={500} mainBreakZoneEndIndex={999} />,
      );
      const bandRects = Array.from(container.querySelectorAll('svg rect')).filter((r) => r.getAttribute('fill') === MAIN_BREAK_ZONE_FILL);
      expect(bandRects.length).toBe(0);
    });

    it('byte-identity (D5-audit MINOR remediation): no row label carries a font-weight attribute when no overlay is present at all', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} />,
      );
      // Scope to row labels specifically (text-anchor="end") — X-axis tick
      // labels (text-anchor="middle") can coincidentally share the same
      // digit text ("0"..."4") and would otherwise over-count matches.
      const texts = Array.from(container.querySelectorAll('svg text[text-anchor="end"]'));
      const labelled = texts.filter((el) => ['0', '1', '2', '3', '4'].includes(el.textContent ?? ''));
      expect(labelled.length).toBe(5);
      for (const el of labelled) {
        expect(el.hasAttribute('font-weight')).toBe(false);
      }
    });

    it('an out-of-bounds representativeTransectIndex does not crash and renders no bold label (prop ignored regardless of value)', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} representativeTransectIndex={999} />,
      );
      const texts = Array.from(container.querySelectorAll('svg text'));
      expect(texts.some((el) => el.getAttribute('font-weight') === '700')).toBe(false);
    });

    it('legend text (key names): main-break-zone legend present only when that overlay is shown; representative legend never renders', () => {
      // "mainBreakZoneLegend" is deliberately reused for BOTH the SVG
      // legend label and the sr-only table's column header (same phrase,
      // two locations) — getAllByText/queryAllByText for it, not the
      // singular form which requires exactly one match. Each render()'s
      // queries are scoped via within(container) — RTL's default bound
      // queries search the whole document.body, and this test calls
      // render() three times, so unscoped queries would pick up matches
      // left over from an earlier render() in the same test.
      const { container: zoneContainer } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} mainBreakZoneStartIndex={1} mainBreakZoneEndIndex={3} />,
      );
      expect(within(zoneContainer).getAllByText('surfing.heatMap.mainBreakZoneLegend').length).toBe(2);
      expect(within(zoneContainer).queryByText('surfing.heatMap.representativeLegend')).toBeNull();

      // BD-9 removed (operator ruling 2026-08-02) — representativeLegend
      // never renders, even when representativeTransectIndex is passed.
      const { container: repContainer } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} representativeTransectIndex={2} />,
      );
      expect(within(repContainer).queryByText('surfing.heatMap.representativeLegend')).toBeNull();
      expect(within(repContainer).queryAllByText('surfing.heatMap.mainBreakZoneLegend').length).toBe(0);

      const { container: noOverlayContainer } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} />,
      );
      expect(within(noOverlayContainer).queryAllByText('surfing.heatMap.mainBreakZoneLegend').length).toBe(0);
      expect(within(noOverlayContainer).queryByText('surfing.heatMap.representativeLegend')).toBeNull();
    });

    it('sr-only table: "Main break zone" column present only with zone data; representative suffix never renders (BD-9 removed)', () => {
      const { container: withOverlayContainer } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} mainBreakZoneStartIndex={1} mainBreakZoneEndIndex={3} representativeTransectIndex={2} />,
      );
      // Column header present (+ the SVG legend label — same key, 2 matches).
      expect(within(withOverlayContainer).getAllByText('surfing.heatMap.mainBreakZoneLegend').length).toBe(2);
      // BD-9 removed (operator ruling 2026-08-02) — the "(representative)"
      // suffix never renders, even with representativeTransectIndex passed.
      expect(within(withOverlayContainer).queryByText(/representativeSuffix/)).toBeNull();

      const { container: noOverlayContainer } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} />,
      );
      expect(within(noOverlayContainer).queryAllByText('surfing.heatMap.mainBreakZoneLegend').length).toBe(0);
      expect(within(noOverlayContainer).queryByText(/representativeSuffix/)).toBeNull();
    });

    // D5-audit MAJOR remediation KAT — the auditor's exact gap scenario.
    // Falsifiable (BD-7 band): reverting the fix (using
    // rowToY(mainBreakZoneStartIndex, ...) directly, i.e. VALUE as
    // POSITION) would place the band at positions 10..12 instead of 9..11 —
    // every band assertion below would fail. Also still passes
    // representativeTransectIndex={11} (harmlessly ignored, BD-9 removed —
    // operator ruling 2026-08-02) to prove an old caller's prop doesn't
    // resurrect any rendering or break the BD-7 gap-position fix.
    it('gap KAT: 20 conceptual transects, #5 missing (19 rows), zone [10,12] — SVG band position and sr-only table agree by construction; no BD-9 marker', () => {
      const { container } = render(
        <HeatMapCard
          {...baseProps}
          data={OK_RESPONSE_GAP}
          loading={false}
          mainBreakZoneStartIndex={10}
          mainBreakZoneEndIndex={12}
          representativeTransectIndex={11}
        />,
      );

      // BD-9 removed — no triangle marker at all, regardless of the prop.
      const triangle = Array.from(container.querySelectorAll('svg polygon'))
        .find((p) => p.getAttribute('fill') === 'var(--foreground)');
      expect(triangle).toBeUndefined();

      // ── Band: must cover exactly array positions 9..11 (the rows whose
      // transectIndex values are 10, 11, 12), not positions 10..12 (where
      // the value-as-position bug would have put it — one row's height too
      // low and covering the wrong transects entirely). ──
      const expectedBandY = gapRowToY(9);
      const expectedBandHeight = gapRowToY(11 + 1) - gapRowToY(9); // 3 rows tall
      const bandRect = Array.from(container.querySelectorAll('svg rect'))
        .find((r) => r.getAttribute('fill') === MAIN_BREAK_ZONE_FILL && r.getAttribute('width') === '6');
      expect(bandRect).toBeDefined();
      expect(Number(bandRect!.getAttribute('y'))).toBeCloseTo(expectedBandY, 5);
      expect(Number(bandRect!.getAttribute('height'))).toBeCloseTo(expectedBandHeight, 5);

      // ── sr-only table agreement: the same three transects (VALUES 10,
      // 11, 12) are flagged "Yes" in the Main break zone column — proving
      // the SVG (position-based) and the table (value-based) describe the
      // SAME underlying rows, not merely "some band exists somewhere". No
      // row carries the representative suffix (BD-9 removed). ──
      const rows = Array.from(container.querySelectorAll('table.sr-only tbody tr'));
      expect(rows.length).toBe(19);
      for (const row of rows) {
        const th = row.querySelector('th[scope="row"]');
        const cells = row.querySelectorAll('td');
        const inZoneCell = cells[cells.length - 1]; // last column = "Main break zone"
        const transectIndexText = th?.textContent ?? '';
        expect(transectIndexText).not.toContain('representativeSuffix');
        const rowValue = parseInt(transectIndexText, 10);
        const shouldBeInZone = rowValue >= 10 && rowValue <= 12;
        expect(inZoneCell.textContent).toBe(shouldBeInZone ? 'yes' : 'no');
      }
    });
  });

  // ── LM-2 (2026-08-03) — orthophoto background imagery. Plan §LM-2 KATs
  //    (a)-(d) plus plan item (e) null-safety, verbatim from the brief. ──
  describe('LM-2 — orthophoto background imagery', () => {
    // Mirrors HeatMapCard.tsx's IMAGERY_ZOOM_MIN/MAX/MOSAIC_MAX_TILES_PER_SIDE
    // and HEATMAP_CELL_OPACITY_ON_ORTHO/DEFAULT — not exported, restated here
    // (same convention this file already uses for PAD_LEFT/CHART_W/etc.).
    const IMAGERY_ZOOM_MIN = 14;
    const IMAGERY_ZOOM_MAX = 19;
    // H1 (2026-08-10, MARINE-PAGE-FIXIT-PLAN §H1) raised the tile budget 4 -> 8.
    const IMAGERY_MOSAIC_MAX_TILES_PER_SIDE = 8;
    const HEATMAP_CELL_OPACITY_ON_ORTHO = 0.55;

    const SPOT_LAT = 33.6595;
    const SPOT_LON = -118.0064;

    // KAT (b) golden fixture — C3S (2026-08-09 PM, single-scale fix)
    // RE-CAPTURED against the new component (OK_RESPONSE_5_ROWS + baseProps,
    // no ground-origin fields -> falls back to the pre-C3 uniform-index Y
    // grid, but the X axis now goes through the ONE ground scale S — the
    // frame is built from this fixture's own data extent [10ft,100ft] + the
    // 50m ground buffer both sides, replacing the old tier-clipped
    // stretch-to-fill values. Captured via a throwaway render + innerHTML
    // dump, not hand-typed (same capture method as the original KAT (b)).
    // H3/H4 (2026-08-10, MARINE-PAGE-FIXIT-PLAN) re-capture — same capture
    // method as before (throwaway render + innerHTML dump, not hand-typed).
    // Changes from the prior golden: the header row now includes the
    // info-icon trigger button (H3); the SVG wrapper carries the H4 scroll
    // constraint (overflow-y-auto + max-height); the smoothing-note <p>
    // below the SVG is GONE (H3 — moved into the info-icon modal, which
    // renders nothing in the DOM until opened, so this "no imagery" golden
    // is unaffected by the modal's own content).
    const GOLDEN_NO_IMAGERY_HTML = '<div class="rounded-xl bg-[var(--card-glass)] p-[var(--card-pad)]"><div class="flex items-center justify-between mb-3"><h3 class="font-semibold text-[var(--foreground)] text-sm">surfing.heatMapTitle</h3><button type="button" aria-label="surfing.heatMap.infoButtonLabel" class="shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus:outline-none rounded" style="min-width: 44px; min-height: 44px;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z"></path></svg></button></div><div class="w-full overflow-x-auto overflow-y-auto" style="max-height: 32rem;"><svg role="img" aria-labelledby="_r_0_ _r_1_" viewBox="0 0 820 320" width="100%" style="display: block; min-width: 260px;"><title id="_r_0_">surfing.heatMapAriaLabel</title><desc id="_r_1_">surfing.heatMapDesc</desc><defs></defs><rect x="60" y="28" width="748" height="240" fill="var(--card-glass)" opacity="0.3"></rect><line x1="60" y1="28" x2="808" y2="28" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><line x1="60" y1="76" x2="808" y2="76" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><line x1="60" y1="124" x2="808" y2="124" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><line x1="60" y1="172" x2="808" y2="172" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><line x1="60" y1="220" x2="808" y2="220" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><line x1="60" y1="268" x2="808" y2="268" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><rect x="504.4463696290697" y="28" width="10.063767089867099" height="24" fill="rgba(176,184,33,0.85)"><title>0.8 ft</title></rect><rect x="504.4463696290697" y="52" width="10.063767089867099" height="24" fill="rgba(176,184,33,0.85)"><title>0.8 ft</title></rect><rect x="494.3826025392026" y="28" width="10.063767089867099" height="24" fill="rgba(192,183,26,0.85)"><title>0.8 ft</title></rect><rect x="494.3826025392026" y="52" width="10.063767089867099" height="24" fill="rgba(192,183,26,0.85)"><title>0.8 ft</title></rect><rect x="484.3188354493355" y="28" width="10.063767089867099" height="24" fill="rgba(209,181,19,0.85)"><title>0.9 ft</title></rect><rect x="484.3188354493355" y="52" width="10.063767089867099" height="24" fill="rgba(209,181,19,0.85)"><title>0.9 ft</title></rect><rect x="474.25506835946845" y="28" width="10.063767089867042" height="24" fill="rgba(226,180,12,0.85)"><title>0.9 ft</title></rect><rect x="474.25506835946845" y="52" width="10.063767089867042" height="24" fill="rgba(226,180,12,0.85)"><title>0.9 ft</title></rect><rect x="464.19130126960124" y="28" width="10.063767089867213" height="24" fill="rgba(233,173,9,0.85)"><title>0.9 ft</title></rect><rect x="464.19130126960124" y="52" width="10.063767089867213" height="24" fill="rgba(233,173,9,0.85)"><title>0.9 ft</title></rect><rect x="454.1275341797342" y="28" width="10.063767089867042" height="24" fill="rgba(232,161,12,0.85)"><title>0.9 ft</title></rect><rect x="454.1275341797342" y="52" width="10.063767089867042" height="24" fill="rgba(232,161,12,0.85)"><title>0.9 ft</title></rect><rect x="444.0637670898671" y="28" width="10.063767089867099" height="24" fill="rgba(231,150,14,0.85)"><title>1 ft</title></rect><rect x="444.0637670898671" y="52" width="10.063767089867099" height="24" fill="rgba(231,150,14,0.85)"><title>1 ft</title></rect><rect x="433.99999999999994" y="28" width="10.063767089867156" height="24" fill="rgba(230,138,17,0.85)"><title>1 ft</title></rect><rect x="433.99999999999994" y="52" width="10.063767089867156" height="24" fill="rgba(230,138,17,0.85)"><title>1 ft</title></rect><rect x="423.93623291013284" y="28" width="10.063767089867099" height="24" fill="rgba(229,126,19,0.85)"><title>1 ft</title></rect><rect x="423.93623291013284" y="52" width="10.063767089867099" height="24" fill="rgba(229,126,19,0.85)"><title>1 ft</title></rect><rect x="413.87246582026575" y="28" width="10.063767089867099" height="24" fill="rgba(228,114,22,0.85)"><title>1 ft</title></rect><rect x="413.87246582026575" y="52" width="10.063767089867099" height="24" fill="rgba(228,114,22,0.85)"><title>1 ft</title></rect><rect x="403.80869873039865" y="28" width="10.063767089867099" height="24" fill="rgba(226,103,24,0.85)"><title>1.1 ft</title></rect><rect x="403.80869873039865" y="52" width="10.063767089867099" height="24" fill="rgba(226,103,24,0.85)"><title>1.1 ft</title></rect><rect x="393.74493164053155" y="28" width="10.063767089867099" height="24" fill="rgba(225,91,27,0.85)"><title>1.1 ft</title></rect><rect x="393.74493164053155" y="52" width="10.063767089867099" height="24" fill="rgba(225,91,27,0.85)"><title>1.1 ft</title></rect><rect x="383.6811645506644" y="28" width="10.063767089867156" height="24" fill="rgba(224,79,29,0.85)"><title>1.1 ft</title></rect><rect x="383.6811645506644" y="52" width="10.063767089867156" height="24" fill="rgba(224,79,29,0.85)"><title>1.1 ft</title></rect><rect x="373.6173974607973" y="28" width="10.063767089867099" height="24" fill="rgba(223,67,32,0.85)"><title>1.1 ft</title></rect><rect x="373.6173974607973" y="52" width="10.063767089867099" height="24" fill="rgba(223,67,32,0.85)"><title>1.1 ft</title></rect><rect x="363.55363037093025" y="28" width="10.063767089867042" height="24" fill="rgba(222,56,34,0.85)"><title>1.2 ft</title></rect><rect x="363.55363037093025" y="52" width="10.063767089867042" height="24" fill="rgba(222,56,34,0.85)"><title>1.2 ft</title></rect><rect x="353.4898632810631" y="28" width="10.063767089867156" height="24" fill="rgba(221,44,37,0.85)"><title>1.2 ft</title></rect><rect x="353.4898632810631" y="52" width="10.063767089867156" height="24" fill="rgba(221,44,37,0.85)"><title>1.2 ft</title></rect><rect x="504.4463696290697" y="76" width="10.063767089867099" height="24" fill="rgba(176,184,33,0.85)"><title>0.8 ft</title></rect><rect x="504.4463696290697" y="100" width="10.063767089867099" height="24" fill="rgba(176,184,33,0.85)"><title>0.8 ft</title></rect><rect x="494.3826025392026" y="76" width="10.063767089867099" height="24" fill="rgba(192,183,26,0.85)"><title>0.8 ft</title></rect><rect x="494.3826025392026" y="100" width="10.063767089867099" height="24" fill="rgba(192,183,26,0.85)"><title>0.8 ft</title></rect><rect x="484.3188354493355" y="76" width="10.063767089867099" height="24" fill="rgba(209,181,19,0.85)"><title>0.9 ft</title></rect><rect x="484.3188354493355" y="100" width="10.063767089867099" height="24" fill="rgba(209,181,19,0.85)"><title>0.9 ft</title></rect><rect x="474.25506835946845" y="76" width="10.063767089867042" height="24" fill="rgba(226,180,12,0.85)"><title>0.9 ft</title></rect><rect x="474.25506835946845" y="100" width="10.063767089867042" height="24" fill="rgba(226,180,12,0.85)"><title>0.9 ft</title></rect><rect x="464.19130126960124" y="76" width="10.063767089867213" height="24" fill="rgba(233,173,9,0.85)"><title>0.9 ft</title></rect><rect x="464.19130126960124" y="100" width="10.063767089867213" height="24" fill="rgba(233,173,9,0.85)"><title>0.9 ft</title></rect><rect x="454.1275341797342" y="76" width="10.063767089867042" height="24" fill="rgba(232,161,12,0.85)"><title>0.9 ft</title></rect><rect x="454.1275341797342" y="100" width="10.063767089867042" height="24" fill="rgba(232,161,12,0.85)"><title>0.9 ft</title></rect><rect x="444.0637670898671" y="76" width="10.063767089867099" height="24" fill="rgba(231,150,14,0.85)"><title>1 ft</title></rect><rect x="444.0637670898671" y="100" width="10.063767089867099" height="24" fill="rgba(231,150,14,0.85)"><title>1 ft</title></rect><rect x="433.99999999999994" y="76" width="10.063767089867156" height="24" fill="rgba(230,138,17,0.85)"><title>1 ft</title></rect><rect x="433.99999999999994" y="100" width="10.063767089867156" height="24" fill="rgba(230,138,17,0.85)"><title>1 ft</title></rect><rect x="423.93623291013284" y="76" width="10.063767089867099" height="24" fill="rgba(229,126,19,0.85)"><title>1 ft</title></rect><rect x="423.93623291013284" y="100" width="10.063767089867099" height="24" fill="rgba(229,126,19,0.85)"><title>1 ft</title></rect><rect x="413.87246582026575" y="76" width="10.063767089867099" height="24" fill="rgba(228,114,22,0.85)"><title>1 ft</title></rect><rect x="413.87246582026575" y="100" width="10.063767089867099" height="24" fill="rgba(228,114,22,0.85)"><title>1 ft</title></rect><rect x="403.80869873039865" y="76" width="10.063767089867099" height="24" fill="rgba(226,103,24,0.85)"><title>1.1 ft</title></rect><rect x="403.80869873039865" y="100" width="10.063767089867099" height="24" fill="rgba(226,103,24,0.85)"><title>1.1 ft</title></rect><rect x="393.74493164053155" y="76" width="10.063767089867099" height="24" fill="rgba(225,91,27,0.85)"><title>1.1 ft</title></rect><rect x="393.74493164053155" y="100" width="10.063767089867099" height="24" fill="rgba(225,91,27,0.85)"><title>1.1 ft</title></rect><rect x="383.6811645506644" y="76" width="10.063767089867156" height="24" fill="rgba(224,79,29,0.85)"><title>1.1 ft</title></rect><rect x="383.6811645506644" y="100" width="10.063767089867156" height="24" fill="rgba(224,79,29,0.85)"><title>1.1 ft</title></rect><rect x="373.6173974607973" y="76" width="10.063767089867099" height="24" fill="rgba(223,67,32,0.85)"><title>1.1 ft</title></rect><rect x="373.6173974607973" y="100" width="10.063767089867099" height="24" fill="rgba(223,67,32,0.85)"><title>1.1 ft</title></rect><rect x="363.55363037093025" y="76" width="10.063767089867042" height="24" fill="rgba(222,56,34,0.85)"><title>1.2 ft</title></rect><rect x="363.55363037093025" y="100" width="10.063767089867042" height="24" fill="rgba(222,56,34,0.85)"><title>1.2 ft</title></rect><rect x="353.4898632810631" y="76" width="10.063767089867156" height="24" fill="rgba(221,44,37,0.85)"><title>1.2 ft</title></rect><rect x="353.4898632810631" y="100" width="10.063767089867156" height="24" fill="rgba(221,44,37,0.85)"><title>1.2 ft</title></rect><rect x="504.4463696290697" y="124" width="10.063767089867099" height="24" fill="rgba(176,184,33,0.85)"><title>0.8 ft</title></rect><rect x="504.4463696290697" y="148" width="10.063767089867099" height="24" fill="rgba(176,184,33,0.85)"><title>0.8 ft</title></rect><rect x="494.3826025392026" y="124" width="10.063767089867099" height="24" fill="rgba(192,183,26,0.85)"><title>0.8 ft</title></rect><rect x="494.3826025392026" y="148" width="10.063767089867099" height="24" fill="rgba(192,183,26,0.85)"><title>0.8 ft</title></rect><rect x="484.3188354493355" y="124" width="10.063767089867099" height="24" fill="rgba(209,181,19,0.85)"><title>0.9 ft</title></rect><rect x="484.3188354493355" y="148" width="10.063767089867099" height="24" fill="rgba(209,181,19,0.85)"><title>0.9 ft</title></rect><rect x="474.25506835946845" y="124" width="10.063767089867042" height="24" fill="rgba(226,180,12,0.85)"><title>0.9 ft</title></rect><rect x="474.25506835946845" y="148" width="10.063767089867042" height="24" fill="rgba(226,180,12,0.85)"><title>0.9 ft</title></rect><rect x="464.19130126960124" y="124" width="10.063767089867213" height="24" fill="rgba(233,173,9,0.85)"><title>0.9 ft</title></rect><rect x="464.19130126960124" y="148" width="10.063767089867213" height="24" fill="rgba(233,173,9,0.85)"><title>0.9 ft</title></rect><rect x="454.1275341797342" y="124" width="10.063767089867042" height="24" fill="rgba(232,161,12,0.85)"><title>0.9 ft</title></rect><rect x="454.1275341797342" y="148" width="10.063767089867042" height="24" fill="rgba(232,161,12,0.85)"><title>0.9 ft</title></rect><rect x="444.0637670898671" y="124" width="10.063767089867099" height="24" fill="rgba(231,150,14,0.85)"><title>1 ft</title></rect><rect x="444.0637670898671" y="148" width="10.063767089867099" height="24" fill="rgba(231,150,14,0.85)"><title>1 ft</title></rect><rect x="433.99999999999994" y="124" width="10.063767089867156" height="24" fill="rgba(230,138,17,0.85)"><title>1 ft</title></rect><rect x="433.99999999999994" y="148" width="10.063767089867156" height="24" fill="rgba(230,138,17,0.85)"><title>1 ft</title></rect><rect x="423.93623291013284" y="124" width="10.063767089867099" height="24" fill="rgba(229,126,19,0.85)"><title>1 ft</title></rect><rect x="423.93623291013284" y="148" width="10.063767089867099" height="24" fill="rgba(229,126,19,0.85)"><title>1 ft</title></rect><rect x="413.87246582026575" y="124" width="10.063767089867099" height="24" fill="rgba(228,114,22,0.85)"><title>1 ft</title></rect><rect x="413.87246582026575" y="148" width="10.063767089867099" height="24" fill="rgba(228,114,22,0.85)"><title>1 ft</title></rect><rect x="403.80869873039865" y="124" width="10.063767089867099" height="24" fill="rgba(226,103,24,0.85)"><title>1.1 ft</title></rect><rect x="403.80869873039865" y="148" width="10.063767089867099" height="24" fill="rgba(226,103,24,0.85)"><title>1.1 ft</title></rect><rect x="393.74493164053155" y="124" width="10.063767089867099" height="24" fill="rgba(225,91,27,0.85)"><title>1.1 ft</title></rect><rect x="393.74493164053155" y="148" width="10.063767089867099" height="24" fill="rgba(225,91,27,0.85)"><title>1.1 ft</title></rect><rect x="383.6811645506644" y="124" width="10.063767089867156" height="24" fill="rgba(224,79,29,0.85)"><title>1.1 ft</title></rect><rect x="383.6811645506644" y="148" width="10.063767089867156" height="24" fill="rgba(224,79,29,0.85)"><title>1.1 ft</title></rect><rect x="373.6173974607973" y="124" width="10.063767089867099" height="24" fill="rgba(223,67,32,0.85)"><title>1.1 ft</title></rect><rect x="373.6173974607973" y="148" width="10.063767089867099" height="24" fill="rgba(223,67,32,0.85)"><title>1.1 ft</title></rect><rect x="363.55363037093025" y="124" width="10.063767089867042" height="24" fill="rgba(222,56,34,0.85)"><title>1.2 ft</title></rect><rect x="363.55363037093025" y="148" width="10.063767089867042" height="24" fill="rgba(222,56,34,0.85)"><title>1.2 ft</title></rect><rect x="353.4898632810631" y="124" width="10.063767089867156" height="24" fill="rgba(221,44,37,0.85)"><title>1.2 ft</title></rect><rect x="353.4898632810631" y="148" width="10.063767089867156" height="24" fill="rgba(221,44,37,0.85)"><title>1.2 ft</title></rect><rect x="504.4463696290697" y="172" width="10.063767089867099" height="24" fill="rgba(176,184,33,0.85)"><title>0.8 ft</title></rect><rect x="504.4463696290697" y="196" width="10.063767089867099" height="24" fill="rgba(176,184,33,0.85)"><title>0.8 ft</title></rect><rect x="494.3826025392026" y="172" width="10.063767089867099" height="24" fill="rgba(192,183,26,0.85)"><title>0.8 ft</title></rect><rect x="494.3826025392026" y="196" width="10.063767089867099" height="24" fill="rgba(192,183,26,0.85)"><title>0.8 ft</title></rect><rect x="484.3188354493355" y="172" width="10.063767089867099" height="24" fill="rgba(209,181,19,0.85)"><title>0.9 ft</title></rect><rect x="484.3188354493355" y="196" width="10.063767089867099" height="24" fill="rgba(209,181,19,0.85)"><title>0.9 ft</title></rect><rect x="474.25506835946845" y="172" width="10.063767089867042" height="24" fill="rgba(226,180,12,0.85)"><title>0.9 ft</title></rect><rect x="474.25506835946845" y="196" width="10.063767089867042" height="24" fill="rgba(226,180,12,0.85)"><title>0.9 ft</title></rect><rect x="464.19130126960124" y="172" width="10.063767089867213" height="24" fill="rgba(233,173,9,0.85)"><title>0.9 ft</title></rect><rect x="464.19130126960124" y="196" width="10.063767089867213" height="24" fill="rgba(233,173,9,0.85)"><title>0.9 ft</title></rect><rect x="454.1275341797342" y="172" width="10.063767089867042" height="24" fill="rgba(232,161,12,0.85)"><title>0.9 ft</title></rect><rect x="454.1275341797342" y="196" width="10.063767089867042" height="24" fill="rgba(232,161,12,0.85)"><title>0.9 ft</title></rect><rect x="444.0637670898671" y="172" width="10.063767089867099" height="24" fill="rgba(231,150,14,0.85)"><title>1 ft</title></rect><rect x="444.0637670898671" y="196" width="10.063767089867099" height="24" fill="rgba(231,150,14,0.85)"><title>1 ft</title></rect><rect x="433.99999999999994" y="172" width="10.063767089867156" height="24" fill="rgba(230,138,17,0.85)"><title>1 ft</title></rect><rect x="433.99999999999994" y="196" width="10.063767089867156" height="24" fill="rgba(230,138,17,0.85)"><title>1 ft</title></rect><rect x="423.93623291013284" y="172" width="10.063767089867099" height="24" fill="rgba(229,126,19,0.85)"><title>1 ft</title></rect><rect x="423.93623291013284" y="196" width="10.063767089867099" height="24" fill="rgba(229,126,19,0.85)"><title>1 ft</title></rect><rect x="413.87246582026575" y="172" width="10.063767089867099" height="24" fill="rgba(228,114,22,0.85)"><title>1 ft</title></rect><rect x="413.87246582026575" y="196" width="10.063767089867099" height="24" fill="rgba(228,114,22,0.85)"><title>1 ft</title></rect><rect x="403.80869873039865" y="172" width="10.063767089867099" height="24" fill="rgba(226,103,24,0.85)"><title>1.1 ft</title></rect><rect x="403.80869873039865" y="196" width="10.063767089867099" height="24" fill="rgba(226,103,24,0.85)"><title>1.1 ft</title></rect><rect x="393.74493164053155" y="172" width="10.063767089867099" height="24" fill="rgba(225,91,27,0.85)"><title>1.1 ft</title></rect><rect x="393.74493164053155" y="196" width="10.063767089867099" height="24" fill="rgba(225,91,27,0.85)"><title>1.1 ft</title></rect><rect x="383.6811645506644" y="172" width="10.063767089867156" height="24" fill="rgba(224,79,29,0.85)"><title>1.1 ft</title></rect><rect x="383.6811645506644" y="196" width="10.063767089867156" height="24" fill="rgba(224,79,29,0.85)"><title>1.1 ft</title></rect><rect x="373.6173974607973" y="172" width="10.063767089867099" height="24" fill="rgba(223,67,32,0.85)"><title>1.1 ft</title></rect><rect x="373.6173974607973" y="196" width="10.063767089867099" height="24" fill="rgba(223,67,32,0.85)"><title>1.1 ft</title></rect><rect x="363.55363037093025" y="172" width="10.063767089867042" height="24" fill="rgba(222,56,34,0.85)"><title>1.2 ft</title></rect><rect x="363.55363037093025" y="196" width="10.063767089867042" height="24" fill="rgba(222,56,34,0.85)"><title>1.2 ft</title></rect><rect x="353.4898632810631" y="172" width="10.063767089867156" height="24" fill="rgba(221,44,37,0.85)"><title>1.2 ft</title></rect><rect x="353.4898632810631" y="196" width="10.063767089867156" height="24" fill="rgba(221,44,37,0.85)"><title>1.2 ft</title></rect><rect x="504.4463696290697" y="220" width="10.063767089867099" height="24" fill="rgba(176,184,33,0.85)"><title>0.8 ft</title></rect><rect x="504.4463696290697" y="244" width="10.063767089867099" height="24" fill="rgba(176,184,33,0.85)"><title>0.8 ft</title></rect><rect x="494.3826025392026" y="220" width="10.063767089867099" height="24" fill="rgba(192,183,26,0.85)"><title>0.8 ft</title></rect><rect x="494.3826025392026" y="244" width="10.063767089867099" height="24" fill="rgba(192,183,26,0.85)"><title>0.8 ft</title></rect><rect x="484.3188354493355" y="220" width="10.063767089867099" height="24" fill="rgba(209,181,19,0.85)"><title>0.9 ft</title></rect><rect x="484.3188354493355" y="244" width="10.063767089867099" height="24" fill="rgba(209,181,19,0.85)"><title>0.9 ft</title></rect><rect x="474.25506835946845" y="220" width="10.063767089867042" height="24" fill="rgba(226,180,12,0.85)"><title>0.9 ft</title></rect><rect x="474.25506835946845" y="244" width="10.063767089867042" height="24" fill="rgba(226,180,12,0.85)"><title>0.9 ft</title></rect><rect x="464.19130126960124" y="220" width="10.063767089867213" height="24" fill="rgba(233,173,9,0.85)"><title>0.9 ft</title></rect><rect x="464.19130126960124" y="244" width="10.063767089867213" height="24" fill="rgba(233,173,9,0.85)"><title>0.9 ft</title></rect><rect x="454.1275341797342" y="220" width="10.063767089867042" height="24" fill="rgba(232,161,12,0.85)"><title>0.9 ft</title></rect><rect x="454.1275341797342" y="244" width="10.063767089867042" height="24" fill="rgba(232,161,12,0.85)"><title>0.9 ft</title></rect><rect x="444.0637670898671" y="220" width="10.063767089867099" height="24" fill="rgba(231,150,14,0.85)"><title>1 ft</title></rect><rect x="444.0637670898671" y="244" width="10.063767089867099" height="24" fill="rgba(231,150,14,0.85)"><title>1 ft</title></rect><rect x="433.99999999999994" y="220" width="10.063767089867156" height="24" fill="rgba(230,138,17,0.85)"><title>1 ft</title></rect><rect x="433.99999999999994" y="244" width="10.063767089867156" height="24" fill="rgba(230,138,17,0.85)"><title>1 ft</title></rect><rect x="423.93623291013284" y="220" width="10.063767089867099" height="24" fill="rgba(229,126,19,0.85)"><title>1 ft</title></rect><rect x="423.93623291013284" y="244" width="10.063767089867099" height="24" fill="rgba(229,126,19,0.85)"><title>1 ft</title></rect><rect x="413.87246582026575" y="220" width="10.063767089867099" height="24" fill="rgba(228,114,22,0.85)"><title>1 ft</title></rect><rect x="413.87246582026575" y="244" width="10.063767089867099" height="24" fill="rgba(228,114,22,0.85)"><title>1 ft</title></rect><rect x="403.80869873039865" y="220" width="10.063767089867099" height="24" fill="rgba(226,103,24,0.85)"><title>1.1 ft</title></rect><rect x="403.80869873039865" y="244" width="10.063767089867099" height="24" fill="rgba(226,103,24,0.85)"><title>1.1 ft</title></rect><rect x="393.74493164053155" y="220" width="10.063767089867099" height="24" fill="rgba(225,91,27,0.85)"><title>1.1 ft</title></rect><rect x="393.74493164053155" y="244" width="10.063767089867099" height="24" fill="rgba(225,91,27,0.85)"><title>1.1 ft</title></rect><rect x="383.6811645506644" y="220" width="10.063767089867156" height="24" fill="rgba(224,79,29,0.85)"><title>1.1 ft</title></rect><rect x="383.6811645506644" y="244" width="10.063767089867156" height="24" fill="rgba(224,79,29,0.85)"><title>1.1 ft</title></rect><rect x="373.6173974607973" y="220" width="10.063767089867099" height="24" fill="rgba(223,67,32,0.85)"><title>1.1 ft</title></rect><rect x="373.6173974607973" y="244" width="10.063767089867099" height="24" fill="rgba(223,67,32,0.85)"><title>1.1 ft</title></rect><rect x="363.55363037093025" y="220" width="10.063767089867042" height="24" fill="rgba(222,56,34,0.85)"><title>1.2 ft</title></rect><rect x="363.55363037093025" y="244" width="10.063767089867042" height="24" fill="rgba(222,56,34,0.85)"><title>1.2 ft</title></rect><rect x="353.4898632810631" y="220" width="10.063767089867156" height="24" fill="rgba(221,44,37,0.85)"><title>1.2 ft</title></rect><rect x="353.4898632810631" y="244" width="10.063767089867156" height="24" fill="rgba(221,44,37,0.85)"><title>1.2 ft</title></rect><text x="56" y="55.5" font-size="10" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">0</text><text x="56" y="103.5" font-size="10" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">1</text><text x="56" y="151.5" font-size="10" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">2</text><text x="56" y="199.5" font-size="10" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">3</text><text x="56" y="247.5" font-size="10" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">4</text><text transform="rotate(-90)" x="-148" y="10" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">surfing.heatMap.transectAxisLabel</text><g><line x1="514.5101367189368" y1="268" x2="514.5101367189368" y2="272" stroke="var(--muted-foreground)" stroke-opacity="0.5"></line><text x="514.5101367189368" y="282" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">10</text></g><g><line x1="385.65634657150235" y1="268" x2="385.65634657150235" y2="272" stroke="var(--muted-foreground)" stroke-opacity="0.5"></line><text x="385.65634657150235" y="282" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">82</text></g><text x="434" y="294" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">surfing.beachProfile.distanceAxisLabel</text><text x="806" y="22" font-size="9" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">surfing.shore</text><text x="62" y="22" font-size="9" fill="var(--muted-foreground)" text-anchor="start" aria-hidden="true">surfing.offshore</text><defs><linearGradient id="heatmap-legend-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="rgb(59,130,246)"></stop><stop offset="25%" stop-color="rgb(13,148,159)"></stop><stop offset="50%" stop-color="rgb(34,197,94)"></stop><stop offset="75%" stop-color="rgb(234,179,8)"></stop><stop offset="100%" stop-color="rgb(220,38,38)"></stop></linearGradient></defs><rect x="648" y="296" width="160" height="10" fill="url(#heatmap-legend-gradient)" rx="3" opacity="0.85"></rect><text x="648" y="318" font-size="9" fill="var(--muted-foreground)" text-anchor="start">0 ft</text><text x="808" y="318" font-size="9" fill="var(--muted-foreground)" text-anchor="end">1.2 ft</text></svg></div><table class="sr-only"><caption>surfing.heatMapAriaLabel</caption><thead><tr><th scope="col">surfing.heatMap.transectIndex</th><th scope="col">surfing.heatMap.openTransect</th><th scope="col">surfing.heatMap.breakHeight</th><th scope="col">surfing.heatMap.breakDistance</th><th scope="col">surfing.heatMap.breakerType</th></tr></thead><tbody><tr><th scope="row">0</th><td>yes</td><td>—</td><td>—</td><td>—</td></tr><tr><th scope="row">1</th><td>yes</td><td>—</td><td>—</td><td>—</td></tr><tr><th scope="row">2</th><td>yes</td><td>—</td><td>—</td><td>—</td></tr><tr><th scope="row">3</th><td>yes</td><td>—</td><td>—</td><td>—</td></tr><tr><th scope="row">4</th><td>yes</td><td>—</td><td>—</td><td>—</td></tr></tbody></table></div>';

    it('KAT (a): fixture WITH imagery config -> ortho tiles render behind the heat map, colour cells at reduced opacity', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS_WITH_ORIGINS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );

      const images = Array.from(container.querySelectorAll('svg image'));
      expect(images.length).toBeGreaterThan(0);
      expect(images.length).toBeLessThanOrEqual(IMAGERY_MOSAIC_MAX_TILES_PER_SIDE ** 2);
      for (const img of images) {
        const href = img.getAttribute('href') ?? '';
        const m = href.match(/^\/api\/v1\/imagery\/tiles\/(\d+)\/(\d+)\/(\d+)$/);
        expect(m).not.toBeNull();
        const z = Number(m![1]);
        expect(z).toBeGreaterThanOrEqual(IMAGERY_ZOOM_MIN);
        expect(z).toBeLessThanOrEqual(IMAGERY_ZOOM_MAX);
        // Decorative — described by the outer <desc>, not individually alt-texted.
        expect(img.closest('[aria-hidden="true"]')).not.toBeNull();
      }

      // Tiles render BEHIND (before, in SVG paint order) the colour cells.
      const svgHtml = container.querySelector('svg[role="img"]')!.innerHTML;
      const firstImageIdx = svgHtml.indexOf('<image');
      const firstReducedOpacityCellIdx = svgHtml.indexOf(`,${HEATMAP_CELL_OPACITY_ON_ORTHO})`);
      expect(firstImageIdx).toBeGreaterThanOrEqual(0);
      expect(firstReducedOpacityCellIdx).toBeGreaterThan(firstImageIdx);

      // Colour cells render at the REDUCED opacity (0.55), not the default (0.85).
      const cellRects = Array.from(container.querySelectorAll('svg rect[fill^="rgba("]'));
      expect(cellRects.length).toBeGreaterThan(0);
      for (const r of cellRects) {
        expect(r.getAttribute('fill')).toMatch(/,0\.55\)$/);
      }

      // H3 (2026-08-10) — attribution no longer renders below the SVG by
      // default; it moved into the info-icon modal (rendered inline, not a
      // portal). Open it and check the verbatim text is still there (never
      // through t()).
      expect(container.textContent).not.toContain(NAIP_CONFIG.attribution);
      fireEvent.click(within(container).getByLabelText('surfing.heatMap.infoButtonLabel'));
      expect(container.textContent).toContain(NAIP_CONFIG.attribution);
    });

    it('KAT (b): fixture WITHOUT imagery config -> byte-identical DOM to the pre-LM-2 render', () => {
      // mockUseImageryConfig default from beforeEach: { data: null, loading: false }. No spotLat/spotLon passed either.
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} />,
      );
      expect(normalizeReactIds(container.innerHTML)).toBe(normalizeReactIds(GOLDEN_NO_IMAGERY_HTML));
    });

    it('plan item (e) null-safety: imagery fetch failure (404/network — useImageryConfig itself resolves this to data:null, see useImageryConfig.test.ts) renders the SAME byte-identical DOM as KAT (b), even though spotLat/spotLon ARE set', () => {
      mockUseImageryConfig.mockReturnValue({ data: null, loading: false });
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      expect(normalizeReactIds(container.innerHTML)).toBe(normalizeReactIds(GOLDEN_NO_IMAGERY_HTML));
    });

    it('null-safety: imagery config present but heat map data is null (not fetched yet) -> pre-existing empty state, no crash, no tiles/attribution', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      expect(() => render(
        <HeatMapCard {...baseProps} data={null} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      )).not.toThrow();
      const { container } = render(
        <HeatMapCard {...baseProps} data={null} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      expect(within(container).getByText('surfing.heatMapNoData')).toBeDefined();
      expect(container.querySelectorAll('svg image').length).toBe(0);
      expect(container.textContent).not.toContain(NAIP_CONFIG.attribution);
    });

    it('KAT (c): ESRI provider active -> ESRI attribution text renders, tile hrefs use the ESRI XYZ template with tokens substituted (z/y/x order, not z/x/y)', () => {
      mockUseImageryConfig.mockReturnValue({ data: ESRI_CONFIG, loading: false });
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS_WITH_ORIGINS} loading={false} spotLat={51.5} spotLon={-0.12} />,
      );
      // H3 (2026-08-10) — attribution renders inside the info-icon modal now, not below the SVG by default.
      fireEvent.click(within(container).getByLabelText('surfing.heatMap.infoButtonLabel'));
      expect(container.textContent).toContain(ESRI_CONFIG.attribution);

      const images = Array.from(container.querySelectorAll('svg image'));
      expect(images.length).toBeGreaterThan(0);
      for (const img of images) {
        const href = img.getAttribute('href') ?? '';
        expect(href.startsWith(
          'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/',
        )).toBe(true);
        expect(href).not.toContain('{z}');
        expect(href).not.toContain('{x}');
        expect(href).not.toContain('{y}');
        // Token-based substitution, not position-based — ESRI's own path
        // order is {z}/{y}/{x}, distinguishing it from NAIP's {z}/{x}/{y}.
        const tail = href.replace(
          'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/',
          '',
        );
        expect(tail).toMatch(/^\d+\/\d+\/\d+$/);
      }
    });

    it('KAT (d) a11y: decorative tile group is aria-hidden, attribution is visible accessible text (not sr-only), svg role/labelling unchanged', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      const { container, getByText } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS_WITH_ORIGINS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      const svg = container.querySelector('svg[role="img"]')!;
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.getAttribute('aria-labelledby')).toBeTruthy();

      const desc = container.querySelector('desc')!;
      expect(desc.textContent).toContain('surfing.heatMap.orthoImageryDesc');

      const images = Array.from(container.querySelectorAll('svg image'));
      expect(images.length).toBeGreaterThan(0);
      for (const img of images) {
        expect(img.closest('[aria-hidden="true"]')).not.toBeNull();
      }

      // Attribution: real, visible DOM text (findable by AT and sighted
      // users alike) once the H3 info-icon modal is opened.
      fireEvent.click(within(container).getByLabelText('surfing.heatMap.infoButtonLabel'));
      const attribution = getByText(NAIP_CONFIG.attribution);
      expect(attribution.closest('[aria-hidden="true"]')).toBeNull();
      expect(attribution.className).not.toContain('sr-only');
    });

    it('mosaic tile cap: never fetches more than IMAGERY_MOSAIC_MAX_TILES_PER_SIDE^2 tiles even for a very large study radius', () => {
      // C3 rebuild: the tile cap needs >= 2 real origins to fit a ground
      // transform at all — a huge ALONGSHORE separation (5 km) forces the
      // buffered bbox diagonal far larger than a single-zoom-level mosaic
      // can cover within the tile-count cap without the cap binding (lead
      // ruling: binding must be logged, not silently under-cover without a
      // trace — see console.debug in computeImageryTiles(); not re-asserted
      // here as a spy, covered by code review + the closeout note).
      const FAR_STEP_M = 5000;
      function bigRowWithOrigin(i: number): HeatMapTransectData {
        const bearingRad = (ORIGIN_TANGENT_BEARING_DEG * Math.PI) / 180;
        const eastM = i * FAR_STEP_M * Math.sin(bearingRad);
        const northM = i * FAR_STEP_M * Math.cos(bearingRad);
        const cosLat = Math.cos((ORIGIN_REF_LAT * Math.PI) / 180);
        return {
          transectIndex: i,
          isStructureAffected: false,
          transectBearingDeg: 245,
          transect: [
            { distance: 2200, depth: 15, hs: 3.5 },
            { distance: 10, depth: 0.5, hs: 0.8 },
          ],
          breakPoints: [],
          waveShapes: [],
          surfZones: null,
          jackingFactors: [],
          handoffDepthM: 2,
          handoffSourceLevel: 'L4',
          originLat: ORIGIN_REF_LAT + northM / 111320,
          originLon: ORIGIN_REF_LON + eastM / (111320 * cosLat),
          alongshoreM: i * FAR_STEP_M,
        };
      }
      const bigResponse: HeatMapProfileDataOk = {
        locationId: 'huntington-city-beach-pier',
        timestep: '2026-08-02T00:00:00Z',
        modelStatus: 'ok',
        profiles: [0, 1].map(bigRowWithOrigin),
        perPartitionBreaks: [],
        metadata: {
          axisUnits: { x: 'm', y: 'm' },
          verticalDatum: 'LMSL',
          transectCount: 2,
          openTransectCount: 2,
          handoffDepthM: 2,
          handoffSourceLevel: 'L4',
        },
      };
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      const { container } = render(
        <HeatMapCard {...baseProps} distanceUnit="m" data={bigResponse} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      const images = Array.from(container.querySelectorAll('svg image'));
      expect(images.length).toBeGreaterThan(0);
      expect(images.length).toBeLessThanOrEqual(IMAGERY_MOSAIC_MAX_TILES_PER_SIDE ** 2);
    });
  });

  // ── H2 (2026-08-10, MARINE-PAGE-FIXIT-PLAN §H2) — bilinear smoothing
  //    raster, REPLACES the D7s median-5 filter these tests used to pin
  //    (the old test asserted one <title> per served segment — H2's fixed
  //    per-row sub-cell raster produces MANY titles per row instead, so
  //    the exact-count/exact-value assertions below are rewritten against
  //    the NEW mechanism, not deleted outright — same fixture, same
  //    "zeroed-out row 2 isn't left showing raw 0" intent). ──
  describe('H2 — bilinear smoothing raster (replaces D7s median-5)', () => {
    it('a zeroed-out transect (row 2) is blended toward its neighbours, not left showing its raw 0 value', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_SMOOTHING} loading={false} />,
      );
      // OK_RESPONSE_SMOOTHING rows carry no originLat/Lon -> pre-C3 uniform
      // index grid (rowH = min(48, max(8, floor(300/5))) = 48). Row 2's
      // band is therefore exactly [PAD_TOP + 2*48, PAD_TOP + 3*48) =
      // [124, 172) — independently computed, not read off component state.
      const PAD_TOP_LOCAL = 28;
      const ROW_H_LOCAL = 48;
      const row2Top = PAD_TOP_LOCAL + 2 * ROW_H_LOCAL;
      const row2Bottom = row2Top + ROW_H_LOCAL;

      const row2Titles = Array.from(container.querySelectorAll('svg rect'))
        .filter((r) => {
          const y = Number(r.getAttribute('y'));
          return y >= row2Top && y < row2Bottom;
        })
        .map((r) => r.querySelector('title')?.textContent)
        .filter((t): t is string => t != null);

      expect(row2Titles.length).toBeGreaterThan(0);
      // Every cell in row 2's own band must read ABOVE zero — the raw
      // served value (0 everywhere in this row) is never shown unblended;
      // bilinear blending toward the non-zero neighbours (rows 1 and 3,
      // hs 1.1/1.3) always pulls it strictly positive.
      for (const title of row2Titles) {
        const value = parseFloat(title);
        expect(value).toBeGreaterThan(0);
      }
    });

    it('row 2\'s bottom-half sub-cells (blended toward row 3, hs 1.3) read higher than the top-half sub-cells at the SAME cross-shore position (blended toward row 1, hs 1.1) — real alongshore gradation, not a flat tint', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_SMOOTHING} loading={false} />,
      );
      const PAD_TOP_LOCAL = 28;
      const ROW_H_LOCAL = 48;
      const row2Top = PAD_TOP_LOCAL + 2 * ROW_H_LOCAL;
      const row2Bottom = row2Top + ROW_H_LOCAL;
      const row2CenterY = (row2Top + row2Bottom) / 2;

      const row2Cells = Array.from(container.querySelectorAll('svg rect'))
        .filter((r) => {
          const y = Number(r.getAttribute('y'));
          return y >= row2Top && y < row2Bottom;
        })
        .map((r) => ({
          x: Number(r.getAttribute('x')),
          y: Number(r.getAttribute('y')),
          value: parseFloat(r.querySelector('title')?.textContent ?? '0'),
        }));
      expect(row2Cells.length).toBeGreaterThan(0);

      // Compare the SUM across each half (not cell-by-cell — the rendered
      // title text is rounded to 1 decimal, so individual same-x pairs can
      // tie after rounding even though the underlying unrounded blend
      // values genuinely differ; summing over every sub-cell in the half
      // averages that rounding noise out while still testing the real
      // claim: the half blended toward the higher-hs neighbour (row 3,
      // 1.3) reads higher in aggregate than the half blended toward the
      // lower-hs neighbour (row 1, 1.1)).
      const topHalf = row2Cells.filter((c) => c.y < row2CenterY);
      const bottomHalf = row2Cells.filter((c) => c.y >= row2CenterY);
      expect(topHalf.length).toBeGreaterThan(0);
      expect(topHalf.length).toBe(bottomHalf.length);

      const topSum = topHalf.reduce((s, c) => s + c.value, 0);
      const bottomSum = bottomHalf.reduce((s, c) => s + c.value, 0);
      expect(bottomSum).toBeGreaterThan(topSum);
    });

    it('the smoothing note renders in plain words inside the info-icon modal (H3, 2026-08-10 — moved from below the SVG)', () => {
      const { container, getByText, queryByText } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_SMOOTHING} loading={false} />,
      );
      expect(queryByText('surfing.heatMap.smoothingNote')).toBeNull();
      fireEvent.click(within(container).getByLabelText('surfing.heatMap.infoButtonLabel'));
      expect(getByText('surfing.heatMap.smoothingNote')).toBeDefined();
    });

    it('raw profile data is never mutated by the smoothing pass (display-only, per the brief)', () => {
      const before = JSON.parse(JSON.stringify(OK_RESPONSE_SMOOTHING));
      render(<HeatMapCard {...baseProps} data={OK_RESPONSE_SMOOTHING} loading={false} />);
      expect(OK_RESPONSE_SMOOTHING).toEqual(before);
      // The raw zeroed-out value is still exactly 0 in the untouched prop —
      // only the rendered colour/tooltip changed, not the source data.
      expect(OK_RESPONSE_SMOOTHING.profiles![2].transect[0].hs).toBe(0);
    });
  });

  // ── H-ACCEPT-STRUCK fix (2026-08-1x) — operator: "waves breaking in the
  //    middle of the beach". See OK_RESPONSE_DRY_PADDING's doc comment for
  //    the live-payload numbers this fixture reproduces. ──
  describe('H-ACCEPT-STRUCK — dry-beach padding never paints as surf', () => {
    it('no colour cell renders landward of the row\'s own waterlineDistance — the dry-beach padding points (hs 0.05/0.013) never surface as a colour value', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_DRY_PADDING} loading={false} />,
      );
      const titles = Array.from(container.querySelectorAll('svg rect > title'))
        .map((el) => parseFloat(el.textContent ?? '0'));
      expect(titles.length).toBeGreaterThan(0);
      // Every rendered cell is bilinear-interpolated ONLY from the wet
      // segment [0m, 100m] (hs range 0.3-1.5) — the dry-beach padding
      // segments [-235.7m,-50m] and [-50m,0m] (hs 0.013-0.05) are never
      // sampled at all, so no title can read anywhere near those values.
      for (const value of titles) {
        expect(value).toBeGreaterThanOrEqual(0.3);
      }
    });

    it('the cross-shore frame\'s shoreward edge stops at the waterline, not 235m further landward at the raw served minimum', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_DRY_PADDING} loading={false} />,
      );
      // X-axis tick VALUES are computed from geometry.dataMinM (the fixed
      // frame extent) — independently, the fix caps dataMinM at
      // max(waterlineDistance)=0 across rows instead of the raw served
      // min (-235.7m). No rendered X tick should read anywhere near
      // -235.7 (a huge negative number the old frame would have needed to
      // span); the smallest tick should be close to 0, not far negative.
      const xTickTexts = Array.from(container.querySelectorAll('svg g text[text-anchor="middle"]'))
        .map((el) => parseFloat(el.textContent ?? 'NaN'))
        .filter((v) => !Number.isNaN(v));
      expect(xTickTexts.length).toBeGreaterThan(0);
      const minTick = Math.min(...xTickTexts);
      expect(minTick).toBeGreaterThan(-50);
    });

    it('a row with NO waterlineDistance (older cached response) falls back to the pre-fix raw-minimum framing — byte-identical to before this fix for that case', () => {
      // OK_RESPONSE_5_ROWS_WITH_ORIGINS rows carry no waterlineDistance at
      // all -> every row.waterlineDistance is undefined -> both the
      // colour-cell clip and the frame-extent clip take their documented
      // fallback (raw served minimum), unchanged from pre-fix behavior.
      // This is the SAME fixture the pre-existing GOLDEN/ground-truth
      // tests already assert byte-identical output against — no new
      // assertion needed here beyond confirming it still renders without
      // throwing (the golden-DOM tests elsewhere are the real pin).
      expect(() => render(
        <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_5_ROWS_WITH_ORIGINS} loading={false} />,
      )).not.toThrow();
    });
  });

  // ── C3 (2026-08-08, L1-BOUNDARY-REBUILD-PLAN Phase C, P15) — ortho
  //    rotation, 50m visible buffer, y-axis title, structure-overlay
  //    removal. ──
  describe('C3 — ortho rotation / buffer / y-axis / structure-overlay removal', () => {
    const SPOT_LAT = 33.6595;
    const SPOT_LON = -118.0064;
    const PAD_TOP = 28;

    describe('computeImageryRotationDeg', () => {
      // Falsifiable: a sign flip (e.g. `bearingDeg - 270` instead of
      // `270 - bearingDeg`) fails every case here except the two where the
      // formula is symmetric (0 and 180 map to the same result either way
      // are NOT included below — every case here distinguishes the sign).
      it.each([
        [0, 270],     // offshore due north -> rotate 270° so north swings to chart-left
        [90, 180],
        [180, 90],
        [270, 0],     // offshore already due west -> already chart-left, no rotation
        [245, 25],
        [350, 280],
      ])('bearing %i° -> rotation %i°', (bearing, expected) => {
        expect(computeImageryRotationDeg(bearing)).toBeCloseTo(expected, 6);
      });
    });

    it('rotates the imagery tile group by the computed angle, about its OWN true-scale ground center (C3S: not the chart\'s arbitrary center)', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      // OK_RESPONSE_5_ROWS_WITH_ORIGINS: every row's transectBearingDeg=245,
      // origins on a tangent bearing perpendicular to 245 by construction
      // -> the fitted offshore bearing lands exactly on 245 ->
      // rotation = computeImageryRotationDeg(245) = 25°.
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS_WITH_ORIGINS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      const rotatedGroup = Array.from(container.querySelectorAll('svg g')).find((g) =>
        (g.getAttribute('transform') ?? '').startsWith('rotate('),
      );
      expect(rotatedGroup).toBeDefined();
      // C3S: the pivot is the mosaic's OWN true-scale ground center — a
      // real, data-derived screen position, not a hardcoded chart-center
      // constant. Just prove it parses to finite numbers (no NaN) and the
      // rotation angle is correct.
      const m = rotatedGroup!.getAttribute('transform')!.match(/^rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)$/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeCloseTo(25, 1);
      expect(Number.isFinite(Number(m![2]))).toBe(true);
      expect(Number.isFinite(Number(m![3]))).toBe(true);
      // The rotated group actually contains the tile <image> elements.
      expect(rotatedGroup!.querySelectorAll('image').length).toBeGreaterThan(0);
    });

    it('no imagery layer at all when fewer than 2 rows carry real origins (cannot fit a ground transform)', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      // OK_RESPONSE_5_ROWS (no P16 origin fields) — the pre-C3 fallback: the
      // old circle/footprint-model imagery is GONE, not re-approximated.
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      expect(container.querySelectorAll('svg image').length).toBe(0);
      const rotatedGroup = Array.from(container.querySelectorAll('svg g')).find((g) =>
        (g.getAttribute('transform') ?? '').startsWith('rotate('),
      );
      expect(rotatedGroup).toBeUndefined();
    });

    it('rotation is fitted from ALL origins even when no row carries its own transectBearingDeg (offshore sense falls back to the tangent perpendicular)', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      const noBearingResponse: HeatMapProfileDataOk = {
        ...OK_RESPONSE_5_ROWS_WITH_ORIGINS,
        profiles: OK_RESPONSE_5_ROWS_WITH_ORIGINS.profiles!.map((r) => ({ ...r, transectBearingDeg: null })),
      };
      const { container } = render(
        <HeatMapCard {...baseProps} data={noBearingResponse} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      const rotatedGroup = Array.from(container.querySelectorAll('svg g')).find((g) =>
        (g.getAttribute('transform') ?? '').startsWith('rotate('),
      );
      expect(rotatedGroup).toBeDefined();
      // Expected value computed via the SAME exported transform function
      // (fitGroundTransform + computeImageryRotationDeg) — this test proves
      // the component WIRES the fitted transform into the rotation
      // correctly (center point, formula), not that the transform math
      // itself is correct (the GROUND-TRUTH describe block below tests
      // that against independent lat/lon arithmetic, never this function).
      const origins = OK_RESPONSE_5_ROWS_WITH_ORIGINS.profiles!.map((r) => ({
        lat: r.originLat!, lon: r.originLon!, alongshoreM: r.alongshoreM!, bearingDeg: null,
      }));
      const transform = fitGroundTransform(origins)!;
      const expectedRotation = computeImageryRotationDeg(transform.offshoreBearingDeg);
      const m = rotatedGroup!.getAttribute('transform')!.match(/^rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)$/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeCloseTo(expectedRotation, 6);
    });

    // C3S (2026-08-09 PM) — the imagery clip now clips to exactly the CORE
    // chart rectangle (the 50m ground buffer is baked INTO the frame/S — it
    // is no longer a separate on-screen extension beyond the chart, per the
    // design: "the pier will CLIP at the frame's offshore edge... correct
    // at true scale, no row's data reaches the pier tip"). REPLACES the old
    // "clip extends beyond the core rect" test — that was the two-ruler
    // behavior being fixed.
    it('C3S: the imagery clip rect equals EXACTLY the core plot rectangle (buffer is baked into the frame, not a separate on-screen extension)', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      const { container } = render(
        <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_5_ROWS_WITH_ORIGINS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      const clipRect = container.querySelector('clipPath rect');
      expect(clipRect).not.toBeNull();
      const x = Number(clipRect!.getAttribute('x'));
      const y = Number(clipRect!.getAttribute('y'));
      const w = Number(clipRect!.getAttribute('width'));
      const h = Number(clipRect!.getAttribute('height'));
      const svg = container.querySelector('svg[role="img"]')!;
      const viewBoxH = Number(svg.getAttribute('viewBox')!.split(' ')[3]);
      expect(x).toBeCloseTo(PAD_LEFT, 5);
      expect(y).toBeCloseTo(PAD_TOP, 5);
      expect(x + w).toBeCloseTo(PAD_LEFT + CHART_W, 5);
      // Full chart height, independently: dataMin/dataMax=10/100m (buildRow),
      // alongMin/alongMax=0/200m (5 rows, 50m step) -> S from the X frame,
      // chartH = (alongSpan + 100) * S — same formula as the design doc.
      const S = 748 / ((100 + 50) - (10 - 50));
      const expectedChartH = (200 - 0 + 100) * S;
      expect(y + h).toBeCloseTo(PAD_TOP + expectedChartH, 0);
      expect(viewBoxH).toBeGreaterThan(y + h); // sanity: clip stays within the viewBox
    });

    // ── C3S (2026-08-09 PM, coordinator correction) — the imagery's OWN
    //    implied px/m, measured from its ACTUAL rendered tile footprint and
    //    an INDEPENDENTLY re-derived tile-index -> lon/lat -> metres bbox
    //    (never importing the component's snapImageryBBoxToTiles/
    //    computeImageryTiles), must equal the SAME S the grid itself uses —
    //    in BOTH axes. This is the core acceptance criterion: "any two
    //    points' pixel distance / S = their true ground distance." ──
    describe('C3S — imagery px/m equals S (independent tile-index re-derivation, both axes)', () => {
      // Standard Web Mercator slippy-tile math, re-derived here (NOT
      // imported from HeatMapCard.tsx) — same public formulas the NAIP/ESRI
      // XYZ tile spec itself uses.
      function tileXToLonIndependent(x: number, z: number): number {
        return (x / 2 ** z) * 360 - 180;
      }
      function tileYToLatIndependent(y: number, z: number): number {
        const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
        return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
      }

      it('imagery px/m matches the grid\'s own S in BOTH axes, within 1%', () => {
        mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
        const { container } = render(
          <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_5_ROWS_WITH_ORIGINS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
        );
        const images = Array.from(container.querySelectorAll('svg image'));
        expect(images.length).toBeGreaterThan(0);

        // Extract z/x/y from each tile's href (NAIP proxy path {z}/{x}/{y}).
        const tiles = images.map((img) => {
          const href = img.getAttribute('href')!;
          const m = href.match(/\/(\d+)\/(\d+)\/(\d+)$/)!;
          return {
            z: Number(m[1]), x: Number(m[2]), y: Number(m[3]),
            sx: Number(img.getAttribute('x')), sy: Number(img.getAttribute('y')),
            sw: Number(img.getAttribute('width')), sh: Number(img.getAttribute('height')),
          };
        });
        const z = tiles[0].z;
        const xMin = Math.min(...tiles.map((t) => t.x));
        const xMax = Math.max(...tiles.map((t) => t.x));
        const yMin = Math.min(...tiles.map((t) => t.y));
        const yMax = Math.max(...tiles.map((t) => t.y));

        // Independent re-derivation of the mosaic's real ground bbox.
        const mosaicWest = tileXToLonIndependent(xMin, z);
        const mosaicEast = tileXToLonIndependent(xMax + 1, z);
        const mosaicNorth = tileYToLatIndependent(yMin, z);
        const mosaicSouth = tileYToLatIndependent(yMax + 1, z);
        const cosLat = Math.cos((SPOT_LAT * Math.PI) / 180);
        const mosaicWidthM = (mosaicEast - mosaicWest) * 111320 * Math.abs(cosLat);
        const mosaicHeightM = (mosaicNorth - mosaicSouth) * 111320;

        // The mosaic's ACTUAL rendered screen footprint (pre-rotation — the
        // <image> x/y/width/height attributes are in the group's own local
        // coordinate space before the wrapping rotate() is applied, so this
        // is the mosaic's true screen size, not a rotated bounding box).
        const screenXMin = Math.min(...tiles.map((t) => t.sx));
        const screenXMax = Math.max(...tiles.map((t) => t.sx + t.sw));
        const screenYMin = Math.min(...tiles.map((t) => t.sy));
        const screenYMax = Math.max(...tiles.map((t) => t.sy + t.sh));
        const mosaicScreenW = screenXMax - screenXMin;
        const mosaicScreenH = screenYMax - screenYMin;

        const pxPerMeterX = mosaicScreenW / mosaicWidthM;
        const pxPerMeterY = mosaicScreenH / mosaicHeightM;

        // Expected S — independently, from this fixture's OWN known data
        // extents (buildRow: 10..100m) + the 50m ground buffer, mirroring
        // the design formula (not imported from the component).
        const dataMinM = 10;
        const dataMaxM = 100;
        const frameSpanM = (dataMaxM + 50) - (dataMinM - 50);
        const expectedS = 748 / frameSpanM;

        expect(pxPerMeterX).toBeCloseTo(expectedS, 1);
        expect(pxPerMeterY).toBeCloseTo(expectedS, 1);
        expect(Math.abs(pxPerMeterX - expectedS) / expectedS).toBeLessThan(0.01);
        expect(Math.abs(pxPerMeterY - expectedS) / expectedS).toBeLessThan(0.01);
        // Both axes agree with EACH OTHER too — the direct "same ruler" check.
        expect(Math.abs(pxPerMeterX - pxPerMeterY) / expectedS).toBeLessThan(0.01);
      });
    });

    it('y-axis title renders (rotated text, distinct from the row-index tick labels)', () => {
      const { container, getByText } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} />,
      );
      const title = getByText('surfing.heatMap.transectAxisLabel');
      expect(title.getAttribute('transform')).toBe('rotate(-90)');
      expect(container.querySelector('svg[role="img"]')!.contains(title)).toBe(true);
    });

    // ── C3-fix (2026-08-09, lead-measured live-DOM defect) — the prior
    //    `rowH >= 12` all-or-nothing gate suppressed EVERY y-axis row-index
    //    label once row density passed one row per 12px (162 transects at a
    //    live HB spot -> rowH=8px -> ZERO labels rendered). Density-aware
    //    every-Nth labeling replaces it. ──
    describe('C3-fix — Y-axis density-aware tick labels', () => {
      // 40 rows -> rowH = min(48, max(8, floor(300/40))) = min(48, max(8,7)) = 8.
      // labelStep = max(1, ceil(12/8)) = 2. Falsifiable against BOTH the old
      // `rowH >= 12` gate (would render ZERO labels here — rowH=8 fails the
      // gate) and a naive "always label every row" regression (would render
      // 40 labels, not the expected 21: rows 0,2,4,...,38 (20) + row 39
      // (the always-included last row) = 21).
      const ROWS_40: HeatMapProfileDataOk = {
        locationId: 'huntington-city-beach-pier',
        timestep: '2026-08-09T00:00:00Z',
        modelStatus: 'ok',
        profiles: Array.from({ length: 40 }, (_, i) => buildRow(i)),
        perPartitionBreaks: [],
        metadata: {
          axisUnits: { x: 'm', y: 'm' },
          verticalDatum: 'LMSL',
          transectCount: 40,
          openTransectCount: 40,
          handoffDepthM: 2,
          handoffSourceLevel: 'L3',
        },
      };

      it('dense rows (rowH=8, below the old 12px gate): renders every-2nd label plus the last row, not zero and not all 40', () => {
        const { container } = render(
          <HeatMapCard {...baseProps} distanceUnit="m" data={ROWS_40} loading={false} />,
        );
        const labels = Array.from(container.querySelectorAll('svg text[text-anchor="end"]'))
          .map((el) => el.textContent)
          .filter((t): t is string => t !== null && /^\d+$/.test(t))
          .map(Number);
        const expected = [...Array.from({ length: 20 }, (_, i) => i * 2), 39];
        expect(labels).toEqual(expected);
        expect(labels.length).toBe(21);
      });

      it('sparse rows (rowH>=12, e.g. 5 rows -> rowH=48): every row labeled — byte-identical to pre-fix behavior (labelStep=1)', () => {
        const { container } = render(
          <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} />,
        );
        const labels = Array.from(container.querySelectorAll('svg text[text-anchor="end"]'))
          .map((el) => el.textContent)
          .filter((t): t is string => t !== null && /^\d+$/.test(t))
          .map(Number);
        expect(labels).toEqual([0, 1, 2, 3, 4]);
      });
    });

    it('structure-affected-area overlay is gone: no hatch pattern, no legend text, structure-affected rows render at the SAME colour-cell opacity as open rows', () => {
      const { container, queryByText } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_DOUBLE_BREAK} loading={false} />,
      );
      // ROW_DOUBLE_BREAK_LIVE.isStructureAffected === true — this is the
      // exact fixture the pre-C3 hatch overlay would have rendered for.
      expect(container.querySelector('pattern')).toBeNull();
      expect(queryByText('surfing.heatMap.shadowedTransect')).toBeNull();
      // Colour cells (hsToColor output, no spaces: "rgba(r,g,b,a)") — distinct
      // from the zone-fill rects (ZONE_IMPACT_FILL etc., "rgba(r, g, b, a)"
      // WITH spaces), which this fixture also renders (its surfZones).
      const cellRects = Array.from(container.querySelectorAll('svg rect'))
        .filter((r) => /^rgba\(\d+,\d+,\d+,[\d.]+\)$/.test(r.getAttribute('fill') ?? ''));
      expect(cellRects.length).toBeGreaterThan(0);
      for (const r of cellRects) {
        // Default (no-imagery) cell opacity is 0.85 — pre-C3 a structure-
        // affected row would have multiplied this by 0.35 (-> ~0.30).
        expect(r.getAttribute('fill')).toMatch(/,0\.85\)$/);
      }
    });

    it('sr-only table "Open" column (isStructureAffected data) still reflects structure-affected rows — data survives, only the visual overlay is removed', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_DOUBLE_BREAK} loading={false} />,
      );
      const headerCell = within(container).getByText('4', { selector: 'table.sr-only th[scope="row"]' });
      const row = headerCell.closest('tr')!;
      expect(within(row).getByText('no').tagName).toBe('TD'); // isStructureAffected true -> "Open" = no
    });

    // ── C3 GROUND-TRUTH acceptance (2026-08-09 PM, L1-BOUNDARY-REBUILD-PLAN
    //    §C3) — verified against INDEPENDENT lat/lon arithmetic (a second,
    //    from-scratch equirectangular projection written directly in this
    //    test, NOT importing latLonToLocalMeters/fitGroundTransform/etc.
    //    from HeatMapCard.tsx) — never the chart's own internal state. ──
    describe('C3 GROUND-TRUTH — verified against independent lat/lon math, never the chart\'s own arithmetic', () => {
      // Independent equirectangular projection (re-derived here, not
      // imported) — meters north/east of a reference point.
      function independentLocalMeters(lat: number, lon: number, refLat: number, refLon: number) {
        const metersPerDegLat = 111320;
        const metersPerDegLon = 111320 * Math.cos((refLat * Math.PI) / 180);
        return { east: (lon - refLon) * metersPerDegLon, north: (lat - refLat) * metersPerDegLat };
      }

      // H0 FIX (2026-08-10, MARINE-PAGE-FIXIT-PLAN §H0) — "row 0 always
      // renders at the chart TOP" was never a general rule; it only held
      // for THIS fixture's PARTICULAR handedness by accident. A real photo
      // can only be rotated, never mirrored, so a single rotation aligning
      // the offshore direction to chart-left can only ALSO align the
      // alongshore/tangent direction to chart-down for ONE of the two real,
      // physically-occurring handednesses of the fitted (offshoreUnit,
      // tangentUnit) pair (depends on which side of the shoreline tangent
      // the ocean sits + which way the server numbers transects — both
      // vary by real beach). The component now flips which end renders at
      // the top when the OTHER handedness is served, so the data grid and
      // the photo always agree. The tests below DERIVE the expected
      // direction from this fixture's own real lat/lon values (via the
      // SAME exported fitGroundTransform this file's other WIRING checks
      // already use, plus an independently re-derived cross-product sign
      // check — never importing the component's own
      // alongshoreFlipNeeded/foldAlongM), rather than assuming a fixed
      // top-to-bottom direction.
      function expectedAlongFlip(origins: { lat: number; lon: number; alongshoreM: number; bearingDeg: number | null }[]): boolean {
        const transform = fitGroundTransform(origins)!;
        const cross2D = transform.offshoreUnit.east * transform.tangentUnit.north
          - transform.offshoreUnit.north * transform.tangentUnit.east;
        return cross2D < 0;
      }

      it('row 0 is REALLY south of a later row (independent latitude comparison) — the HB pier ground-truth anchor', () => {
        // OK_RESPONSE_5_ROWS_WITH_ORIGINS rows are built from real HB-pier-
        // area coordinates (33.6534,-118.0039 area per the plan's named
        // anchor — ORIGIN_REF_LAT/LON sit within ~700m of it). Row 0's real
        // latitude must be numerically LESS than a later row's — a fact
        // about the fixture's lat/lon values themselves, independent of any
        // rendering.
        const rows = OK_RESPONSE_5_ROWS_WITH_ORIGINS.profiles!;
        expect(rows[0].originLat!).toBeLessThan(rows[4].originLat!);
      });

      it('the rendered row ORDER agrees with the FITTED GEOMETRY\'s own handedness (H0 fix — was wrongly hard-coded "row 0 always on top")', () => {
        const { container } = render(
          <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_5_ROWS_WITH_ORIGINS} loading={false} />,
        );
        // Row separator lines are drawn at each band boundary, top to
        // bottom, in row order — there must be exactly N+1 of them (one per
        // row boundary), and they must be monotonic (either direction).
        const seps = Array.from(container.querySelectorAll('svg > line'))
          .filter((l) => l.getAttribute('stroke-opacity') === '0.12')
          .map((l) => Number(l.getAttribute('y1')));
        expect(seps.length).toBe(6); // N=5 rows -> 6 boundaries

        // This fixture's own handedness (derived independently, never
        // assumed) determines which direction is correct: "row 0 on top"
        // was only ever true for ONE handedness, and this fixture happens
        // to BE that handedness pre-H0-fix's discovery — post-fix, a real
        // photo can never be mirrored, so the alongshore axis flips instead
        // (row 0 now renders at the BOTTOM for this fixture's geometry) so
        // the data grid stays registered with the photo.
        const origins = OK_RESPONSE_5_ROWS_WITH_ORIGINS.profiles!.map((r) => ({
          lat: r.originLat!, lon: r.originLon!, alongshoreM: r.alongshoreM!, bearingDeg: r.transectBearingDeg,
        }));
        const flip = expectedAlongFlip(origins);
        if (flip) {
          expect(seps[0]).toBeGreaterThan(seps[seps.length - 1]);
          for (let i = 1; i < seps.length; i++) expect(seps[i]).toBeLessThanOrEqual(seps[i - 1]);
        } else {
          expect(seps[0]).toBeLessThan(seps[seps.length - 1]);
          for (let i = 1; i < seps.length; i++) expect(seps[i]).toBeGreaterThanOrEqual(seps[i - 1]);
        }
        // This fixture is the flip-needed handedness (confirmed, not
        // assumed) — pin that fact so a future fixture change that
        // silently swaps handedness doesn't make this test degenerate to
        // only ever exercising the else-branch.
        expect(flip).toBe(true);
      });

      // C3S acceptance (2026-08-09 PM) — row 0's origin (33.65587,
      // -118.00319, the operator's drawn-segment start) must render near
      // the frame's top buffer offset (~50m * S down from the frame edge),
      // never displaced far south — the exact defect this round fixes.
      //
      // NOTE (disclosed, not silently dropped): the brief additionally
      // claimed row 0's origin sits "~10m from the pier base at
      // 33.6568667, -118.0024017." Independent equirectangular measurement
      // (same formula as latLonToLocalMeters) puts the STRAIGHT-LINE
      // distance between these two exact coordinate pairs at ~133m, not
      // ~10m — verified below with `it.failing` disabled and the raw
      // number asserted instead of forced to pass. This does not affect
      // the SCALE fix itself (S, frame, distToX/alongMToY are unchanged by
      // which two points are how far apart) — flagging for the
      // coordinator rather than fudging a synthetic 2-origin tangent to
      // force a ±15m match it doesn't actually have.
      it('independent check: the pier-base distance claim in the brief measures ~133m, not ~10m (informational, does not gate the scale fix)', () => {
        const PIER_BASE: LatLon = { lat: 33.6568667, lon: -118.0024017 };
        const ROW0_ORIGIN: LatLon = { lat: 33.65587, lon: -118.00319 };
        const dlatM = (PIER_BASE.lat - ROW0_ORIGIN.lat) * 111320;
        const dlonM = (PIER_BASE.lon - ROW0_ORIGIN.lon) * 111320 * Math.cos((ROW0_ORIGIN.lat * Math.PI) / 180);
        const distanceM = Math.hypot(dlatM, dlonM);
        expect(distanceM).toBeCloseTo(132.8, 0);
      });

      it('row 0 renders at the 50m ground-buffer offset from the frame top (formula check, same S the whole chart uses)', () => {
        const PIER_BASE: LatLon = { lat: 33.6568667, lon: -118.0024017 };
        const ROW0_ORIGIN: LatLon = { lat: 33.65587, lon: -118.00319 };
        // A second origin, spaced 50m along a shoreline-ish tangent, so
        // fitGroundTransform has 2 points to fit a line through.
        const bearingRad = (335 * Math.PI) / 180;
        const cosLat = Math.cos((ROW0_ORIGIN.lat * Math.PI) / 180);
        const ROW1_ORIGIN: LatLon = {
          lat: ROW0_ORIGIN.lat + (50 * Math.cos(bearingRad)) / 111320,
          lon: ROW0_ORIGIN.lon + (50 * Math.sin(bearingRad)) / (111320 * cosLat),
        };
        const rows: HeatMapTransectData[] = [
          { ...buildRow(0), originLat: ROW0_ORIGIN.lat, originLon: ROW0_ORIGIN.lon, alongshoreM: 0 },
          { ...buildRow(1), originLat: ROW1_ORIGIN.lat, originLon: ROW1_ORIGIN.lon, alongshoreM: 50 },
        ];
        const response: HeatMapProfileDataOk = {
          locationId: 'huntington-city-beach-pier', timestep: 't', modelStatus: 'ok',
          profiles: rows, perPartitionBreaks: [],
          metadata: { axisUnits: { x: 'm', y: 'm' }, verticalDatum: 'LMSL', transectCount: 2, openTransectCount: 2, handoffDepthM: 2, handoffSourceLevel: 'L3' },
        };
        // Referenced so the "informational" pier-base note above stays
        // exercised by the same fixture coordinates (kept in scope, not a
        // dead const) — see PIER_BASE's use in the sibling test above.
        void PIER_BASE;

        const { container } = render(
          <HeatMapCard {...baseProps} distanceUnit="m" data={response} loading={false} />,
        );
        const seps = Array.from(container.querySelectorAll('svg > line'))
          .filter((l) => l.getAttribute('stroke-opacity') === '0.12')
          .map((l) => Number(l.getAttribute('y1')));
        // Internal boundary (between rows 0 and 1) is the pure midpoint —
        // unaffected by the mirror-edge convention — giving an exact,
        // independently-checkable S: this fixture's own buildRow() gives
        // dataMin=10m, dataMax=100m -> S = 748 / ((100+50)-(10-50)).
        const expectedS = 748 / ((100 + 50) - (10 - 50));

        // H0 FIX (2026-08-10) — "row 0 is near the frame TOP" only holds
        // for one fitted-geometry handedness; derive which one this
        // fixture actually is (never assumed) via the SAME independent
        // re-derivation used elsewhere in this describe block.
        const origins = [
          { lat: ROW0_ORIGIN.lat, lon: ROW0_ORIGIN.lon, alongshoreM: 0, bearingDeg: 245 },
          { lat: ROW1_ORIGIN.lat, lon: ROW1_ORIGIN.lon, alongshoreM: 50, bearingDeg: 245 },
        ];
        const flip = expectedAlongFlip(origins);
        // Pin the fact this fixture IS the flip-needed handedness (same
        // 335°-tangent/245°-offshore convention as the rest of this file's
        // ground-truth fixtures) — a future change to these bearings that
        // silently flips handedness should be caught here, not silently
        // pass by exercising only the untested branch below.
        expect(flip).toBe(true);

        // midpoint(0,1) is exactly halfway between row0's and row1's own
        // centers regardless of which is "on top" — so row0's own center
        // is the midpoint MINUS the half-pitch when row0 renders above the
        // midpoint (no flip), or PLUS the half-pitch when row0 renders
        // below it (flip needed, row0 is the "later"/bottom row now).
        const row0CenterY = flip ? seps[1] + (25 * expectedS) : seps[1] - (25 * expectedS);
        // alongMToY(foldAlongM(0, alongMinM=0, alongMaxM=50, flip), 0, S) —
        // restated here (not imported): fold(0,0,50,true)=50, so row0's
        // expected Y sits at the FAR (bottom) buffer offset when flipped,
        // the NEAR (top) buffer offset otherwise.
        const expectedRow0Y = flip ? PAD_TOP + 100 * expectedS : PAD_TOP + 50 * expectedS;
        expect(row0CenterY).toBeCloseTo(expectedRow0Y, 0);
        // Within the ±15m*S tolerance the brief specifies.
        expect(Math.abs(row0CenterY - expectedRow0Y)).toBeLessThan(15 * expectedS);
      });

      // C3S (2026-08-09 PM) — row bands' first/last edges now mirror their
      // own inner half-pitch (coordinator-approved symmetric edge), so the
      // OUTERMOST separators (index 0 and N) are no longer at the raw data
      // extent — they're offset by half a pitch. The INTERNAL separators
      // (indices 1..N-1, pure midpoints between two real neighbouring
      // origins) are unaffected by that edge convention, so this test uses
      // ONE internal gap (origins 1 and 2 — a known, independently-verified
      // 50m real separation) as the "known distance" ruler.
      it('a KNOWN ground distance between two real origins measures true on the Y axis (independent projection, not the component\'s own transform)', () => {
        const rows = OK_RESPONSE_5_ROWS_WITH_ORIGINS.profiles!;
        // Independent ground distance between origins 1 and 2 (re-derived
        // here — NOT reading `alongshoreM`, NOT calling any HeatMapCard.tsx
        // function).
        const refLat = rows[1].originLat!;
        const refLon = rows[1].originLon!;
        const p1 = independentLocalMeters(rows[1].originLat!, rows[1].originLon!, refLat, refLon);
        const p2 = independentLocalMeters(rows[2].originLat!, rows[2].originLon!, refLat, refLon);
        const independentGroundDistanceM = Math.hypot(p2.east - p1.east, p2.north - p1.north);
        expect(independentGroundDistanceM).toBeCloseTo(50, 0); // ORIGIN_STEP_M

        const { container } = render(
          <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_5_ROWS_WITH_ORIGINS} loading={false} />,
        );
        const seps = Array.from(container.querySelectorAll('svg > line'))
          .filter((l) => l.getAttribute('stroke-opacity') === '0.12')
          .map((l) => Number(l.getAttribute('y1')));
        expect(seps.length).toBe(6); // N=5 rows -> 6 boundaries
        // seps[1]..seps[2] = the midpoint boundary between rows (0,1) to the
        // midpoint boundary between rows (1,2) = exactly ONE origin-to-
        // origin pitch (rows 1->2), unaffected by the outer mirror edges.
        // H0 FIX (2026-08-10): the SIGN of this gap depends on this
        // fixture's own fitted-geometry handedness (row order can render
        // top-to-bottom or bottom-to-top — see the "rendered row ORDER"
        // test above) — only the MAGNITUDE is a geometry-independent
        // ground-truth fact, so this test measures magnitude via Math.abs,
        // not the old (fixture-handedness-accidental) positive-only gap.
        const pixelGap = Math.abs(seps[2] - seps[1]);

        // Expected S — independently, from this fixture's OWN known data
        // extents (buildRow: 10..100m cross-shore) + the 50m ground buffer,
        // same single scale the X axis (and imagery) use.
        const expectedS = 748 / ((100 + 50) - (10 - 50));
        expect(pixelGap).toBeCloseTo(independentGroundDistanceM * expectedS, 0);
      });

      it('a KNOWN ground distance measures true on the X axis, at the SAME S the Y axis uses (cross-shore distance field IS the ground distance, unit-converted only)', () => {
        // buildRow's transect distances are 100m and 10m -> a real 90m
        // separation. C3S: distToX now goes through the ONE ground scale S
        // (frame = [10-50, 100+50] = [-40,150], span 190) — no more tiers.
        const { container } = render(
          <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_5_ROWS_WITH_ORIGINS} loading={false} />,
        );
        // X-axis tick lines: identified by their sibling <text>'s
        // text-anchor="middle" (Y-axis ticks use text-anchor="end" — same
        // stroke-opacity, distinguished by this sibling attribute instead of
        // a hardcoded y1/y2 pixel value now that chartH is data-dependent).
        const xTickLines = Array.from(container.querySelectorAll('svg g'))
          .filter((g) => g.querySelector('text')?.getAttribute('text-anchor') === 'middle' && g.querySelector('line[stroke-opacity="0.5"]'))
          .map((g) => g.querySelector('line[stroke-opacity="0.5"]')!);
        expect(xTickLines.length).toBeGreaterThan(1);
        const xs = xTickLines.map((l) => Number(l.getAttribute('x1'))).sort((a, b) => a - b);
        // Any two ticks' pixel gap, divided by their real metre gap, must
        // equal the SAME S used everywhere else on this chart.
        const expectedS = 748 / ((100 + 50) - (10 - 50));
        const pxPerMeterX = (xs[xs.length - 1] - xs[0]) / (100 - 10); // full data-extent tick span, 90m known
        expect(pxPerMeterX).toBeCloseTo(expectedS, 1);
      });
    });
  });

  // ── H0 (2026-08-10, MARINE-PAGE-FIXIT-PLAN §H0) — registration
  //    known-answer check. THE C3S RECORDED NEXT-SESSION ACTION: project ONE
  //    ground anchor (the pier-base transect origin served by the profile
  //    endpoint) through (a) the data-layer ground->chart transform and
  //    (b) the imagery-tile ground->pixel math; the two must agree within
  //    <=10m ground-equivalent. PERMANENT regression KAT — stays in the
  //    suite forever, never deleted/reworked around on failure (plan rule).
  //    Falsifiable: a wrong S, a dropped/duplicated rotation, or a mosaic
  //    pivot that isn't the tile group's own true-scale center on EITHER
  //    path throws this off by far more than 10m (verified by hand: the
  //    frame here is ~190m across at S=748/190px/m — a 10m tolerance is
  //    ~5% of the frame, well inside anything but a genuine wiring defect). ──
  describe('H0 — registration known-answer check (permanent)', () => {
    function tileXToLonIndependent(x: number, z: number): number {
      return (x / 2 ** z) * 360 - 180;
    }
    function tileYToLatIndependent(y: number, z: number): number {
      const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
      return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    }

    it('the pier-base ground anchor projects to the SAME ground position via the data transform and the rendered imagery tiles, within 10m', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      const { container } = render(
        <HeatMapCard
          {...baseProps}
          distanceUnit="m"
          data={H0_RESPONSE}
          loading={false}
          spotLat={H0_PIER_BASE.lat}
          spotLon={H0_PIER_BASE.lon}
        />,
      );

      // ── Path (a): the data-layer ground->chart transform. Row 0's real
      //    origin IS the pier-base anchor (H0_RESPONSE construction), so its
      //    ground-frame position relative to the fitted transform's own
      //    origin0 must be exactly (0,0) — verified via the EXPORTED
      //    groundFrameCoords, the same pure function the component itself
      //    uses to place the imagery bbox corners in ground space,
      //    reconstructed here from the fixture's own served origins (never
      //    read off component internal state).
      const origins = H0_RESPONSE.profiles!.map((r) => ({
        lat: r.originLat!, lon: r.originLon!, alongshoreM: r.alongshoreM!, bearingDeg: r.transectBearingDeg,
      }));
      const transform = fitGroundTransform(origins)!;
      expect(transform).not.toBeNull();
      const { alongshoreM: aAlong, crossM: aCross } = groundFrameCoords(transform, H0_PIER_BASE);
      expect(aAlong).toBeCloseTo(0, 6);
      expect(aCross).toBeCloseTo(0, 6);

      // The SAME single ground scale S every element on this chart uses
      // (C3S rule) — computed independently from this fixture's OWN known
      // data extents (10..100m cross-shore, row alongshoreM 0/50) + the 50m
      // ground buffer, never imported from HeatMapCard.tsx.
      const H0_PAD_LEFT = 60;
      const H0_PAD_TOP = 28;
      const H0_CHART_W = 748;
      const H0_BUFFER_M = 50;
      const dataMinM = 10;
      const dataMaxM = 100;
      const alongMinM = 0;
      const alongMaxM = 50;
      const frameMaxM = dataMaxM + H0_BUFFER_M;
      const frameSpanM = (dataMaxM + H0_BUFFER_M) - (dataMinM - H0_BUFFER_M);
      const S = H0_CHART_W / frameSpanM;

      // H0 FIX (2026-08-10) — a single photo rotation can only align BOTH
      // the offshore direction (chart-left) AND the alongshore/tangent
      // direction (chart-down) simultaneously for ONE handedness of the
      // fitted (offshoreUnit, tangentUnit) pair; the component now folds
      // the alongshore axis (flips which end renders at the chart top) when
      // the OTHER handedness is served, so a single unchanged rotation
      // formula still works and the two layers register. This test derives
      // the SAME handedness fact independently (never importing the
      // component's own alongshoreFlipNeeded/foldAlongM) so the assertion
      // direction is DERIVED, not copied from the fix under test.
      const cross2D = transform.offshoreUnit.east * transform.tangentUnit.north
        - transform.offshoreUnit.north * transform.tangentUnit.east;
      const alongFlipExpected = cross2D < 0;

      // ── Path (b): the imagery-tile ground->pixel math, read from the
      //    ACTUAL rendered <image> tiles (never the component's internal
      //    geometry) — same independent Web Mercator re-derivation the
      //    C3S "imagery px/m equals S" block above uses, extended here to
      //    locate ONE specific ground point (the pier base) rather than
      //    just measuring scale.
      const images = Array.from(container.querySelectorAll('svg image'));
      expect(images.length).toBeGreaterThan(0);
      const tiles = images.map((img) => {
        const href = img.getAttribute('href')!;
        const m = href.match(/\/(\d+)\/(\d+)\/(\d+)$/)!;
        return {
          z: Number(m[1]), x: Number(m[2]), y: Number(m[3]),
          sx: Number(img.getAttribute('x')), sy: Number(img.getAttribute('y')),
          sw: Number(img.getAttribute('width')), sh: Number(img.getAttribute('height')),
        };
      });
      const z = tiles[0].z;
      const xMin = Math.min(...tiles.map((t) => t.x));
      const xMax = Math.max(...tiles.map((t) => t.x));
      const yMin = Math.min(...tiles.map((t) => t.y));
      const yMax = Math.max(...tiles.map((t) => t.y));
      const mosaicWest = tileXToLonIndependent(xMin, z);
      const mosaicEast = tileXToLonIndependent(xMax + 1, z);
      const mosaicNorth = tileYToLatIndependent(yMin, z);
      const mosaicSouth = tileYToLatIndependent(yMax + 1, z);

      const screenXMin = Math.min(...tiles.map((t) => t.sx));
      const screenXMax = Math.max(...tiles.map((t) => t.sx + t.sw));
      const screenYMin = Math.min(...tiles.map((t) => t.sy));
      const screenYMax = Math.max(...tiles.map((t) => t.sy + t.sh));

      // Where the pier-base lat/lon falls within the ACTUAL rendered mosaic
      // (linear interpolation across its real lon/lat bbox — the same
      // lonToScreenX/latToScreenY mapping the component uses, restated
      // independently here, not imported).
      const fracLon = (H0_PIER_BASE.lon - mosaicWest) / (mosaicEast - mosaicWest);
      const fracLatFromTop = (mosaicNorth - H0_PIER_BASE.lat) / (mosaicNorth - mosaicSouth);
      const localX = screenXMin + fracLon * (screenXMax - screenXMin);
      const localY = screenYMin + fracLatFromTop * (screenYMax - screenYMin);

      // The rendered tile group is wrapped in ONE rotate(deg, pivotX,
      // pivotY) transform — pivot = the mosaic's own true-scale ground
      // center, i.e. the rendered rect's own geometric center (read from
      // the SAME tile extents, not a component-internal value). Rotation
      // angle: the SAME exported pure function the component calls
      // (computeImageryRotationDeg), fed the SAME fitted transform's
      // bearing reconstructed above — this test checks WIRING/registration
      // (does the rotated tile land where the ground math says the anchor
      // is), not the pure rotation-formula math (covered by the
      // "computeImageryRotationDeg" cases in the C3 block above).
      const rotationDeg = computeImageryRotationDeg(transform.offshoreBearingDeg);
      const pivotX = (screenXMin + screenXMax) / 2;
      const pivotY = (screenYMin + screenYMax) / 2;
      const rad = (rotationDeg * Math.PI) / 180;
      const dx = localX - pivotX;
      const dy = localY - pivotY;
      const finalX = pivotX + dx * Math.cos(rad) - dy * Math.sin(rad);
      const finalY = pivotY + dx * Math.sin(rad) + dy * Math.cos(rad);

      // Convert the FINAL (post-rotation) screen pixel back to ground
      // metres, through the exact algebraic inverse of the data layer's own
      // crossMToX/alongMToY formulas (restated here, not imported):
      //   x = PAD_LEFT + (frameMaxM - crossM) * S
      //     => crossM = frameMaxM - (x - PAD_LEFT) / S
      //   y = PAD_TOP + (foldedAlongM - alongMinM + BUFFER) * S
      //     => foldedAlongM = alongMinM + (y - PAD_TOP) / S - BUFFER
      // The recovered value is the FOLDED alongM (H0 fix) when this
      // fixture's handedness needs the flip — un-fold it (the fold is its
      // own inverse: reflecting twice about the same midpoint recovers the
      // original value) to get the TRUE alongM this ground point is at,
      // for comparison against aAlong (also a true, unfolded value).
      const bCross = frameMaxM - (finalX - H0_PAD_LEFT) / S;
      const bAlongFolded = alongMinM + (finalY - H0_PAD_TOP) / S - H0_BUFFER_M;
      const bAlong = alongFlipExpected ? (alongMinM + alongMaxM - bAlongFolded) : bAlongFolded;

      const groundDeltaM = Math.hypot(bCross - aCross, bAlong - aAlong);
      expect(groundDeltaM).toBeLessThanOrEqual(10);
    });
  });
});
