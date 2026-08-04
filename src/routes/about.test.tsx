// about.test.tsx — LM-3 (2026-08-04): imagery-provider attribution entry in
// the About page's Data Providers card. The served `attribution` string is
// ToS-mandated and rendered VERBATIM (never through t()), for the ACTIVE
// imagery provider (naip/esri) resolved for the primary marine location
// (marineLocations[0] — the same "primary marine location" convention
// marine-summary-card.tsx already uses), matching HeatMapCard's own
// useImageryConfig data path (same hook, imported directly here, not
// reimplemented). Absent entirely when no imagery config resolves (no
// marine location, fetch failure, feature disabled) — same resilience
// posture as the existing marine-photo-credits sub-section on this page.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AboutPage } from './about';
import type { ImageryConfigResponse, MarineLocationSummary } from '../api/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts && typeof opts.defaultValue === 'string') ? opts.defaultValue : key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const HOOK_RESULT_NULL = { data: null, units: undefined, loading: false, error: null, refetch: vi.fn() };

let marineLocations: MarineLocationSummary[] | null = [];

vi.mock('../hooks/useWeatherData', () => ({
  useStation: () => HOOK_RESULT_NULL,
  useCapabilities: () => HOOK_RESULT_NULL,
  useMarineLocations: () => ({ ...HOOK_RESULT_NULL, data: marineLocations }),
}));

// LM-2's own hook, imported directly (not reimplemented) — mocked at the
// module boundary exactly as HeatMapCard.test.tsx / SurfingTab.test.tsx do,
// so this test controls the resolved imagery config synchronously without a
// real fetch.
const mockUseImageryConfig = vi.fn();
vi.mock('../hooks/useImageryConfig', () => ({
  useImageryConfig: (...args: unknown[]) => mockUseImageryConfig(...args),
}));

vi.mock('../lib/branding-provider', () => ({
  useBranding: () => ({
    siteTitle: '',
    aboutContent: '',
    stationPhotoUrl: '',
    stationPhotoAlt: '',
  }),
}));

const NAIP_CONFIG: ImageryConfigResponse = {
  provider: 'naip',
  tileUrl: '/api/v1/imagery/tiles/{z}/{x}/{y}',
  attribution: 'USGS National Agriculture Imagery Program (NAIP) — public domain',
  proxyMode: 'api',
  bounds: { south: 24.396308, west: -125.0, north: 49.384358, east: -66.93457 },
};

const MARINE_LOCATION: MarineLocationSummary = {
  locationId: 'spot-1',
  name: 'Test Beach',
  coordinates: { lat: 34.0, lon: -119.5 },
  activities: [],
  currentConditions: null,
  currentTide: null,
  activeAlerts: null,
  surfRating: null,
  beachSafetyLevel: null,
  weatherCode: null,
  isDay: null,
};

beforeEach(() => {
  mockUseImageryConfig.mockReset();
  mockUseImageryConfig.mockReturnValue({ data: null, loading: false });
  marineLocations = [];
  // /marine-photos.json — 404, feature absent. Matches the existing
  // marine-photo-credits resilience path (about.tsx:97-102); not under test
  // here.
  global.fetch = vi.fn().mockResolvedValue({ ok: false });
});

describe('AboutPage — imagery provider attribution', () => {
  it('renders the active provider\'s verbatim attribution text when an imagery config resolves', async () => {
    marineLocations = [MARINE_LOCATION];
    mockUseImageryConfig.mockReturnValue({ data: NAIP_CONFIG, loading: false });

    const { findByText } = render(<AboutPage />);

    expect(await findByText(NAIP_CONFIG.attribution)).toBeDefined();
    // Reuses HeatMapCard's own data path: the primary marine location's
    // coordinates (marineLocations[0].coordinates), not an invented fetch.
    expect(mockUseImageryConfig).toHaveBeenCalledWith(34.0, -119.5);
  });

  it('renders no imagery attribution entry when no imagery config resolves (no marine location)', async () => {
    marineLocations = [];
    mockUseImageryConfig.mockReturnValue({ data: null, loading: false });

    const { queryByText } = render(<AboutPage />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(queryByText(/USGS National Agriculture Imagery Program/)).toBeNull();
    expect(queryByText(/^Source: Esri/)).toBeNull();
  });
});
