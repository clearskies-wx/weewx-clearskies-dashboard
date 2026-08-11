// SurfingTab.test.tsx — D4.2 (MARINE-FORWARD-PLAN): main-break-zone context
// line rendered near the breakingFaceHeight headline.
//
// Scoped to the new render only (2026-08-02) — not a full-component test
// rewrite. SurfingTab mounts 7 data hooks (useSurfDetail, useBeachProfile,
// useBeachProfileAll, useMarineDetail, useStation, useObservation,
// useForecast); all are mocked here via the hooks module so the zone-
// context line's null-safety and content can be asserted without a live
// API. Everything not under test (marine bundle, station, observation,
// forecast, beach profile / heat map) is given the "no data yet" shape the
// component already handles gracefully (verified by BeachProfileCardBody.test.tsx
// / HeatMapCard.test.tsx for those sub-components independently).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SurfingTab } from './SurfingTab';
import type { SurfDetailData, SurfForecast, HeatMapProfileData, HeatMapProfileDataOk } from '../../../api/types';

// jsdom (vitest's default test environment here) has no ResizeObserver.
// SurfingTab renders horizontal-scroll-nav.tsx (72-hour forecast scroll),
// which observes its container on mount — stub it so mounting the full tab
// doesn't throw. Test-local only; no shared test-setup file touched.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = ResizeObserverStub;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Mirror the real i18next interpolation behavior just enough for the
      // mainBreakZoneLabel assertions below — substitute {{var}} tokens
      // from opts, falling back to defaultValue as the template when the
      // key itself isn't otherwise mocked to a literal string.
      if (opts && typeof opts.defaultValue === 'string') {
        return opts.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name) =>
          String(opts[name] ?? ''));
      }
      return key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const HOOK_RESULT_NULL = { data: null, units: undefined, loading: false, error: null, refetch: vi.fn() };

let surfData: SurfDetailData | null = null;
// D5.2 prop-threading test — mutable so a single test can supply real heat
// map data and observe the BD-7/9 overlay (sourced from `surfData.forecast`
// primary entry, threaded into HeatMapCard's `data` prop's SIBLING props)
// actually reaching the rendered SVG. Defaults to null (no heat map data)
// for the D4.2 zone-context-line tests above, which don't need it.
let heatMapData: HeatMapProfileData | null = null;

vi.mock('../../../hooks/useWeatherData', () => ({
  useSurfDetail: () => ({ data: surfData, units: { waveHeightAtBreak: 'ft', distance: 'ft' }, loading: false, error: null, refetch: vi.fn() }),
  useBeachProfile: () => HOOK_RESULT_NULL,
  useBeachProfileAll: () => ({ data: heatMapData, units: undefined, loading: false, error: null, refetch: vi.fn() }),
  useMarineDetail: () => HOOK_RESULT_NULL,
  useStation: () => HOOK_RESULT_NULL,
  useObservation: () => ({
    ...HOOK_RESULT_NULL,
    source: undefined,
    stationClock: undefined,
    freshness: undefined,
    barometerTrendDirection: null,
    windSpeedAvg10m: null,
    windGustMax10m: null,
    scene: 'clear-day',
    sceneLoaded: false,
  }),
  useForecast: () => HOOK_RESULT_NULL,
  useAlmanac: () => HOOK_RESULT_NULL,
}));

// LM-2 (2026-08-03): HeatMapCard now calls useImageryConfig() unconditionally
// (React hooks rule) — mocked at its own module boundary to the no-imagery
// state, NOT by unmasking the real useApiQuery/useIsIdle chain (lead ruling,
// LM-2: mocking useIsIdle instead would un-gate a real fetch attempt inside
// every test in this file, none of which are about imagery — nondeterminism
// and a hidden dependency on imagery internals in unrelated suites). Every
// pre-existing test here keeps the exact pre-LM-2 render (imagery absent),
// since none of them set spotLat/spotLon-driving `surfData.coordinates` in a
// way this suite asserts on. HeatMapCard.test.tsx / useImageryConfig.test.ts
// are where the real hook chain is exercised.
vi.mock('../../../hooks/useImageryConfig', () => ({
  useImageryConfig: () => ({ data: null, loading: false }),
}));

// Base SurfForecast entry — required fields per types.ts, plus the BD-7/BD-9
// zone fields under test. `time` is "now" at test-run time so this entry is
// always selected as `primary` (closest-to-now) regardless of when the
// suite runs.
function buildEntry(overrides: Partial<SurfForecast> = {}): SurfForecast {
  return {
    time: new Date().toISOString(),
    waveHeightAtBreak: 0.86,
    period: 6.7,
    direction: 211.2,
    qualityStars: 3,
    qualityLabel: 'Good',
    qualityScore: 62,
    conditionsText: 'Fair conditions',
    windQuality: 'cross',
    swellDominance: 0.6,
    multiSwell: null,
    breakingFaceHeight: 1.097,
    breakingHawaiianHeight: 0.548,
    modelStatus: 'ok',
    windSource: 'hrrr',
    bestPeakFaceHeight: 1.125,
    spotAverageFaceHeight: 0.837,
    ...overrides,
  };
}

function buildSurfData(entry: SurfForecast): SurfDetailData {
  return {
    locationId: 'huntington-city-beach-pier',
    locationName: 'Huntington City Beach (Pier)',
    coordinates: { lat: 33.6534, lon: -118.0039 },
    forecast: [entry],
    zoneForecast: null,
    spectralComponents: [],
    tidePredictions: [],
    source: 'swan+ndbc+coops+nws_srf',
    generatedAt: new Date().toISOString(),
    surfHeightDisplay: 'face',
  };
}

// Reset shared mutable mock state between tests — heatMapData is only set
// by the D5.2 prop-threading test below; resetting it here keeps that test
// from leaking heat map data into any test that runs after it.
beforeEach(() => {
  heatMapData = null;
});

describe('SurfingTab — main break zone context (D4.2, BD-7/BD-9)', () => {
  // The zone-context TEXT line ("Main break zone: transects …") is one of
  // the items S-SPEC-2 explicitly lists in the operator-ruled Current Swell
  // card strip (ca0689e) — this positive-render assertion pinned behavior
  // that ruling removed and is stale by the same authority that killed the
  // D10.2 rows below. Reconciled per lead ruling (S-SPEC-2 strip,
  // lead-authorized 2026-08-04): the zone fields still exist on the wire and
  // still thread into HeatMapCard's overlay (see the untouched D5.2 describe
  // block above, which covers that prop-threading independently) — only the
  // text line inside THIS card is gone, so the guard below asserts absence.
  it('does NOT render the zone-context text line even when all three zone fields are present (S-SPEC-2 strip, lead-authorized 2026-08-04)', () => {
    surfData = buildSurfData(buildEntry({
      mainBreakZoneFaceHeight: 1.097,
      mainBreakZoneStartIndex: 19,
      mainBreakZoneEndIndex: 54,
      mainBreakZoneQualifyingCount: 10,
      representativeTransectIndex: 39,
    }));
    const { queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText(/Main break zone: transects/)).toBeNull();
  });

  it('null-safety: renders NOTHING for the zone line when the fields are absent (pre-Round-2 cache) — no NaN/undefined text', () => {
    surfData = buildSurfData(buildEntry({
      mainBreakZoneFaceHeight: undefined,
      mainBreakZoneStartIndex: undefined,
      mainBreakZoneEndIndex: undefined,
      mainBreakZoneQualifyingCount: undefined,
      representativeTransectIndex: undefined,
    }));
    const { container, queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText(/Main break zone/)).toBeNull();
    expect(container.textContent).not.toMatch(/NaN/);
    expect(container.textContent).not.toMatch(/undefined/);
  });

  it('null-safety: renders NOTHING for the zone line when the fields are explicitly null', () => {
    surfData = buildSurfData(buildEntry({
      mainBreakZoneFaceHeight: null,
      mainBreakZoneStartIndex: null,
      mainBreakZoneEndIndex: null,
      mainBreakZoneQualifyingCount: null,
      representativeTransectIndex: null,
    }));
    const { queryByText, container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText(/Main break zone/)).toBeNull();
    expect(container.textContent).not.toMatch(/NaN/);
    expect(container.textContent).not.toMatch(/undefined/);
  });

  it('null-safety: renders NOTHING when only some zone fields are present (partial payload)', () => {
    surfData = buildSurfData(buildEntry({
      mainBreakZoneFaceHeight: 1.0,
      mainBreakZoneStartIndex: 19,
      mainBreakZoneEndIndex: null,
      mainBreakZoneQualifyingCount: null,
      representativeTransectIndex: null,
    }));
    const { queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText(/Main break zone/)).toBeNull();
  });
});

// D5.2 — HeatMapCard's BD-7/9 overlay data (mainBreakZoneStartIndex/EndIndex/
// representativeTransectIndex) lives on `SurfForecast` (the /surf endpoint,
// already read as `primary` for the D4.2 tests above) — NOT on
// HeatMapCard's own `data` prop (the /profile?transect_index=all response
// has no BD-7/9 fields). This proves the actual prop-threading wire at
// SurfingTab.tsx's `<HeatMapCard ...>` call site, end to end: `primary`'s
// zone fields reach the rendered SVG's overlay, not just that the values
// are read somewhere.
describe('SurfingTab — HeatMapCard BD-7/9 overlay prop-threading (D5.2)', () => {
  const HEATMAP_ROW = (transectIndex: number) => ({
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
    handoffSourceLevel: 'L3' as const,
  });

  const HEATMAP_OK: HeatMapProfileDataOk = {
    locationId: 'huntington-city-beach-pier',
    timestep: new Date().toISOString(),
    modelStatus: 'ok',
    profiles: [0, 1, 2, 3, 4].map(HEATMAP_ROW),
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

  it('threads mainBreakZoneStartIndex/EndIndex from `primary` into HeatMapCard — the purple band renders', () => {
    surfData = buildSurfData(buildEntry({
      mainBreakZoneStartIndex: 1,
      mainBreakZoneEndIndex: 3,
      representativeTransectIndex: null,
    }));
    heatMapData = HEATMAP_OK;
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    // H4 (2026-08-10) — ChartFullscreenOverlay always mounts its children
    // in the DOM (even closed, for CSS transitions), so a SECOND
    // HeatMapCard instance (identical props) now renders inside it,
    // matching the ConfigDrivenGroup.tsx fullscreen pattern. Scope to the
    // inline (non-overlay) instance only — the one visible without opening
    // fullscreen — by excluding anything inside the overlay's role="dialog".
    // HeatMapCard.tsx's MAIN_BREAK_ZONE_FILL constant, restated (not exported).
    const bandRects = Array.from(container.querySelectorAll('svg rect'))
      .filter((r) => r.getAttribute('fill') === 'rgba(168, 85, 247, 0.75)' && r.getAttribute('width') === '6')
      .filter((r) => !r.closest('[role="dialog"]'));
    expect(bandRects.length).toBe(1);
  });

  // BD-9 removed from the render (operator ruling 2026-08-02): "the user of
  // the site will not [know what that means]" — the bold row label never
  // renders now, even when `primary.representativeTransectIndex` is
  // threaded through. representativeTransectIndex stays on HeatMapCardProps
  // for caller compatibility; SurfingTab.tsx still passes it, the component
  // just no longer reads it.
  it('representativeTransectIndex threaded from `primary` into HeatMapCard is ignored — no bold row label renders', () => {
    surfData = buildSurfData(buildEntry({
      mainBreakZoneStartIndex: null,
      mainBreakZoneEndIndex: null,
      representativeTransectIndex: 2,
    }));
    heatMapData = HEATMAP_OK;
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    const boldLabel = Array.from(container.querySelectorAll('svg text'))
      .find((el) => el.textContent === '2' && el.getAttribute('font-weight') === '700');
    expect(boldLabel).toBeUndefined();
  });

  it('null-safety: no overlay renders when `primary` carries no BD-7/9 fields (pre-Round-2 cache)', () => {
    surfData = buildSurfData(buildEntry({
      mainBreakZoneStartIndex: undefined,
      mainBreakZoneEndIndex: undefined,
      representativeTransectIndex: undefined,
    }));
    heatMapData = HEATMAP_OK;
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    const bandRects = Array.from(container.querySelectorAll('svg rect'))
      .filter((r) => r.getAttribute('fill') === 'rgba(168, 85, 247, 0.75)');
    expect(bandRects.length).toBe(0);
    const boldLabels = Array.from(container.querySelectorAll('svg text'))
      .filter((el) => el.getAttribute('font-weight') === '700');
    expect(boldLabels.length).toBe(0);
  });
});

// D8 (2026-08-02) — peel direction chevron, re-wired to consume
// `peelDirection` (not string-matching `peelClassification`, which is dead
// for `a_frame` and for a plain undirected classification). Lead decision
// table, one test per row. The chevron block only renders at all when
// `primary.peelAngle != null` (T7.2's wrapping condition) — every case
// below sets a peelAngle so the block mounts.
describe('SurfingTab — peel direction chevron (D8, 2026-08-02)', () => {
  it('closeout gates the chevron OFF regardless of peelDirection (peelDirection served even on closeout hours)', () => {
    surfData = buildSurfData(buildEntry({
      peelAngle: 45,
      peelClassification: 'closeout',
      peelDirection: 'a_frame', // live-confirmed real combination (36/36 hours today)
    }));
    const { container, queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(container.textContent).not.toMatch(/[›‹]/);
    expect(queryByText(/peels|A-frame/)).toBeNull();
  });

  it('peelDirection "right" (non-closeout class): renders › + sr-only "peels right"', () => {
    surfData = buildSurfData(buildEntry({
      peelAngle: 45,
      peelClassification: 'fast_right',
      peelDirection: 'right',
    }));
    const { container, getByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(container.textContent).toContain('›');
    expect(container.textContent).not.toContain('‹');
    const srText = getByText('peels right');
    expect(srText.className).toContain('sr-only');
  });

  it('peelDirection "left": renders ‹ + sr-only "peels left"', () => {
    surfData = buildSurfData(buildEntry({
      peelAngle: 45,
      peelClassification: 'good_left',
      peelDirection: 'left',
    }));
    const { container, getByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(container.textContent).toContain('‹');
    expect(container.textContent).not.toContain('›');
    const srText = getByText('peels left');
    expect(srText.className).toContain('sr-only');
  });

  it('peelDirection "a_frame": renders ‹› + sr-only "A-frame — peels both ways"', () => {
    surfData = buildSurfData(buildEntry({
      peelAngle: 45,
      peelClassification: 'mellow_a_frame',
      peelDirection: 'a_frame',
    }));
    const { container, getByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(container.textContent).toContain('‹›');
    const srText = getByText('A-frame — peels both ways');
    expect(srText.className).toContain('sr-only');
  });

  it('peelDirection null: no chevron, no sr-text', () => {
    surfData = buildSurfData(buildEntry({
      peelAngle: 45,
      peelClassification: 'fast',
      peelDirection: null,
    }));
    const { container, queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(container.textContent).not.toMatch(/[›‹]/);
    expect(queryByText(/peels|A-frame/)).toBeNull();
  });

  it('peelDirection unrecognized (opaque-string tolerance): no chevron, no crash', () => {
    surfData = buildSurfData(buildEntry({
      peelAngle: 45,
      peelClassification: 'fast',
      // @ts-expect-error — deliberately an unrecognized value to prove tolerance; the real field is typed 'right'|'left'|'a_frame'|null but the server is not compile-time-guaranteed to only ever send those.
      peelDirection: 'diagonal',
    }));
    expect(() => render(<SurfingTab locationId="huntington-city-beach-pier" />)).not.toThrow();
    const { container, queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(container.textContent).not.toMatch(/[›‹]/);
    expect(queryByText(/peels|A-frame/)).toBeNull();
  });

  // D8 folded-in gap fix: the 72-hour forecast timeline's peel-angle row
  // abbreviates `peelClassification` by direct string replacement (a
  // DIFFERENT, untouched code path from the chevron above) — `_a_frame`
  // previously fell through to the generic `_` -> ' ' replace, leaving a
  // stray underscore ("fast_a_frame" -> "fast a_frame").
  it('72h forecast row: "_a_frame" suffix renders cleanly ("A-frame"), no stray underscore', () => {
    surfData = buildSurfData(buildEntry({
      peelAngle: 45,
      peelClassification: 'fast_a_frame',
    }));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(container.textContent).toMatch(/fast A-frame/);
    expect(container.textContent).not.toMatch(/a_frame/);
  });
});

// D9 (2026-08-02) — "T6.1: 3 stats" block restructured from one <dl> with
// dt/dd nested two <div> levels deep (axe definition-list + dlitem,
// serious x2) into 3 independent mini-<dl>s, each with dt/dd as direct
// children. Grid classes preserved (visual layout unchanged); icon moved
// to a sibling of the dl instead of inside it.
describe('SurfingTab — 3-stat dl structure (D9, 2026-08-02)', () => {
  it('renders exactly 3 <dl> elements for the T6.1 stats, each with exactly one direct dt + dd child', () => {
    surfData = buildSurfData(buildEntry({}));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    const dls = Array.from(container.querySelectorAll('dl'));
    // The Wind card also has a <dl> (unrelated, untouched, already-compliant
    // pattern) — filter to the ones with a single dt+dd pair (this round's
    // restructure target), not the Wind card's 4-stat single dl.
    const miniDls = dls.filter((dl) => dl.children.length === 2 && dl.children[0].tagName === 'DT' && dl.children[1].tagName === 'DD');
    expect(miniDls.length).toBe(3);
  });

  it('the outer stats container is a plain <div> (grid classes preserved), not a <dl>', () => {
    surfData = buildSurfData(buildEntry({}));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    const gridDiv = container.querySelector('div.grid.grid-cols-3.gap-x-4.gap-y-2');
    expect(gridDiv).not.toBeNull();
    expect(gridDiv?.tagName).toBe('DIV');
  });
});

// C1 (L1-BOUNDARY-REBUILD-PLAN Phase C, P13, 2026-08-08) — Current Swell
// Conditions card: dumb-renderer range display over server-computed
// swellHeightMinFt/MaxFt, faceHeightMinFt/MaxFt, combinedPeriodS. No
// client-side eligibility logic — these tests only pin the RENDER contract
// (range text, collapse-to-one-number, null fallback), not any eligibility
// rule (that's server-side/API-repo scope).
describe('SurfingTab — swell-conditions card range fields (C1, P13)', () => {
  it('renders "min–max ft" for swell height and face height, and the combined period, when all P13 fields are present', () => {
    surfData = buildSurfData(buildEntry({
      swellHeightMinFt: 1.1,
      swellHeightMaxFt: 1.5,
      faceHeightMinFt: 2.5,
      faceHeightMaxFt: 3.1,
      combinedPeriodS: 15.1,
    }));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(container.textContent).toMatch(/1\.1.{0,2}–.{0,2}1\.5/);
    expect(container.textContent).toMatch(/2\.5.{0,2}–.{0,2}3\.1/);
    expect(container.textContent).toContain('15.1');
  });

  it('collapses to a single number when min === max', () => {
    surfData = buildSurfData(buildEntry({
      swellHeightMinFt: 2.0,
      swellHeightMaxFt: 2.0,
    }));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(container.textContent).not.toMatch(/2\.0.{0,2}–.{0,2}2\.0/);
    expect(container.textContent).toMatch(/2\.0/);
  });

  it('falls back to the pre-C1 display when the P13 fields are absent (older cached response)', () => {
    surfData = buildSurfData(buildEntry({
      swellHeightMinFt: undefined,
      swellHeightMaxFt: undefined,
      faceHeightMinFt: undefined,
      faceHeightMaxFt: undefined,
      combinedPeriodS: undefined,
      modelSurfHeightMin: 2.5,
      modelSurfHeightMax: 3.1,
    }));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    // Old modelSurfHeightMin/Max range still renders (pre-C1 fallback path).
    expect(container.textContent).toMatch(/2\.5.{0,2}–.{0,2}3\.1/);
    expect(container.textContent).not.toMatch(/undefined/);
    expect(container.textContent).not.toMatch(/NaN/);
  });
});

// D2 ruling 2026-08-04, S-SPEC-2 — the Current Swell card's shadow-face-height
// secondary line and AT BREAK per-partition rows are REMOVED from this card's
// render (ca0689e): "no user will know what the hell that is… these were
// computed for other parts of the dashboard, NOT for the Current Swell
// conditions card" (operator chat, 2026-08-04). This replaces the D10.2
// (2026-08-03) describe blocks below, which pinned the now-removed render —
// those "renders the value/rows when present" assertions are stale by the
// same ruling and are deleted; the null/undefined absence assertions still
// hold (nothing rendered before OR after) and are kept unchanged.
//
// Render-only removal — shadowFaceHeight and perPartitionBreaks stay on the
// wire (SurfForecast type, OpenAPI spec) for other dashboard consumers
// (BeachProfileCardBody, HeatMapCard); these guards assert the CARD omits
// them even when the mocked payload carries non-null values for both.
describe('SurfingTab — shadowFaceHeight secondary readout (D10.2)', () => {
  it('renders nothing when shadowFaceHeight is null', () => {
    surfData = buildSurfData(buildEntry({ shadowFaceHeight: null }));
    const { queryByText, container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText(/pier shadow|In shadow/i)).toBeNull();
    expect(container.textContent).not.toMatch(/NaN/);
    expect(container.textContent).not.toMatch(/undefined/);
  });

  it('renders nothing when shadowFaceHeight is absent (undefined)', () => {
    surfData = buildSurfData(buildEntry({ shadowFaceHeight: undefined }));
    const { queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText(/pier shadow|In shadow/i)).toBeNull();
  });

  it('does NOT render the shadow face-height secondary line even when shadowFaceHeight is present (D2 ruling 2026-08-04, S-SPEC-2)', () => {
    surfData = buildSurfData(buildEntry({ shadowFaceHeight: 0.6 }));
    const { queryByText, container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText(/pier shadow|In shadow/i)).toBeNull();
    expect(container.textContent).not.toMatch(/NaN/);
    expect(container.textContent).not.toMatch(/undefined/);
  });
});

describe('SurfingTab — per-partition break rows (D10.2)', () => {
  const PARTITION_BREAK = (overrides: Partial<import('../../../api/types').BeachProfilePerPartitionBreak> = {}) => ({
    partitionIndex: 0,
    periodS: 12.4,
    directionDeg: 245,
    heightM: 1.1,
    classification: 'groundswell',
    meanBreakDistanceM: 42,
    meanFaceHeightM: 1.05,
    peakFaceHeightM: 1.3,
    meanBreakDepthM: 1.5,
    dominantBreakerType: 'plunging' as const,
    ...overrides,
  });

  it('renders nothing when perPartitionBreaks is null (pipeline unavailable or empty list)', () => {
    surfData = buildSurfData(buildEntry({ perPartitionBreaks: null }));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(container.textContent).not.toMatch(/NaN/);
    expect(container.textContent).not.toMatch(/undefined/);
  });

  it('renders nothing when perPartitionBreaks is absent (undefined)', () => {
    surfData = buildSurfData(buildEntry({ perPartitionBreaks: undefined }));
    expect(() => render(<SurfingTab locationId="huntington-city-beach-pier" />)).not.toThrow();
  });

  it('does NOT render an "AT BREAK" heading or any per-partition rows even when perPartitionBreaks is present and non-empty (D2 ruling 2026-08-04, S-SPEC-2)', () => {
    surfData = buildSurfData(buildEntry({
      perPartitionBreaks: [
        PARTITION_BREAK({ partitionIndex: 0, periodS: 12.4, directionDeg: 245, meanFaceHeightM: 1.05, classification: 'groundswell', dominantBreakerType: 'plunging' }),
        PARTITION_BREAK({ partitionIndex: 1, periodS: 7.2, directionDeg: 210, meanFaceHeightM: 0.6, classification: 'wind_swell', dominantBreakerType: 'spilling' }),
      ],
    }));
    const { container, queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText(/AT BREAK/i)).toBeNull();
    expect(container.querySelector('ul[aria-label] li')).toBeNull();
  });
});

// S4 (ROUND-S-LEGS-2-4-BRIEFS-2026-08-05.md LEG 3 / EYEBALL-FIX-PLAN-2026-08-04
// S-SPEC-1) — ScoreBar fill width regression guard for the ADR-101 five-factor
// scoring card, standing on ADR-096: component score bars fill to a FIXED
// denominator of 100 (trivially satisfied post-rebuild — every factor's own
// max IS 100), never a per-category max and never a signed adjustment scale.
// REPLACES the prior 3-factor/3-penalty guard (a35373d) — that shape is
// deleted (ADR-101 "Removed entirely"), not hidden.
//
// scoring.{size,shape,conditions,power,consistency} are ints 0-100 straight
// off the wire (SurfScoringBreakdown, S-SPEC-1) — reading `primary.scoring`
// fields directly exercises the real fillPct computation, not a
// re-derivation of it.
describe('SurfingTab — ScoreBar fill width, fixed 0-100 denominator (S4, ADR-096/ADR-101)', () => {
  const SCORING = (overrides: Partial<import('../../../api/types').SurfScoringBreakdown> = {}): import('../../../api/types').SurfScoringBreakdown => ({
    size: 60,
    shape: 60,
    conditions: 60,
    power: 60,
    consistency: 60,
    weights: { size: 0.25, shape: 0.25, conditions: 0.20, power: 0.20, consistency: 0.10 },
    ...overrides,
  });

  // Locates a single ScoreBar's fill element by its (mocked-t, literal-key)
  // label text, scoped to that bar's own wrapper — not a global style/width
  // grep, so this fails correctly if a DIFFERENT bar's width happens to
  // collide with the expected percentage.
  function fillWidthFor(container: HTMLElement, labelKey: string): string {
    const labelEl = Array.from(container.querySelectorAll('span')).find((el) => el.textContent === labelKey);
    if (!labelEl) throw new Error(`ScoreBar label not found: ${labelKey}`);
    const barWrap = labelEl.closest('div.flex.flex-col.gap-1');
    if (!barWrap) throw new Error(`ScoreBar wrapper not found for: ${labelKey}`);
    const fill = barWrap.querySelector('[aria-hidden="true"] > div') as HTMLElement | null;
    if (!fill) throw new Error(`ScoreBar fill element not found for: ${labelKey}`);
    return fill.style.width;
  }

  it('factor bar: score 62 fills to 62% (fixed denominator 100, NOT a per-category max)', () => {
    surfData = buildSurfData(buildEntry({ scoring: SCORING({ size: 62 }) }));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(fillWidthFor(container, 'surfing.scoring.size')).toBe('62%');
  });

  it('factor bar: score 100 fills to 100%', () => {
    surfData = buildSurfData(buildEntry({ scoring: SCORING({ shape: 100 }) }));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(fillWidthFor(container, 'surfing.scoring.shape')).toBe('100%');
  });

  it('factor bar: score 0 fills to 0%', () => {
    surfData = buildSurfData(buildEntry({ scoring: SCORING({ conditions: 0 }) }));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(fillWidthFor(container, 'surfing.scoring.conditions')).toBe('0%');
  });

  it('renders all five factor bars (Size/Shape/Conditions/Power/Consistency) and no others', () => {
    surfData = buildSurfData(buildEntry({ scoring: SCORING() }));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    for (const key of ['size', 'shape', 'conditions', 'power', 'consistency']) {
      expect(fillWidthFor(container, `surfing.scoring.${key}`)).toBe('60%');
    }
  });

  // FAIL condition (S4): beachAlignment/directionalExposure/timeOfDay must
  // never be referenced anywhere in dashboard src post-ADR-101 — the
  // adjustments column is DELETED, not hidden.
  it('does NOT render the deleted adjustments column (beachAlignment/directionalExposure/timeOfDay)', () => {
    surfData = buildSurfData(buildEntry({ scoring: SCORING() }));
    const { queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText('surfing.scoring.componentsHeader')).toBeNull();
    expect(queryByText('surfing.scoring.adjustmentsHeader')).toBeNull();
    expect(queryByText('surfing.scoring.beachAlignment')).toBeNull();
    expect(queryByText('surfing.scoring.directionalExposure')).toBeNull();
    expect(queryByText('surfing.scoring.timeOfDay')).toBeNull();
  });

  // H5 (2026-08-10, MARINE-PAGE-FIXIT-PLAN, fixit log Item 3) — the
  // always-visible footer caption repeating the geometric-mean explainer
  // is DELETED (it duplicated the info-icon modal's own text). This test
  // previously asserted the caption rendered unconditionally; it now
  // asserts the OPPOSITE (no caption on the closed card) plus the i18n key
  // + modal usage staying intact, per the plan's "i18n key and the info-
  // modal usage stay" instruction — same commit as the behavior change.
  it('does NOT render the geometric-mean explainer as a footer caption (H5 — duplicated the info-icon modal)', () => {
    surfData = buildSurfData(buildEntry({ scoring: SCORING() }));
    const { queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText('surfing.scoring.geometricMeanExplainer')).toBeNull();
  });

  it('the geometric-mean explainer text still renders inside the info-icon modal (i18n key + modal usage UNCHANGED by H5)', () => {
    surfData = buildSurfData(buildEntry({ scoring: SCORING() }));
    const { getByLabelText, getByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    fireEvent.click(getByLabelText('surfing.scoringExplainer.title'));
    getByText('surfing.scoring.geometricMeanExplainer');
  });
});

// S4 — qualityScore (the total, ADR-101 Round S) is read directly from the
// wire, NEVER reconstructed by summing the five scoring factors (which no
// longer sum to the total under the geometric mean — ADR-101: "Bars no
// longer sum to the total").
describe('SurfingTab — total score reads qualityScore directly, never reconstructed (S4, ADR-101)', () => {
  it('renders primary.qualityScore verbatim, not a sum of scoring factors', () => {
    surfData = buildSurfData(buildEntry({
      qualityScore: 47,
      scoring: {
        size: 90, shape: 90, conditions: 90, power: 90, consistency: 90,
        weights: { size: 0.25, shape: 0.25, conditions: 0.20, power: 0.20, consistency: 0.10 },
      },
    }));
    const { container } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    // The true total (47) must render even though every factor is 90 — a
    // naive sum-of-factors reconstruction would show something else entirely
    // (450, the old-shape-style additive sum). Text matcher checks the FULL
    // combined text content of the score span (numeral + nested "/100" span)
    // since the two are separate text/element nodes under one parent.
    expect(
      Array.from(container.querySelectorAll('span')).some((el) => el.textContent === '47/100'),
    ).toBe(true);
    expect(container.textContent).not.toContain('450');
  });

  it('suppresses the numeric total (stars-only) when qualityScore is null', () => {
    surfData = buildSurfData(buildEntry({
      qualityStars: null,
      qualityLabel: null,
      qualityScore: null,
      scoring: null,
    }));
    const { queryByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    expect(queryByText('/100')).toBeNull();
  });
});
