// BeachProfileCardBody.test.tsx — SURF-PUBLISH-RESULTS-ONLY §3.6 (2026-07-25).
//
// Covers the beach-profile endpoint's contract change: a missing profile
// used to be HTTP 404 (rendered as "no data"); now it is EITHER
//   - a genuine fetch/config error (still surfaced as an error), or
//   - HTTP 200 with `modelStatus: "unavailable"` (the model ran the
//     request but produced no answer for this hour — an honest empty
//     state, NOT an error tile, NOT a silently blank chart).
// These two cases must stay distinguishable to a visitor (including a
// screen-reader user) and must never be inferred from null payload fields
// — only from `modelStatus` / the fetch error itself.
//
// Regression coverage: before this round, `SurfingTab.tsx` rendered
// `profileData.transect.length` directly. Once the API started returning
// `modelStatus: "unavailable"` with `transect: null` instead of a 404, that
// line would throw on the very first model gap. These tests pin the fix.

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  computeBeachProfileState,
  BeachProfileCardBody,
} from './BeachProfileCardBody';
import type {
  BeachProfileDataOk,
  BeachProfileDataUnavailable,
} from '../../../api/types';

// ---------------------------------------------------------------------------
// Mock react-i18next (same pattern as weather-icon.test.tsx) — components
// under test call useTranslation('marine') / useTranslation('common').
// ---------------------------------------------------------------------------
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures — real shapes per endpoints/beach_profile.py, typed against the
// actual discriminated union so a future field-name drift fails to compile.
// ---------------------------------------------------------------------------

const UNAVAILABLE_RESPONSE: BeachProfileDataUnavailable = {
  locationId: 'huntington-city-beach-pier',
  timestep: null,
  modelStatus: 'unavailable',
  transectIndex: null,
  isStructureAffected: null,
  transectBearingDeg: null,
  transect: null,
  breakPoints: null,
  waveShapes: null,
  surfZones: null,
  jackingFactors: null,
  handoffDepthM: null,
  handoffSourceLevel: null,
  perPartitionBreaks: null,
  metadata: {
    axisUnits: { x: 'ft', y: 'ft' },
    verticalDatum: null,
    transectCount: null,
    openTransectCount: null,
    handoffDepthM: null,
    handoffSourceLevel: null,
  },
  perBreakZones: null,
  waterlineDistance: null,
  beachElevation: null,
  tideLevel: null,
};

const OK_RESPONSE: BeachProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-07-25T19:00:00Z',
  modelStatus: 'ok',
  transectIndex: 4,
  isStructureAffected: false,
  transectBearingDeg: 245,
  transect: [
    { distance: 400, depth: 12, hs: 3.2, swellHeight: 3.0, breakingFraction: null },
    { distance: 100, depth: 4, hs: 4.1, swellHeight: 3.4, breakingFraction: 0.6 },
    { distance: 0, depth: 0.5, hs: 0.8, swellHeight: 0.5, breakingFraction: 0.9 },
  ],
  breakPoints: [],
  waveShapes: [],
  surfZones: null,
  jackingFactors: [],
  handoffDepthM: 5.2,
  handoffSourceLevel: 'L3',
  transects: null,
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'ft', y: 'ft' },
    verticalDatum: 'NAVD88',
    transectCount: 12,
    openTransectCount: 10,
    handoffDepthM: 5.2,
    handoffSourceLevel: 'L3',
  },
};

// An "ok" response whose model produced zero usable transect points — the
// pre-existing "empty" fallback, distinct from both error and unavailable.
const OK_EMPTY_RESPONSE: BeachProfileDataOk = {
  ...OK_RESPONSE,
  transect: [],
};

// TA-C19 (ADR-093 Amendment 4, D4.2): a live capture (profile-fixture.json,
// huntington-city-beach-pier, 2026-08-02) had a real transect point at
// distance -25.94 — landward of the reference waterline (HAT extension).
// Reproduced here (not synthesized) so the negative-distance axis-domain
// fix can be asserted against an observed value.
const OK_RESPONSE_NEGATIVE_DISTANCE: BeachProfileDataOk = {
  ...OK_RESPONSE,
  transectIndex: 39,
  transect: [
    { distance: 68.56, depth: 1.943, hs: 0.8206, swellHeight: 0.62, breakingFraction: null },
    { distance: 25.59, depth: 1.113, hs: 0.8125, swellHeight: 0.55, breakingFraction: 0.4 },
    { distance: -25.94, depth: 0.01, hs: 0.0073, swellHeight: 0.01, breakingFraction: 0.9 },
  ],
  handoffDepthM: 1.4068,
  handoffSourceLevel: 'L4',
  metadata: {
    ...OK_RESPONSE.metadata,
    verticalDatum: 'LMSL',
    transectCount: 143,
    openTransectCount: 118,
    handoffDepthM: 1.4068,
    handoffSourceLevel: 'L4',
  },
};

// D5.1 pinning fixture — REAL live data (profile-all-fixture.json,
// huntington-city-beach-pier, 2026-08-02, transectIndex 4), not
// synthesized: a genuine double-break transect (two breakPoints, same
// partition — outer bar at 42.06m, inner bar at 24.87m) that ALSO carries
// negative-distance points. Used as a single-transect "best" response
// here (BeachProfileChart doesn't care which endpoint mode produced the
// data it's given) to prove double-break rendering was already correct
// pre-D5 (no code change) on a real multi-bar transect.
const OK_RESPONSE_DOUBLE_BREAK_LIVE: BeachProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-08-02T00:00:00Z',
  modelStatus: 'ok',
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
  transects: null,
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

// Tier-selection bug fix (2026-08-02): reproduces the reported Huntington
// Beach scenario — BOTH break points landward of the reference waterline
// (TA-C19/ADR-093 Amendment 4 negative distance), transect extending far
// offshore. Before the Math.abs() fix, Math.max on signed break distances
// picked the least-negative break (-223), which still failed the
// `outerBreakDist > 0` gate and fell through to the full-transect-extent
// fallback — Extended tier (1000m) — compressing the whole surf zone into
// a sliver. distanceUnit: 'm' here (not the file's usual 'ft' convention)
// so the fixture's literal distances line up 1:1 with the tier thresholds
// (100/300/1000m) as described in the bug report.
const OK_RESPONSE_ALL_NEGATIVE_BREAKS: BeachProfileDataOk = {
  ...OK_RESPONSE,
  transectIndex: 39,
  transect: [
    { distance: 2227, depth: 15, hs: 3.5, swellHeight: 3.2, breakingFraction: null },
    { distance: 1000, depth: 8, hs: 3.0, swellHeight: 2.8, breakingFraction: null },
    { distance: 300, depth: 3, hs: 1.5, swellHeight: 1.3, breakingFraction: 0.4 },
    { distance: 0, depth: 0.5, hs: 0.3, swellHeight: 0.2, breakingFraction: 0.8 },
    { distance: -223, depth: 0.05, hs: 0.02, swellHeight: 0.01, breakingFraction: 0.9 },
    { distance: -240, depth: 0.02, hs: 0.01, swellHeight: 0.01, breakingFraction: 0.9 },
  ],
  breakPoints: [
    { distance: -223, depth: 0.05, hs: 0.02, breakerType: 'spilling', faceHeight: 0.03, iribarren: 0.3 },
    { distance: -240, depth: 0.02, hs: 0.01, breakerType: 'spilling', faceHeight: 0.02, iribarren: 0.3 },
  ],
};

// ---------------------------------------------------------------------------
// D5.1/D5.2/D6 fixtures — per-break zones (Round Z Z3), zero-width skip,
// 1-break and 3-break rendering. Distances/depths follow the same
// meter-scale style as OK_RESPONSE_DOUBLE_BREAK_LIVE (a real live
// double-break transect) — shape fidelity matters here, not literal ft/m
// realism (the component treats every distance/depth as already-converted
// display units regardless of the `distanceUnit` prop passed by the test).
// ---------------------------------------------------------------------------

const SHARED_TRANSECT_13PT = [
  { distance: 67.84, depth: 1.456, hs: 0.7553 },
  { distance: 59.25, depth: 1.296, hs: 0.7635 },
  { distance: 50.65, depth: 1.133, hs: 0.7616 },
  { distance: 42.06, depth: 0.973, hs: 0.7103 },
  { distance: 33.46, depth: 0.819, hs: 0.5979 },
  { distance: 24.87, depth: 0.664, hs: 0.4847 },
  { distance: 16.27, depth: 0.514, hs: 0.3752 },
  { distance: 7.68, depth: 0.371, hs: 0.2708 },
  { distance: -0.92, depth: 0.24, hs: 0.1752 },
  { distance: -9.5, depth: 0.102, hs: 0.0745 },
  { distance: -18.08, depth: 0.01, hs: 0.0073 },
  { distance: -26.66, depth: 0.01, hs: 0.0073 },
  { distance: -35.24, depth: 0.01, hs: 0.0073 },
];

// D6 — a single published break, one perBreakZones entry, both bands
// non-zero width.
const OK_RESPONSE_1_BREAK_PER_BREAK_ZONES: BeachProfileDataOk = {
  ...OK_RESPONSE,
  transectIndex: 4,
  transect: SHARED_TRANSECT_13PT,
  breakPoints: [
    {
      distance: 42.06, depth: 0.973, hs: 0.7103, faceHeight: 0.9021,
      breakerType: 'spilling', iribarren: 0.337,
      partitionInfo: { partitionIndex: 0, periodS: 13.05, directionDeg: 196.9, classification: 'groundswell', heightM: 0.4955 },
    },
  ],
  perBreakZones: [
    {
      breakDistance: 42.06, breakerType: 'spilling',
      impactZone: { startDistance: 50.65, endDistance: 33.46, startDepth: 0.879, endDepth: 0.565 },
      foamZone: { startDistance: 33.46, endDistance: -0.92, startDepth: 0.565, endDepth: 0.24 },
    },
  ],
  waterlineDistance: -0.92,
  tideLevel: -1.2,
  surfZones: null,
};

// D6 — three published breaks (outermost-first), three perBreakZones
// entries, every band non-zero width.
const OK_RESPONSE_3_BREAKS_PER_BREAK_ZONES: BeachProfileDataOk = {
  ...OK_RESPONSE,
  transectIndex: 4,
  transect: SHARED_TRANSECT_13PT,
  breakPoints: [
    {
      distance: 59.25, depth: 1.296, hs: 0.7635, faceHeight: 0.95,
      breakerType: 'plunging', iribarren: 0.5,
      partitionInfo: { partitionIndex: 0, periodS: 13.05, directionDeg: 196.9, classification: 'groundswell', heightM: 0.4955 },
    },
    {
      distance: 42.06, depth: 0.973, hs: 0.7103, faceHeight: 0.9021,
      breakerType: 'spilling', iribarren: 0.337,
      partitionInfo: { partitionIndex: 0, periodS: 13.05, directionDeg: 196.9, classification: 'groundswell', heightM: 0.4955 },
    },
    {
      distance: 16.27, depth: 0.514, hs: 0.3752, faceHeight: 0.42,
      breakerType: 'spilling', iribarren: 0.3,
      partitionInfo: { partitionIndex: 0, periodS: 13.05, directionDeg: 196.9, classification: 'groundswell', heightM: 0.4955 },
    },
  ],
  perBreakZones: [
    {
      breakDistance: 59.25, breakerType: 'plunging',
      impactZone: { startDistance: 63, endDistance: 50, startDepth: 1.1, endDepth: 0.9 },
      foamZone: { startDistance: 50, endDistance: 42.06, startDepth: 0.9, endDepth: 0.7 },
    },
    {
      breakDistance: 42.06, breakerType: 'spilling',
      impactZone: { startDistance: 40, endDistance: 30, startDepth: 0.85, endDepth: 0.6 },
      foamZone: { startDistance: 30, endDistance: 16.27, startDepth: 0.6, endDepth: 0.4 },
    },
    {
      breakDistance: 16.27, breakerType: 'spilling',
      impactZone: { startDistance: 14, endDistance: 8, startDepth: 0.45, endDepth: 0.3 },
      foamZone: { startDistance: 8, endDistance: -0.92, startDepth: 0.3, endDepth: 0.24 },
    },
  ],
  waterlineDistance: -0.92,
  tideLevel: -1.2,
  surfZones: null,
};

// D5.2 — outer break's foam zone legitimately collapses to zero width
// (audit F3: two breaks closer than the impact zone's decay length). Must
// render NO fill/strip/label for that specific band; the outer impact band
// and the inner break's own bands still render normally.
const OK_RESPONSE_ZERO_WIDTH_FOAM: BeachProfileDataOk = {
  ...OK_RESPONSE,
  transectIndex: 4,
  transect: SHARED_TRANSECT_13PT,
  breakPoints: [
    {
      distance: 42.06, depth: 0.973, hs: 0.7103, faceHeight: 0.9021,
      breakerType: 'spilling', iribarren: 0.337,
      partitionInfo: { partitionIndex: 0, periodS: 13.05, directionDeg: 196.9, classification: 'groundswell', heightM: 0.4955 },
    },
  ],
  perBreakZones: [
    {
      breakDistance: 42.06, breakerType: 'spilling',
      impactZone: { startDistance: 50.65, endDistance: 33.46, startDepth: 0.879, endDepth: 0.565 },
      // Zero-width: start === end (audit F3 collapse case).
      foamZone: { startDistance: 33.46, endDistance: 33.46, startDepth: 0.565, endDepth: 0.565 },
    },
  ],
  waterlineDistance: -0.92,
  tideLevel: -1.2,
  surfZones: null,
};

const FETCH_ERROR = new Error('404: Surf location not found');

describe('computeBeachProfileState', () => {
  // ---------------------------------------------------------------------
  // Ordering: error checked BEFORE modelStatus (lead call, 2026-07-25).
  // ---------------------------------------------------------------------
  it('returns "error" when a fetch error is present, even with no data at all', () => {
    expect(computeBeachProfileState(null, FETCH_ERROR)).toBe('error');
  });

  it('returns "error" even when stale "ok" data is still cached alongside a new error', () => {
    // useApiQuery does not clear `data` when a background refetch fails —
    // the error must still win so a visitor is told the fetch failed
    // rather than being served silently-stale data forever.
    expect(computeBeachProfileState(OK_RESPONSE, FETCH_ERROR)).toBe('error');
  });

  it('returns "error" even when data has modelStatus "unavailable" and an error is also present', () => {
    expect(computeBeachProfileState(UNAVAILABLE_RESPONSE, FETCH_ERROR)).toBe('error');
  });

  // ---------------------------------------------------------------------
  // modelStatus: "unavailable" — the §3.6 model gap.
  // ---------------------------------------------------------------------
  it('returns "unavailable" for modelStatus "unavailable" with no error', () => {
    expect(computeBeachProfileState(UNAVAILABLE_RESPONSE, null)).toBe('unavailable');
  });

  it('does not throw on a response with transect: null (regression: profileData.transect.length crash)', () => {
    expect(() => computeBeachProfileState(UNAVAILABLE_RESPONSE, null)).not.toThrow();
  });

  // ---------------------------------------------------------------------
  // modelStatus: "ok"
  // ---------------------------------------------------------------------
  it('returns "ok" for modelStatus "ok" with a non-empty transect', () => {
    expect(computeBeachProfileState(OK_RESPONSE, null)).toBe('ok');
  });

  it('returns "empty" for modelStatus "ok" with an empty transect array', () => {
    expect(computeBeachProfileState(OK_EMPTY_RESPONSE, null)).toBe('empty');
  });

  // ---------------------------------------------------------------------
  // No data yet (skip / still loading / never fetched).
  // ---------------------------------------------------------------------
  it('returns "empty" when there is no data and no error', () => {
    expect(computeBeachProfileState(null, null)).toBe('empty');
    expect(computeBeachProfileState(null, undefined)).toBe('empty');
  });
});

describe('BeachProfileCardBody', () => {
  const baseProps = {
    heightUnit: 'ft',
    distanceUnit: 'ft',
    locale: 'en',
    onRetry: vi.fn(),
  };

  it('error state: renders role="alert" with destructive text and a working retry button', () => {
    const onRetry = vi.fn();
    const { getByRole } = render(
      <BeachProfileCardBody {...baseProps} state="error" profile={null} onRetry={onRetry} />,
    );
    const alert = getByRole('alert');
    expect(alert.textContent).toContain('surfing.beachProfile.loadError');

    const retryButton = getByRole('button', { name: 'retry' });
    retryButton.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('unavailable state: renders informational text naming the model gap, with NO alert role', () => {
    const { queryByRole, getByText } = render(
      <BeachProfileCardBody {...baseProps} state="unavailable" profile={null} />,
    );
    // Distinguishability (lead call, 2026-07-25): must NOT expose role="alert" —
    // that would make it indistinguishable from the error state to a screen
    // reader, even if the visible text differs.
    expect(queryByRole('alert')).toBeNull();
    // Wording must specifically name the model gap, not the generic
    // "no data" string — reusing that string would reintroduce the exact
    // vagueness problem the API-side contract change was meant to fix.
    expect(getByText('surfing.beachProfile.modelUnavailable')).toBeDefined();
  });

  it('unavailable state: does not throw and does not render a chart when profile is null', () => {
    expect(() =>
      render(<BeachProfileCardBody {...baseProps} state="unavailable" profile={null} />),
    ).not.toThrow();
  });

  it('ok state: renders the chart (SVG role="img"), not the error or unavailable text', () => {
    const { getByRole, queryByRole, queryByText } = render(
      <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE} />,
    );
    expect(getByRole('img')).toBeDefined();
    expect(queryByRole('alert')).toBeNull();
    expect(queryByText('surfing.beachProfile.modelUnavailable')).toBeNull();
  });

  it('empty state: renders the pre-existing generic empty-state text, distinct from modelUnavailable', () => {
    const { getByText, queryByRole } = render(
      <BeachProfileCardBody {...baseProps} state="empty" profile={null} />,
    );
    expect(getByText('surfing.beachProfileNoData')).toBeDefined();
    expect(queryByRole('alert')).toBeNull();
  });

  // TA-C19 / D4.2: negative `distance` values (landward of the reference
  // waterline, ADR-093 Amendment 4) must render INSIDE the chart's drawable
  // area, not merely "not throw" — a negative distance previously computed
  // an SVG x past the right edge (off-canvas) because xMin was hardcoded to
  // 0. BeachProfileChart's layout constants: VIEW_W=820, PAD_LEFT=72,
  // PAD_RIGHT=12 -> CHART_W=736 (not exported, restated here for the
  // in-canvas assertion).
  //
  // D5.1 rebuild note: the seafloor/beach boundary is no longer a raw
  // per-transect-point <polyline> — it's a densely-resampled <path> (the
  // "bed" curve, blended depth-derived + beachElevation-derived — see
  // BeachProfileChart's `bedStrokePath`), identified here by its
  // `--beach-profile-sand-edge` stroke token. The invariant under test is
  // unchanged (xMin correctly extends to include negative distances so
  // nothing renders off-canvas); only the DOM element carrying it changed.
  it('negative distance (TA-C19): every seafloor/beach point stays within the drawable area', () => {
    const PAD_LEFT = 72;
    const CHART_W = 736;
    const EPSILON = 0.5; // SVG coordinates are toFixed(1) — allow sub-pixel slack.

    const { container } = render(
      <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE_NEGATIVE_DISTANCE} />,
    );
    const paths = Array.from(container.querySelectorAll('svg path'));
    const seafloorPath = paths.find((p) => (p.getAttribute('style') ?? '').includes('beach-profile-sand-edge'));
    expect(seafloorPath).not.toBeUndefined();
    const d = seafloorPath!.getAttribute('d') ?? '';
    const coordTokens = d.match(/[ML]-?\d+(?:\.\d+)?\s-?\d+(?:\.\d+)?/g) ?? [];
    expect(coordTokens.length).toBeGreaterThan(2);
    for (const token of coordTokens) {
      const [xStr] = token.slice(1).trim().split(/\s+/);
      const x = Number(xStr);
      expect(Number.isNaN(x)).toBe(false);
      expect(x).toBeGreaterThanOrEqual(PAD_LEFT - EPSILON);
      expect(x).toBeLessThanOrEqual(PAD_LEFT + CHART_W + EPSILON);
    }
  });

  // D5.1 — real live double-break transect (transectIndex 4, also carries
  // negative-distance points). BeachProfileChart's break-point rendering
  // (`breakPoints.map(...)`, both the SVG markers and the sr-only <tfoot>
  // rows) already iterates every entry generically — this pins that against
  // genuine multi-bar data for the first time, and confirms the negative-
  // distance fix holds simultaneously.
  it('double-break (D5.1, live transectIndex 4): both break points appear as separate sr-only table rows', () => {
    const { container } = render(
      <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE_DOUBLE_BREAK_LIVE} />,
    );
    const breakRows = container.querySelectorAll('table.sr-only tfoot tr');
    // First tfoot row is the "Break points" section header (colSpan=5); the
    // rest are one row per breakPoints entry.
    expect(breakRows.length).toBe(1 + 2);
  });

  // SURF-REMEDIATION R3.2 (2026-08-09) — SUPERSEDES the pre-R3 "tier
  // selection" test this replaces (deleted `selectTier()` was chosen by
  // outermost-break MAGNITUDE; that whole mechanism is gone). The x-domain
  // is now FIXED from `metadata.displayWindowM`/`displayLandwardM` (absent
  // here -> the hardcoded 150m/30m fallback), regardless of where breaks
  // fall — this fixture's breaks at -223/-240 render OFF the fixed
  // 98.4ft-landward domain and simply clip, they do not widen it.
  it('fixed x-domain (R3.2): metadata-absent fallback (150m/30m) applies regardless of break location, never re-derived from break distance', () => {
    const { container } = render(
      <BeachProfileCardBody
        {...baseProps}
        distanceUnit="m"
        state="ok"
        profile={OK_RESPONSE_ALL_NEGATIVE_BREAKS}
      />,
    );
    // X-axis distance tick labels are the only <text> content that is a
    // plain integer in this render (locale 'en' comma-groups >= 1000, e.g.
    // "1,000" — stripped here so ticks stay comparable integers, not
    // silently excluded by the digit-only regex).
    const tickTexts = Array.from(container.querySelectorAll('svg text'))
      .map((el) => (el.textContent ?? '').replace(/,/g, ''))
      .filter((s) => /^-?\d+$/.test(s))
      .map(Number);
    expect(tickTexts.length).toBeGreaterThan(0);
    // distanceUnit="m" here -> METER_TO_UNIT=1 -> fallback window=150,
    // landward=30 exactly; tickStepForWindow(150) lands on the Standard
    // tier's 50m step (150 > tierShort.maxDistance(100)) -> ticks
    // 0,50,100,150 plus the negative dry-sand tick at ceil(-30/5)*5=-30.
    expect(Math.max(...tickTexts)).toBe(150);
    expect(Math.min(...tickTexts)).toBe(-30);
  });

  // ── D6 — per-break zones render by default, no toggle ──────────────────
  describe('D6 — per-break zones (perBreakZones default rendering)', () => {
    it('1 break: renders exactly one break-point sr-only row and one impact + one foam band fill', () => {
      const { container } = render(
        <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE_1_BREAK_PER_BREAK_ZONES} />,
      );
      const breakRows = container.querySelectorAll('table.sr-only tfoot tr');
      expect(breakRows.length).toBe(1 + 1); // header + 1 break point

      const styled = Array.from(container.querySelectorAll('svg [style]'));
      const impactCount = styled.filter((el) => (el.getAttribute('style') ?? '').includes('var(--beach-profile-impact)')).length;
      const foamCount = styled.filter((el) => (el.getAttribute('style') ?? '').includes('var(--beach-profile-foam)')).length;
      // One band each => one plot fill + one strip rect per band = 2 elements.
      expect(impactCount).toBe(2);
      expect(foamCount).toBe(2);
    });

    it('3 breaks: renders three break-point sr-only rows and three impact + three foam band fills', () => {
      const { container } = render(
        <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE_3_BREAKS_PER_BREAK_ZONES} />,
      );
      const breakRows = container.querySelectorAll('table.sr-only tfoot tr');
      expect(breakRows.length).toBe(1 + 3); // header + 3 break points

      const styled = Array.from(container.querySelectorAll('svg [style]'));
      const impactCount = styled.filter((el) => (el.getAttribute('style') ?? '').includes('var(--beach-profile-impact)')).length;
      const foamCount = styled.filter((el) => (el.getAttribute('style') ?? '').includes('var(--beach-profile-foam)')).length;
      expect(impactCount).toBe(3 * 2);
      expect(foamCount).toBe(3 * 2);
    });

    it('0 breaks: renders no impact/foam band fills and does not throw', () => {
      const zeroBreakProfile: BeachProfileDataOk = {
        ...OK_RESPONSE_1_BREAK_PER_BREAK_ZONES,
        breakPoints: [],
        perBreakZones: [],
        surfZones: null,
      };
      const { container } = render(
        <BeachProfileCardBody {...baseProps} state="ok" profile={zeroBreakProfile} />,
      );
      const styled = Array.from(container.querySelectorAll('svg [style]'));
      const impactCount = styled.filter((el) => (el.getAttribute('style') ?? '').includes('var(--beach-profile-impact)')).length;
      const foamCount = styled.filter((el) => (el.getAttribute('style') ?? '').includes('var(--beach-profile-foam)')).length;
      expect(impactCount).toBe(0);
      expect(foamCount).toBe(0);
      expect(container.querySelector('svg[role="img"]')).not.toBeNull();
    });
  });

  // ── D5.2 — zero-width band skip (audit F3 collapse case) ───────────────
  describe('D5.2 — zero-width band skip', () => {
    it('a zero-width foam zone (start === end) renders no fill, no strip, no label artifact for that band', () => {
      const { container, queryByText } = render(
        <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE_ZERO_WIDTH_FOAM} />,
      );
      const styled = Array.from(container.querySelectorAll('svg [style]'));
      const impactCount = styled.filter((el) => (el.getAttribute('style') ?? '').includes('var(--beach-profile-impact)')).length;
      const foamCount = styled.filter((el) => (el.getAttribute('style') ?? '').includes('var(--beach-profile-foam)')).length;
      // The non-zero impact band still renders (fill + strip = 2); the
      // zero-width foam band renders NOTHING (not even a 0-width artifact).
      expect(impactCount).toBe(2);
      expect(foamCount).toBe(0);

      // sr-only table caption enumerates impact but not foam (no zone data
      // to describe for a band that was never rendered).
      const caption = container.querySelector('table.sr-only caption');
      expect(caption?.textContent ?? '').toContain('surfing.beachProfile.impactZone');
      expect(caption?.textContent ?? '').not.toContain('surfing.beachProfile.foamZone');

      // Legend itself is unconditional (mockup: static legend row, not a
      // per-band artifact) — "Foam zone" legend entry still shows even
      // though no foam band rendered this time; this proves the skip is
      // per-band, not a global "hide foam" toggle.
      expect(queryByText('surfing.beachProfile.legendSand')).not.toBeNull();
    });
  });

  // ── D5.2 — BD-9 representative-transect header removed (operator ruling
  //    2026-08-02): "the user of the site will not [know what that means]"
  //    — same class of developer/operator-only marker as the heatmap's
  //    BD-9 triangle (HeatMapCard.tsx), removed in the same round. This
  //    describe block previously asserted the header DID show for several
  //    selectedTransect values; now asserts it never shows, for any of
  //    them, including the "ok" state where it used to conditionally
  //    render. ──
  describe('D5.2 — representative-transect header (removed)', () => {
    it('never shows the header, regardless of selectedTransect', () => {
      const undefinedCase = render(
        <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE} />,
      );
      expect(undefinedCase.queryByText(/representativeTransectHeader/)).toBeNull();

      const bestPeakCase = render(
        <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE} selectedTransect="best_peak" />,
      );
      expect(bestPeakCase.queryByText(/representativeTransectHeader/)).toBeNull();

      const numberedCase = render(
        <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE} selectedTransect={7} />,
      );
      expect(numberedCase.queryByText(/representativeTransectHeader/)).toBeNull();

      const averageCase = render(
        <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE} selectedTransect="average" />,
      );
      expect(averageCase.queryByText(/representativeTransectHeader/)).toBeNull();
    });

    it('never shows the header outside the "ok" state', () => {
      const { queryByText } = render(
        <BeachProfileCardBody {...baseProps} state="empty" profile={null} />,
      );
      expect(queryByText(/representativeTransectHeader/)).toBeNull();
    });
  });
});
