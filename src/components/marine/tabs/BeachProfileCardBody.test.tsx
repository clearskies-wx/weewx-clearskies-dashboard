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
});
