// useImageryConfig.test.ts — Phase LM, LM-2.
//
// Null-safety contract (plan item (e)): both "no coordinates" and "fetch
// failed" must resolve to `data: null`, never throw, never surface as a
// blocking error state — imagery is a decorative background layer.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useImageryConfig, getImageryConfig } from './useImageryConfig';
import type { ImageryConfigResponse } from '../api/types';

const mockFetchApi = vi.fn();

vi.mock('../api/client', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

// useApiQuery (the underlying hook) calls useIsIdle(), which requires an
// IdleDetectorProvider ancestor outside a real app tree — mock it out since
// idle behavior is not under test here.
vi.mock('./useIdleDetector', () => ({
  useIsIdle: () => false,
}));

// Deliberately the PRE-M4 wire shapes (legacy pass-through cases); the
// `provider`/`proxyMode` literals sit outside the narrowed union by design —
// cast, because `tsc -b` type-checks test files in the production build
// (deploy 2026-08-27).
const NAIP_CONFIG = {
  provider: 'naip',
  tileUrl: '/api/v1/imagery/tiles/{z}/{x}/{y}',
  attribution: 'USGS National Agriculture Imagery Program (NAIP) — public domain',
  proxyMode: 'api',
  bounds: { south: 24.396308, west: -125.0, north: 49.384358, east: -66.93457 },
} as unknown as ImageryConfigResponse;

const ESRI_CONFIG = {
  provider: 'esri',
  tileUrl: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
  proxyMode: 'direct',
  bounds: null,
} as unknown as ImageryConfigResponse;

describe('useImageryConfig', () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it('skips the fetch and returns data:null when lat/lon are null', () => {
    const { result } = renderHook(() => useImageryConfig(null, null));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockFetchApi).not.toHaveBeenCalled();
  });

  it('skips the fetch and returns data:null when lat/lon are undefined', () => {
    const { result } = renderHook(() => useImageryConfig(undefined, undefined));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockFetchApi).not.toHaveBeenCalled();
  });

  it('fetches and returns the NAIP config for valid coordinates', async () => {
    mockFetchApi.mockResolvedValue(NAIP_CONFIG);
    const { result } = renderHook(() => useImageryConfig(33.66, -118.0));
    await waitFor(() => expect(result.current.data).toEqual(NAIP_CONFIG));
    expect(result.current.loading).toBe(false);
    expect(mockFetchApi).toHaveBeenCalledWith(
      '/imagery/config',
      { lat: '33.66', lon: '-118' },
      expect.anything(),
    );
  });

  it('fetches and returns the ESRI config for valid coordinates', async () => {
    mockFetchApi.mockResolvedValue(ESRI_CONFIG);
    const { result } = renderHook(() => useImageryConfig(51.5, -0.12));
    await waitFor(() => expect(result.current.data).toEqual(ESRI_CONFIG));
  });

  it('404 (imagery disabled) resolves to data:null, no crash, no thrown error', async () => {
    // Distinct coordinates from the other tests in this file — useApiQuery's
    // module-level cache key is derived from (fetcher source text + deps),
    // and every call site here uses the same fetcher source text, so a
    // repeated (lat, lon) pair would collide with another test's cached
    // result instead of exercising this test's own mock.
    mockFetchApi.mockRejectedValue(new Error('404: not found'));
    const { result } = renderHook(() => useImageryConfig(10.0, 20.0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  it('network failure resolves to data:null, no crash', async () => {
    mockFetchApi.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useImageryConfig(11.0, 21.0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  it('getImageryConfig() calls fetchApi with the expected path and params', () => {
    mockFetchApi.mockResolvedValue(NAIP_CONFIG);
    getImageryConfig(33.66, -118.0);
    expect(mockFetchApi).toHaveBeenCalledWith(
      '/imagery/config',
      { lat: '33.66', lon: '-118' },
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// M4-DASH (SURF-MAP-BASEMAP, PA9, 2026-08-27) — the API's /imagery/config
// response gains optional light/dark/zoomMin/zoomMax fields (meta contract
// docs/contracts/openapi-v1.yaml ImageryConfigResponse/ImageryLightSource/
// ImageryDarkSource, verified against the synced meta contract at commit
// 897a79b3 before writing this fixture). useImageryConfig.ts itself is
// "unchanged except the type" per the round brief — this hook does not
// inspect or reshape the response, so this is a production-shaped
// pass-through guard (the real response the API now serves), not a probe
// for new hook logic. Fixture matches the plan §M4 "Lead mechanics" response
// literally: provider "basemap", legacy tileUrl/attribution carrying the
// light theme's values (old-client compatibility), light.tileUrl the OSM
// template with {s} pre-expanded to "a", dark.pmtilesUrl the LOCAL basemap
// tier path, dark.maxDataZoom 15 (the local tier's vector data ceiling),
// zoomMin 0 / zoomMax 19.
//
// Pre-change result (run at HEAD 43afaee, before src/api/types.ts gained the
// optional fields — useImageryConfig.ts is untyped JS at runtime and does
// not strip unknown properties, so this already PASSES pre-change; recorded
// here per the round brief's "pre-change transcripts in module comments"
// instruction, not because a code change was needed to make it pass):
//
//   $ npx vitest run src/hooks/useImageryConfig.test.ts
//   ✓ useImageryConfig > M4-DASH — /imagery/config basemap response >
//     passes through light/dark/zoomMin/zoomMax fields unchanged
//   Test Files  1 passed (1)
//        Tests  8 passed (8)   [7 pre-existing + this 1 new test]
// ---------------------------------------------------------------------------
const BASEMAP_CONFIG: ImageryConfigResponse = {
  provider: 'basemap',
  tileUrl: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
  proxyMode: 'direct',
  bounds: null,
  light: {
    tileUrl: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
  },
  dark: {
    pmtilesUrl: '/api/v1/basemap/local/tiles',
    maxDataZoom: 15,
    attribution: '© OpenStreetMap contributors © Protomaps',
  },
  zoomMin: 0,
  zoomMax: 19,
};

describe('useImageryConfig — M4-DASH /imagery/config basemap response (PA9)', () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it('passes through light/dark/zoomMin/zoomMax fields unchanged', async () => {
    mockFetchApi.mockResolvedValue(BASEMAP_CONFIG);
    // Distinct coordinates from every other test in this file — see the
    // module-level cache-key note on the 404 test above.
    const { result } = renderHook(() => useImageryConfig(12.0, 22.0));
    await waitFor(() => expect(result.current.data).toEqual(BASEMAP_CONFIG));
    expect(result.current.data?.light).toEqual(BASEMAP_CONFIG.light);
    expect(result.current.data?.dark).toEqual(BASEMAP_CONFIG.dark);
    expect(result.current.data?.zoomMin).toBe(0);
    expect(result.current.data?.zoomMax).toBe(19);
    // Legacy top-level fields still carry the light theme's values, for an
    // old client that has not been updated to read `.light`.
    expect(result.current.data?.tileUrl).toBe(BASEMAP_CONFIG.light!.tileUrl);
    expect(result.current.data?.attribution).toBe(BASEMAP_CONFIG.light!.attribution);
  });
});
