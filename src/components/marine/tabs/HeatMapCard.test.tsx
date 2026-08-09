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
import { render, within } from '@testing-library/react';
import { HeatMapCard, computeImageryRotationDeg } from './HeatMapCard';
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

  // Tier-selection parity fix (2026-08-02): mirrors BeachProfileChart's
  // Math.abs() fix (BeachProfileCardBody.test.tsx
  // OK_RESPONSE_ALL_NEGATIVE_BREAKS — same Huntington Beach numbers, -223
  // and -240), generalized ACROSS ROWS — the outermost break's MAGNITUDE,
  // from ANY row, drives the one shared x-axis, not just one row's own
  // breaks. Before this fix, HeatMapCard had no tier concept at all (always
  // full transect extent, ~2227m); now it must pick the same Standard tier
  // (300m) BeachProfileChart would for the same break distances.
  it('tier selection parity (all-negative breaks, cross-row): picks Standard tier (max tick 300)', () => {
    const { container } = render(
      <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_ALL_NEGATIVE_BREAKS} loading={false} />,
    );
    // Locale 'en' comma-groups >= 1000 (e.g. "1,000") — stripped here so a
    // >=1000 tier's ticks are still comparable integers, not silently
    // excluded by the digit-only regex.
    const tickTexts = Array.from(container.querySelectorAll('svg text'))
      .map((el) => (el.textContent ?? '').replace(/,/g, ''))
      .filter((s) => /^\d+$/.test(s))
      .map(Number);
    expect(tickTexts.length).toBeGreaterThan(0);
    expect(Math.max(...tickTexts)).toBe(300);

    // Clipping parity: the color cell reaching all the way to 2227 (the
    // pre-fix full extent) must NOT be present — every COLOR CELL stays
    // within the tier-clipped drawable area. Excludes the break-zone-band
    // rect (fill=ZONE_BREAK_FILL): that's a PRE-EXISTING, unrelated overflow
    // in break-point rendering (bx +/- a fixed 5%-of-chart-width halfW, no
    // edge clamp) that reproduces even against the OLD unclamped domain
    // whenever a break sits this close to the domain's negative minimum —
    // not introduced by this fix, and break-point rendering is out of scope
    // for this task (MUST NOT TOUCH).
    const ZONE_BREAK_FILL = 'rgba(59, 130, 246, 0.12)';
    const EPSILON = 0.5;
    const rects = Array.from(container.querySelectorAll('svg rect'))
      .filter((r) => r.getAttribute('fill') !== ZONE_BREAK_FILL);
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of Array.from(rects)) {
      const x = Number(rect.getAttribute('x'));
      const width = Number(rect.getAttribute('width'));
      expect(x).toBeGreaterThanOrEqual(PAD_LEFT - EPSILON);
      expect(x + width).toBeLessThanOrEqual(PAD_LEFT + CHART_W + EPSILON);
    }
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
      expect(withOverlay.container.querySelector('svg')?.getAttribute('viewBox'))
        .toBe(withoutOverlayProp.container.querySelector('svg')?.getAttribute('viewBox'));
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
    const IMAGERY_MOSAIC_MAX_TILES_PER_SIDE = 4;
    const HEATMAP_CELL_OPACITY_ON_ORTHO = 0.55;

    const SPOT_LAT = 33.6595;
    const SPOT_LON = -118.0064;

    // KAT (b) golden fixture — captured from the git HEAD (pre-LM-2)
    // HeatMapCard.tsx rendering OK_RESPONSE_5_ROWS with baseProps, via a
    // throwaway `git show HEAD:...` copy rendered once and diffed byte-for-
    // byte against this literal (see LM-2 closeout for the capture method).
    //
    // D7s update (ROUND-D5-BEACH-PROFILE-CARD-BRIEF-2026-08-05): the median-5
    // smoothing note (`<p>...smoothingNote</p>`) and each colour cell's
    // `<title>` tooltip are NEW, intentional, unconditional additions — this
    // fixture is not "the pre-D7s render" anymore, only "the pre-LM-2
    // imagery-path render plus D7s's two additions." Re-verified byte-for-
    // byte against the actual rendered output for this exact fixture
    // (OK_RESPONSE_5_ROWS's 5 rows each produce one flat cell with an
    // identical median-5 value of 1.2, matching the pre-existing legend max
    // of "1.2 ft" already in this string) — not hand-typed.
    // A REAL DOM-identity comparison, not a "renders without crashing" smoke
    // test — any change to the no-imagery render path, however small, fails
    // this immediately.
    const GOLDEN_NO_IMAGERY_HTML = '<div class="rounded-xl bg-[var(--card-glass)] p-[var(--card-pad)]"><h3 class="font-semibold text-[var(--foreground)] mb-3 text-sm">surfing.heatMapTitle</h3><div class="w-full overflow-x-auto"><svg role="img" aria-labelledby="_r_0_ _r_1_" viewBox="0 0 820 320" width="100%" style="display: block; min-width: 260px;"><title id="_r_0_">surfing.heatMapAriaLabel</title><desc id="_r_1_">surfing.heatMapDesc</desc><defs></defs><rect x="60" y="28" width="748" height="240" fill="var(--card-glass)" opacity="0.3"></rect><line x1="60" y1="28" x2="808" y2="28" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><line x1="60" y1="76" x2="808" y2="76" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><line x1="60" y1="124" x2="808" y2="124" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><line x1="60" y1="172" x2="808" y2="172" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><line x1="60" y1="220" x2="808" y2="220" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><line x1="60" y1="268" x2="808" y2="268" stroke="var(--muted-foreground)" stroke-opacity="0.12" stroke-width="0.5"></line><rect x="579.951219512195" y="28" width="205.2439024390244" height="48" fill="rgba(220,38,38,0.85)"><title>1.2 ft</title></rect><rect x="579.951219512195" y="76" width="205.2439024390244" height="48" fill="rgba(220,38,38,0.85)"><title>1.2 ft</title></rect><rect x="579.951219512195" y="124" width="205.2439024390244" height="48" fill="rgba(220,38,38,0.85)"><title>1.2 ft</title></rect><rect x="579.951219512195" y="172" width="205.2439024390244" height="48" fill="rgba(220,38,38,0.85)"><title>1.2 ft</title></rect><rect x="579.951219512195" y="220" width="205.2439024390244" height="48" fill="rgba(220,38,38,0.85)"><title>1.2 ft</title></rect><text x="56" y="55.5" font-size="10" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">0</text><text x="56" y="103.5" font-size="10" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">1</text><text x="56" y="151.5" font-size="10" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">2</text><text x="56" y="199.5" font-size="10" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">3</text><text x="56" y="247.5" font-size="10" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">4</text><text transform="rotate(-90)" x="-148" y="10" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">surfing.heatMap.transectAxisLabel</text><g><line x1="808" y1="268" x2="808" y2="272" stroke="var(--muted-foreground)" stroke-opacity="0.5"></line><text x="808" y="282" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">0</text></g><g><line x1="621" y1="268" x2="621" y2="272" stroke="var(--muted-foreground)" stroke-opacity="0.5"></line><text x="621" y="282" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">82</text></g><g><line x1="434" y1="268" x2="434" y2="272" stroke="var(--muted-foreground)" stroke-opacity="0.5"></line><text x="434" y="282" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">164</text></g><g><line x1="247" y1="268" x2="247" y2="272" stroke="var(--muted-foreground)" stroke-opacity="0.5"></line><text x="247" y="282" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">246</text></g><g><line x1="60" y1="268" x2="60" y2="272" stroke="var(--muted-foreground)" stroke-opacity="0.5"></line><text x="60" y="282" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">328</text></g><text x="434" y="294" font-size="9" fill="var(--muted-foreground)" text-anchor="middle" aria-hidden="true">surfing.beachProfile.distanceAxisLabel</text><text x="806" y="22" font-size="9" fill="var(--muted-foreground)" text-anchor="end" aria-hidden="true">surfing.shore</text><text x="62" y="22" font-size="9" fill="var(--muted-foreground)" text-anchor="start" aria-hidden="true">surfing.offshore</text><defs><linearGradient id="heatmap-legend-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="rgb(59,130,246)"></stop><stop offset="25%" stop-color="rgb(13,148,159)"></stop><stop offset="50%" stop-color="rgb(34,197,94)"></stop><stop offset="75%" stop-color="rgb(234,179,8)"></stop><stop offset="100%" stop-color="rgb(220,38,38)"></stop></linearGradient></defs><rect x="648" y="296" width="160" height="10" fill="url(#heatmap-legend-gradient)" rx="3" opacity="0.85"></rect><text x="648" y="318" font-size="9" fill="var(--muted-foreground)" text-anchor="start">0 ft</text><text x="808" y="318" font-size="9" fill="var(--muted-foreground)" text-anchor="end">1.2 ft</text></svg></div><p class="mt-1 text-[var(--muted-foreground)]" style="font-size: var(--text-micro);">surfing.heatMap.smoothingNote</p><table class="sr-only"><caption>surfing.heatMapAriaLabel</caption><thead><tr><th scope="col">surfing.heatMap.transectIndex</th><th scope="col">surfing.heatMap.openTransect</th><th scope="col">surfing.heatMap.breakHeight</th><th scope="col">surfing.heatMap.breakDistance</th><th scope="col">surfing.heatMap.breakerType</th></tr></thead><tbody><tr><th scope="row">0</th><td>yes</td><td>—</td><td>—</td><td>—</td></tr><tr><th scope="row">1</th><td>yes</td><td>—</td><td>—</td><td>—</td></tr><tr><th scope="row">2</th><td>yes</td><td>—</td><td>—</td><td>—</td></tr><tr><th scope="row">3</th><td>yes</td><td>—</td><td>—</td><td>—</td></tr><tr><th scope="row">4</th><td>yes</td><td>—</td><td>—</td><td>—</td></tr></tbody></table></div>';

    it('KAT (a): fixture WITH imagery config -> ortho tiles render behind the heat map, colour cells at reduced opacity', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
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
      const svgHtml = container.querySelector('svg')!.innerHTML;
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

      // Attribution renders verbatim (never through t()).
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
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} spotLat={51.5} spotLon={-0.12} />,
      );
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
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.getAttribute('aria-labelledby')).toBeTruthy();

      const desc = container.querySelector('desc')!;
      expect(desc.textContent).toContain('surfing.heatMap.orthoImageryDesc');

      const images = Array.from(container.querySelectorAll('svg image'));
      expect(images.length).toBeGreaterThan(0);
      for (const img of images) {
        expect(img.closest('[aria-hidden="true"]')).not.toBeNull();
      }

      // Attribution: real, visible DOM text (findable by AT and sighted users alike).
      const attribution = getByText(NAIP_CONFIG.attribution);
      expect(attribution.closest('[aria-hidden="true"]')).toBeNull();
      expect(attribution.className).not.toContain('sr-only');
    });

    it('mosaic tile cap: never fetches more than IMAGERY_MOSAIC_MAX_TILES_PER_SIDE^2 tiles even for a very large study radius', () => {
      // Extended-tier fixture — tier maxDistance 1000m -> radius far larger
      // than a single-zoom-level mosaic can cover within the tile-count cap
      // without the cap binding (lead ruling: binding must be logged, not
      // silently under-cover without a trace — see console.debug in
      // computeImageryTiles(); not re-asserted here as a spy, covered by
      // code review + the closeout note).
      const bigRow: HeatMapTransectData = {
        transectIndex: 0,
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
      };
      const bigResponse: HeatMapProfileDataOk = {
        locationId: 'huntington-city-beach-pier',
        timestep: '2026-08-02T00:00:00Z',
        modelStatus: 'ok',
        profiles: [bigRow],
        perPartitionBreaks: [],
        metadata: {
          axisUnits: { x: 'm', y: 'm' },
          verticalDatum: 'LMSL',
          transectCount: 1,
          openTransectCount: 1,
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

  // ── D7s — median-5 display smoothing (standing operator request) ───────
  describe('D7s — median-5 smoothing', () => {
    it('a zeroed-out transect (row 2) is smoothed to the window median, not left showing its raw 0 value', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_SMOOTHING} loading={false} />,
      );
      // One <title> tooltip per row's single colour cell (each row has
      // exactly 2 transect points => 1 segment), in row order.
      const titles = Array.from(container.querySelectorAll('svg rect > title')).map((el) => el.textContent);
      expect(titles.length).toBe(5);
      expect(titles[0]).toBe('1 ft');    // row0: median([0.0,1.0,1.1]) = 1.0
      expect(titles[2]).toBe('1.1 ft');  // row2: median([0.0,1.0,1.1,1.3,1.4]) = 1.1 — NOT "0 ft"
      expect(titles[4]).toBe('1.3 ft');  // row4: median([0.0,1.3,1.4]) = 1.3
    });

    it('the smoothing note renders in plain words', () => {
      const { getByText } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_SMOOTHING} loading={false} />,
      );
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

    it('rotates the imagery tile group by the computed angle about the core chart-rectangle center', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      // OK_RESPONSE_5_ROWS: 5 rows, every row's transectBearingDeg = 245 ->
      // rotation = computeImageryRotationDeg(245) = 25°, regardless of which
      // row is picked as the reference (representative or middle-row
      // fallback both land on the same bearing here).
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      const rotatedGroup = Array.from(container.querySelectorAll('svg g')).find((g) =>
        (g.getAttribute('transform') ?? '').startsWith('rotate('),
      );
      expect(rotatedGroup).toBeDefined();
      // Core chart rect center: PAD_LEFT + CHART_W/2 = 60 + 374 = 434;
      // PAD_TOP + chartH/2 = 28 + 240/2 = 148 (N=5, rowH=48, chartH=240).
      expect(rotatedGroup!.getAttribute('transform')).toBe('rotate(25 434 148)');
      // The rotated group actually contains the tile <image> elements.
      expect(rotatedGroup!.querySelectorAll('image').length).toBeGreaterThan(0);
    });

    it('falls back to no rotation (0°) when no row carries a bearing', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      const noBearingRow: HeatMapTransectData = { ...buildRow(0), transectBearingDeg: null };
      const noBearingResponse: HeatMapProfileDataOk = {
        ...OK_RESPONSE_5_ROWS,
        profiles: [noBearingRow],
      };
      const { container } = render(
        <HeatMapCard {...baseProps} data={noBearingResponse} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      const rotatedGroup = Array.from(container.querySelectorAll('svg g')).find((g) =>
        (g.getAttribute('transform') ?? '').startsWith('rotate('),
      );
      expect(rotatedGroup).toBeDefined();
      expect(rotatedGroup!.getAttribute('transform')).toMatch(/^rotate\(0 /);
    });

    it('50m visible buffer: the imagery clip rect extends beyond the core plot rectangle on all four sides', () => {
      mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });
      const { container } = render(
        <HeatMapCard {...baseProps} distanceUnit="m" data={OK_RESPONSE_5_ROWS} loading={false} spotLat={SPOT_LAT} spotLon={SPOT_LON} />,
      );
      const clipRect = container.querySelector('clipPath rect');
      expect(clipRect).not.toBeNull();
      const x = Number(clipRect!.getAttribute('x'));
      const y = Number(clipRect!.getAttribute('y'));
      const w = Number(clipRect!.getAttribute('width'));
      const h = Number(clipRect!.getAttribute('height'));
      const CHART_W = 748;
      const CORE_CHART_H = 240; // N=5, rowH=48
      expect(x).toBeLessThan(PAD_LEFT);
      expect(y).toBeLessThan(PAD_TOP);
      expect(x + w).toBeGreaterThan(PAD_LEFT + CHART_W);
      expect(y + h).toBeGreaterThan(PAD_TOP + CORE_CHART_H);
    });

    it('y-axis title renders (rotated text, distinct from the row-index tick labels)', () => {
      const { container, getByText } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} />,
      );
      const title = getByText('surfing.heatMap.transectAxisLabel');
      expect(title.getAttribute('transform')).toBe('rotate(-90)');
      expect(container.querySelector('svg')!.contains(title)).toBe(true);
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
  });
});
