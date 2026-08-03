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
