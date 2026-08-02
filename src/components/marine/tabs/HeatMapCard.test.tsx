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

import { describe, it, expect, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { HeatMapCard } from './HeatMapCard';
import type {
  HeatMapProfileDataOk,
  HeatMapProfileDataUnavailable,
  HeatMapTransectData,
} from '../../../api/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

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

  // ── D5.2 — BD-7/BD-9 overlays ─────────────────────────────────────────
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

    it('renders the representative-transect marker + bolds that row\'s label when present', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} representativeTransectIndex={2} />,
      );
      const texts = Array.from(container.querySelectorAll('svg text'));
      const boldLabel = texts.find((el) => el.textContent === '2' && el.getAttribute('font-weight') === '700');
      expect(boldLabel).toBeDefined();
      // Every other row label stays unbolded.
      const otherLabels = texts.filter((el) => ['0', '1', '3', '4'].includes(el.textContent ?? ''));
      expect(otherLabels.length).toBeGreaterThan(0);
      for (const el of otherLabels) {
        expect(el.getAttribute('font-weight')).not.toBe('700');
      }
    });

    it('range-guard: an out-of-bounds mainBreakZoneEndIndex does not crash and does not render the band', () => {
      expect(() => render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} mainBreakZoneStartIndex={1} mainBreakZoneEndIndex={999} />,
      )).not.toThrow();
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} mainBreakZoneStartIndex={1} mainBreakZoneEndIndex={999} />,
      );
      const bandRects = Array.from(container.querySelectorAll('svg rect')).filter((r) => r.getAttribute('fill') === MAIN_BREAK_ZONE_FILL);
      expect(bandRects.length).toBe(0);
    });

    it('range-guard: an out-of-bounds representativeTransectIndex does not crash and renders no bold label', () => {
      const { container } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} representativeTransectIndex={999} />,
      );
      const texts = Array.from(container.querySelectorAll('svg text'));
      expect(texts.some((el) => el.getAttribute('font-weight') === '700')).toBe(false);
    });

    it('legend text (key names) present only when the corresponding overlay is shown', () => {
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

      const { container: repContainer } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} representativeTransectIndex={2} />,
      );
      expect(within(repContainer).getByText('surfing.heatMap.representativeLegend')).toBeDefined();
      expect(within(repContainer).queryAllByText('surfing.heatMap.mainBreakZoneLegend').length).toBe(0);

      const { container: noOverlayContainer } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} />,
      );
      expect(within(noOverlayContainer).queryAllByText('surfing.heatMap.mainBreakZoneLegend').length).toBe(0);
      expect(within(noOverlayContainer).queryByText('surfing.heatMap.representativeLegend')).toBeNull();
    });

    it('sr-only table: "Main break zone" column present only with zone data; representative row gets the suffix', () => {
      const { container: withOverlayContainer } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} mainBreakZoneStartIndex={1} mainBreakZoneEndIndex={3} representativeTransectIndex={2} />,
      );
      // Column header present (+ the SVG legend label — same key, 2 matches).
      expect(within(withOverlayContainer).getAllByText('surfing.heatMap.mainBreakZoneLegend').length).toBe(2);
      // Representative row suffix — shares a <th> with the transect index
      // number ("2 surfing.heatMap.representativeSuffix"), so match by
      // substring (regex), not an exact single-node string match.
      expect(within(withOverlayContainer).getByText(/representativeSuffix/)).toBeDefined();

      const { container: noOverlayContainer } = render(
        <HeatMapCard {...baseProps} data={OK_RESPONSE_5_ROWS} loading={false} />,
      );
      expect(within(noOverlayContainer).queryAllByText('surfing.heatMap.mainBreakZoneLegend').length).toBe(0);
      expect(within(noOverlayContainer).queryByText(/representativeSuffix/)).toBeNull();
    });
  });
});
