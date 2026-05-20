// useRealtimeObservation.test.ts
// Tests for the merged observation hook and the field mapping utility.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { mapPacketToObservation, WEEWX_TO_OBSERVATION, useRealtimeObservation } from './useRealtimeObservation';
import type { Observation } from '../api/types';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock isMockMode to control SSE skip path.
vi.mock('../api/client', () => ({
  isMockMode: vi.fn(() => false),
}));

import { isMockMode } from '../api/client';
const mockIsMockMode = isMockMode as ReturnType<typeof vi.fn>;

// Mock useObservation so we can control its return value.
const mockRefetch = vi.fn();
const mockUseObservation = vi.fn();

vi.mock('./useWeatherData', () => ({
  useObservation: () => mockUseObservation(),
}));

// Mock useSSE so we can feed packets manually.
const mockUseSSE = vi.fn();

vi.mock('./useSSE', () => ({
  useSSE: (url: string) => mockUseSSE(url),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    timestamp: '2026-05-19T12:00:00Z',
    outTemp: 70.0,
    outHumidity: 55.0,
    windSpeed: 5.0,
    windDir: 180,
    windGust: 8.0,
    windGustDir: 185,
    barometer: 29.95,
    pressure: null,
    altimeter: null,
    dewpoint: 52.0,
    windchill: null,
    heatindex: null,
    rainRate: 0,
    rain: 0,
    barometerTrend: null,
    radiation: null,
    UV: null,
    inTemp: null,
    inHumidity: null,
    appTemp: 70.0,
    extras: {},
    source: 'weewx',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: mapPacketToObservation
// ---------------------------------------------------------------------------

describe('mapPacketToObservation', () => {
  it('converts dateTime epoch to ISO timestamp string', () => {
    const partial = mapPacketToObservation({ dateTime: 1716120000 });
    // 1716120000 seconds → 2024-05-19T12:00:00Z (sanity-checked via Date)
    expect(partial.timestamp).toBe(new Date(1716120000 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  });

  it('maps outTemp directly (same name, no conversion)', () => {
    const partial = mapPacketToObservation({ outTemp: 72.5 });
    expect(partial.outTemp).toBe(72.5);
  });

  it('maps all numeric fields in WEEWX_TO_OBSERVATION with pass-through values', () => {
    const packet: Record<string, unknown> = {};
    for (const key of Object.keys(WEEWX_TO_OBSERVATION)) {
      packet[key] = 1.0;
    }
    const partial = mapPacketToObservation(packet);
    for (const obsKey of Object.values(WEEWX_TO_OBSERVATION)) {
      expect(partial[obsKey]).toBe(1.0);
    }
  });

  it('ignores weewx fields not in the mapping', () => {
    const partial = mapPacketToObservation({
      usUnits: 1,
      interval: 5,
      txBattStatus: 0,
      rxCheckPercent: 98,
    });
    // None of these keys are on the Observation type — they should be absent.
    expect(partial).not.toHaveProperty('usUnits');
    expect(partial).not.toHaveProperty('interval');
    expect(partial).not.toHaveProperty('txBattStatus');
    expect(partial).not.toHaveProperty('rxCheckPercent');
  });

  it('includes null values (sensor not available)', () => {
    const partial = mapPacketToObservation({ outTemp: null, UV: null });
    expect(partial.outTemp).toBeNull();
    expect(partial.UV).toBeNull();
  });

  it('omits fields not present in the packet', () => {
    const partial = mapPacketToObservation({ outTemp: 70.0 });
    expect(partial).not.toHaveProperty('windSpeed');
    expect(partial).not.toHaveProperty('barometer');
  });

  it('sets source to "weewx-sse"', () => {
    const partial = mapPacketToObservation({ outTemp: 70.0 });
    expect(partial.source).toBe('weewx-sse');
  });

  it('handles empty packet gracefully', () => {
    const partial = mapPacketToObservation({});
    expect(partial.source).toBe('weewx-sse');
    expect(partial.timestamp).toBeUndefined();
    expect(partial.outTemp).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: WEEWX_TO_OBSERVATION mapping object
// ---------------------------------------------------------------------------

describe('WEEWX_TO_OBSERVATION', () => {
  it('maps outTemp to outTemp', () => {
    expect(WEEWX_TO_OBSERVATION['outTemp']).toBe('outTemp');
  });

  it('maps windSpeed to windSpeed', () => {
    expect(WEEWX_TO_OBSERVATION['windSpeed']).toBe('windSpeed');
  });

  it('maps windDir to windDir', () => {
    expect(WEEWX_TO_OBSERVATION['windDir']).toBe('windDir');
  });

  it('maps barometer to barometer', () => {
    expect(WEEWX_TO_OBSERVATION['barometer']).toBe('barometer');
  });

  it('maps outHumidity to outHumidity', () => {
    expect(WEEWX_TO_OBSERVATION['outHumidity']).toBe('outHumidity');
  });

  it('maps dewpoint to dewpoint', () => {
    expect(WEEWX_TO_OBSERVATION['dewpoint']).toBe('dewpoint');
  });

  it('maps heatindex to heatindex', () => {
    expect(WEEWX_TO_OBSERVATION['heatindex']).toBe('heatindex');
  });

  it('maps windchill to windchill', () => {
    expect(WEEWX_TO_OBSERVATION['windchill']).toBe('windchill');
  });

  it('maps rainRate to rainRate', () => {
    expect(WEEWX_TO_OBSERVATION['rainRate']).toBe('rainRate');
  });

  it('maps UV to UV', () => {
    expect(WEEWX_TO_OBSERVATION['UV']).toBe('UV');
  });

  it('maps radiation to radiation', () => {
    expect(WEEWX_TO_OBSERVATION['radiation']).toBe('radiation');
  });

  it('does NOT contain dateTime (handled separately via conversion)', () => {
    expect(WEEWX_TO_OBSERVATION).not.toHaveProperty('dateTime');
  });
});

// ---------------------------------------------------------------------------
// Tests: useRealtimeObservation integration
// ---------------------------------------------------------------------------

describe('useRealtimeObservation', () => {
  beforeEach(() => {
    mockIsMockMode.mockReturnValue(false);
    mockRefetch.mockReset();
    // Default: REST loading, no SSE packet
    mockUseObservation.mockReturnValue({
      data: null,
      units: undefined,
      source: 'weewx',
      loading: true,
      error: null,
      refetch: mockRefetch,
    });
    mockUseSSE.mockReturnValue({ packet: null, status: 'connecting' });
    // Suppress import.meta.env access in tests
    vi.stubGlobal('import.meta', { env: { VITE_SSE_URL: '' } });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes loading and error from useObservation while REST is in-flight', () => {
    const { result } = renderHook(() => useRealtimeObservation());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it('returns REST observation as initial data when loaded', () => {
    const obs = makeObservation();
    mockUseObservation.mockReturnValue({
      data: obs,
      units: { outTemp: '°F' },
      source: 'weewx',
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseSSE.mockReturnValue({ packet: null, status: 'connected' });

    const { result } = renderHook(() => useRealtimeObservation());
    expect(result.current.data?.outTemp).toBe(70.0);
    expect(result.current.loading).toBe(false);
  });

  it('merges SSE packet fields over the base observation', () => {
    const obs = makeObservation({ outTemp: 70.0, windSpeed: 5.0 });
    mockUseObservation.mockReturnValue({
      data: obs,
      units: { outTemp: '°F' },
      source: 'weewx',
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    // First render: no SSE packet yet.
    let currentPacket: Record<string, unknown> | null = null;
    mockUseSSE.mockImplementation(() => ({ packet: currentPacket, status: 'connected' }));

    const { result, rerender } = renderHook(() => useRealtimeObservation());
    expect(result.current.data?.outTemp).toBe(70.0);

    // Simulate an SSE packet arriving.
    act(() => {
      currentPacket = { outTemp: 73.5, windSpeed: 9.1, dateTime: 1716120300 };
      rerender();
    });

    // SSE values should have overwritten the observation.
    expect(result.current.data?.outTemp).toBe(73.5);
    expect(result.current.data?.windSpeed).toBe(9.1);
    // Fields not in packet stay unchanged.
    expect(result.current.data?.barometer).toBe(29.95);
    // source updated to weewx-sse
    expect(result.current.data?.source).toBe('weewx-sse');
  });

  it('does not apply SSE update if REST data has not loaded yet', () => {
    // REST still loading — no base observation.
    mockUseObservation.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });
    mockUseSSE.mockReturnValue({
      packet: { outTemp: 73.5 },
      status: 'connected',
    });

    const { result } = renderHook(() => useRealtimeObservation());
    // No base to merge onto — data stays null.
    expect(result.current.data).toBeNull();
  });

  it('preserves units from useObservation', () => {
    const obs = makeObservation();
    mockUseObservation.mockReturnValue({
      data: obs,
      units: { outTemp: '°F', barometer: 'inHg' },
      source: 'weewx',
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseSSE.mockReturnValue({ packet: null, status: 'connected' });

    const { result } = renderHook(() => useRealtimeObservation());
    expect(result.current.units).toEqual({ outTemp: '°F', barometer: 'inHg' });
  });

  it('passes through refetch from useObservation', () => {
    const obs = makeObservation();
    mockUseObservation.mockReturnValue({
      data: obs,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseSSE.mockReturnValue({ packet: null, status: 'connected' });

    const { result } = renderHook(() => useRealtimeObservation());
    result.current.refetch();
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it('passes empty SSE URL when mock mode is active', () => {
    mockIsMockMode.mockReturnValue(true);
    const obs = makeObservation();
    mockUseObservation.mockReturnValue({
      data: obs,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseSSE.mockReturnValue({ packet: null, status: 'disconnected' });

    renderHook(() => useRealtimeObservation());
    // useSSE must have been called with '' (empty) — not a real URL.
    expect(mockUseSSE).toHaveBeenCalledWith('');
  });

  it('passes empty SSE URL when VITE_SSE_URL is not configured (non-mock mode)', () => {
    // isMockMode() is false (default) and VITE_SSE_URL is '' (from beforeEach).
    // SSE should be disabled — useSSE called with empty string.
    mockIsMockMode.mockReturnValue(false);
    const obs = makeObservation();
    mockUseObservation.mockReturnValue({
      data: obs,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseSSE.mockReturnValue({ packet: null, status: 'disconnected' });

    const { result } = renderHook(() => useRealtimeObservation());
    expect(mockUseSSE).toHaveBeenCalledWith('');
    // Falls back to pure REST observation.
    expect(result.current.data).toEqual(obs);
  });
});
