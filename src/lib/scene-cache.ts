// scene-cache.ts — single shared reader for the localStorage scene cache.
//
// Background: T5.2 fixed a day/night background-flash bug that had two root
// causes tracing back to this function existing as two independently-drifted
// copies (useWeatherData.ts and useRealtimeObservation.ts) that disagreed on
// the daytime default when the cache key was absent (`=== 'true'` vs.
// `!== 'false'`). This module is now the single source of truth — no other
// file may define its own getCachedScene().
//
// The three localStorage keys read here are written by
// ThemeProvider.cacheScene() (src/lib/theme-provider.tsx). Keep the key
// strings in sync with that file if they ever change.

import type { SceneDescriptor } from '../api/types';

/**
 * Reads the cached scene from localStorage (written by ThemeProvider.cacheScene
 * on every /current response). Falls back to clear/night/no-overlay on
 * first-ever visit or during SSR — the splash screen (and, on client, the
 * SceneBackground `visible` gate) covers the page until real data arrives
 * anyway, so this default is a brief starting point, not user-visible state.
 *
 * Defaults `daytime` to `false` (night) when the cache key is absent,
 * consistent with ThemeProvider's SSR/cold-start fallback which also
 * defaults to dark mode.
 */
export function getCachedScene(): SceneDescriptor {
  if (typeof window === 'undefined') {
    return { sky: 'clear', daytime: false, overlay: null };
  }
  const sky = localStorage.getItem('clearskies.scene.sky');
  const daytime = localStorage.getItem('clearskies.scene.daytime');
  const overlay = localStorage.getItem('clearskies.scene.overlay');
  return {
    sky: sky === 'clear' || sky === 'cloudy' || sky === 'storm' ? sky : 'clear',
    daytime: daytime === 'true',
    overlay: overlay === 'rain' ? 'rain' : overlay === 'snow' ? 'snow' : null,
  };
}
