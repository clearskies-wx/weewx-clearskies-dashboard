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
  it('negative distance (TA-C19): every seafloor point stays within the drawable area', () => {
    const PAD_LEFT = 72;
    const CHART_W = 736;
    const EPSILON = 0.5; // SVG coordinates are toFixed(1) — allow sub-pixel slack.

    const { container } = render(
      <BeachProfileCardBody {...baseProps} state="ok" profile={OK_RESPONSE_NEGATIVE_DISTANCE} />,
    );
    // The seafloor cross-shore polyline maps every transect point 1:1
    // (buildSeafloorPolygon / the `seafloorPolyline` points string) — it is
    // the only <polyline> rendered by default (wave-shapes toggle starts off).
    const polyline = container.querySelector('svg polyline');
    expect(polyline).not.toBeNull();
    const pointsAttr = polyline!.getAttribute('points') ?? '';
    const pairs = pointsAttr.trim().split(/\s+/).filter(Boolean);
    expect(pairs.length).toBeGreaterThanOrEqual(3); // one per transect point above
    for (const pair of pairs) {
      const [xStr] = pair.split(',');
      const x = Number(xStr);
      expect(Number.isNaN(x)).toBe(false);
      expect(x).toBeGreaterThanOrEqual(PAD_LEFT - EPSILON);
      expect(x).toBeLessThanOrEqual(PAD_LEFT + CHART_W + EPSILON);
    }
  });
});
