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

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SurfingTab } from './SurfingTab';
import type { SurfDetailData, SurfForecast } from '../../../api/types';

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

vi.mock('../../../hooks/useWeatherData', () => ({
  useSurfDetail: () => ({ data: surfData, units: { waveHeightAtBreak: 'ft', distance: 'ft' }, loading: false, error: null, refetch: vi.fn() }),
  useBeachProfile: () => HOOK_RESULT_NULL,
  useBeachProfileAll: () => ({ ...HOOK_RESULT_NULL, loading: false }),
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

describe('SurfingTab — main break zone context (D4.2, BD-7/BD-9)', () => {
  it('renders the zone-context line when all three zone fields are present', () => {
    surfData = buildSurfData(buildEntry({
      mainBreakZoneFaceHeight: 1.097,
      mainBreakZoneStartIndex: 19,
      mainBreakZoneEndIndex: 54,
      mainBreakZoneQualifyingCount: 10,
      representativeTransectIndex: 39,
    }));
    const { getByText } = render(<SurfingTab locationId="huntington-city-beach-pier" />);
    // Real locale string is "Main break zone: transects 19–54, 10 qualifying"
    // via the mocked t()'s defaultValue interpolation above.
    expect(getByText(/Main break zone: transects 19–54, 10 qualifying/)).toBeDefined();
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
