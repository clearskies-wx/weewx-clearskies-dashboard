// useImageryConfig.ts — fetch hook for GET /api/v1/imagery/config (Phase LM,
// LM-2). Orthophoto background imagery for HeatMapCard's DISPLAY-ONLY
// geographic context (API-MANUAL §12a, PROVIDER-MANUAL §16).
//
// Self-contained module: uses the existing fetch-layer primitives
// (`fetchApi`, `useApiQuery`) but does not modify client.ts or
// useWeatherData.ts (LM-2 scope — imagery is new, self-contained surface).
//
// Response shape is FLAT (no `ApiResponse<T>` envelope, no `freshness`
// block) — API-MANUAL §12a's documented intentional deviation.
//
// Null-safety (plan LM-2 item (e)): both "no coordinates yet" (skip) and
// "fetch failed / 404 (imagery disabled)" resolve to `data: null` — the
// caller (HeatMapCard) treats every no-config reason identically, rendering
// exactly the pre-imagery chart with no crash.

import { useApiQuery } from './useApiQuery';
import { fetchApi } from '../api/client';
import type { ImageryConfigResponse } from '../api/types';

/**
 * GET /api/v1/imagery/config?lat=&lon=.
 * Exported for direct testing; HeatMapCard should use the `useImageryConfig`
 * hook below, not this function directly.
 */
export function getImageryConfig(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<ImageryConfigResponse> {
  return fetchApi<ImageryConfigResponse>(
    '/imagery/config',
    { lat: String(lat), lon: String(lon) },
    signal,
  );
}

export interface UseImageryConfigResult {
  data: ImageryConfigResponse | null;
  loading: boolean;
}

/**
 * Fetches the active imagery provider's tile config for the given
 * coordinates. `lat`/`lon` may be `null`/`undefined` (spot coordinates not
 * yet available) — the fetch is skipped and `data` stays `null`.
 *
 * Any fetch failure (404 "imagery disabled", network error, etc.) also
 * resolves to `data: null` — this hook deliberately does not expose a
 * separate `error` field. Imagery is a decorative background layer; a
 * failure here must degrade to "no background image", never to an error
 * state that blocks or alters the heat map's own primary rendering.
 */
export function useImageryConfig(
  lat: number | null | undefined,
  lon: number | null | undefined,
): UseImageryConfigResult {
  const skip = lat == null || lon == null;
  const { data, loading, error } = useApiQuery<ImageryConfigResponse>(
    (signal) => getImageryConfig(lat as number, lon as number, signal),
    { skip, deps: [lat, lon] },
  );
  return { data: error ? null : data, loading: skip ? false : loading };
}
