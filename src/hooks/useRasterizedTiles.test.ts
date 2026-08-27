// useRasterizedTiles.test.ts — MARINE-AND-MAPS-PLAN-2026-08-27 §M4
// (SURF-MAP-BASEMAP, PA9). Guards `useRasterizedTiles(tiles, enabled)` per
// the plan's "Lead mechanics — dashboard side" design block: resolves each
// tile's data URL by calling `rasterizeBasemapTile` (mocked here — the
// rasterization pipeline itself is covered by basemap.test.ts), exposes the
// resolved subset INCREMENTALLY (not gated behind Promise.all — a slow tile
// must not hold back a fast one), and cancels stale work on unmount and on
// tile-set change (a resolution belonging to a superseded tile set must
// never land in state after the tiles prop has moved on).
//
// Key format for the returned Record: `${z}/${x}/${y}` (plain slash-joined,
// no prefix) — confirmed with m4dash-dev 2026-08-27 (matches HeatMapCard.tsx's
// lookup `rasterizedTiles[`${tile.z}/${tile.x}/${tile.y}`]`).
//
// Pre-change failure transcript (run at HEAD 43afaee, src/hooks/useRasterizedTiles.ts
// did not exist yet):
//
//   $ npx vitest run src/hooks/useRasterizedTiles.test.ts
//   FAIL src/hooks/useRasterizedTiles.test.ts [ src/hooks/useRasterizedTiles.test.ts ]
//   Error: Failed to resolve import "./useRasterizedTiles" from "src/hooks/useRasterizedTiles.test.ts".
//   Does the file exist?
//   Test Files  1 failed (1)
//        Tests  no tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRasterizedTiles } from './useRasterizedTiles';

// ---------------------------------------------------------------------------
// Mock rasterizeBasemapTile — the rasterization pipeline itself (View/
// TileCache/PmtilesSource/paint) is guarded independently in
// src/lib/basemap.test.ts; this file tests ONLY the hook's own resolution/
// cancellation contract.
// ---------------------------------------------------------------------------
const mockRasterizeBasemapTile = vi.fn();
vi.mock('../lib/basemap', () => ({
  rasterizeBasemapTile: (...args: unknown[]) => mockRasterizeBasemapTile(...args),
}));

/** A promise the test controls the settling of, for incremental-resolution
 *  and cancellation-race assertions (jsdom has no real network/timer to
 *  drive these orderings implicitly). */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockRasterizeBasemapTile.mockReset();
});

describe('useRasterizedTiles(tiles, enabled)', () => {
  it('enabled=false: returns {} and never calls rasterizeBasemapTile', () => {
    const { result } = renderHook(() => useRasterizedTiles([{ z: 15, x: 1, y: 1 }], false));
    expect(result.current).toEqual({});
    expect(mockRasterizeBasemapTile).not.toHaveBeenCalled();
  });

  it('enabled=true, empty tiles: returns {} and calls rasterizeBasemapTile zero times', () => {
    const { result } = renderHook(() => useRasterizedTiles([], true));
    expect(result.current).toEqual({});
    expect(mockRasterizeBasemapTile).not.toHaveBeenCalled();
  });

  it('resolves each tile to its rasterizeBasemapTile(z, x, y) result, keyed "z/x/y"', async () => {
    mockRasterizeBasemapTile.mockImplementation((z: number, x: number, y: number) =>
      Promise.resolve(`data:image/png;base64,TILE_${z}_${x}_${y}`),
    );
    const tiles = [
      { z: 15, x: 100, y: 200 },
      { z: 15, x: 101, y: 200 },
    ];
    const { result } = renderHook(() => useRasterizedTiles(tiles, true));

    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2));
    expect(result.current['15/100/200']).toBe('data:image/png;base64,TILE_15_100_200');
    expect(result.current['15/101/200']).toBe('data:image/png;base64,TILE_15_101_200');
    expect(mockRasterizeBasemapTile).toHaveBeenCalledWith(15, 100, 200);
    expect(mockRasterizeBasemapTile).toHaveBeenCalledWith(15, 101, 200);
  });

  it('resolves incrementally — a fast tile appears in the record before a slow sibling settles (not gated behind Promise.all)', async () => {
    const fast = { z: 15, x: 1, y: 1 };
    const slow = { z: 15, x: 2, y: 2 };
    const slowDeferred = deferred<string>();
    mockRasterizeBasemapTile.mockImplementation((z: number, x: number, y: number) => {
      if (z === slow.z && x === slow.x && y === slow.y) return slowDeferred.promise;
      return Promise.resolve(`data:image/png;base64,FAST_${z}_${x}_${y}`);
    });

    const { result } = renderHook(() => useRasterizedTiles([fast, slow], true));

    // The fast tile resolves and appears WHILE the slow one is still pending.
    await waitFor(() => expect(result.current['15/1/1']).toBe('data:image/png;base64,FAST_15_1_1'));
    expect(result.current['15/2/2']).toBeUndefined();

    // Now let the slow one settle too.
    slowDeferred.resolve('data:image/png;base64,SLOW_15_2_2');
    await waitFor(() => expect(result.current['15/2/2']).toBe('data:image/png;base64,SLOW_15_2_2'));
  });

  it('a rejected tile is simply omitted from the record — no crash, no fallback entry (directive 15: no fallback to a remote provider)', async () => {
    const ok = { z: 15, x: 1, y: 1 };
    const bad = { z: 15, x: 2, y: 2 };
    mockRasterizeBasemapTile.mockImplementation((z: number, x: number, y: number) => {
      if (z === bad.z && x === bad.x && y === bad.y) return Promise.reject(new Error('rasterize failed'));
      return Promise.resolve(`data:image/png;base64,OK_${z}_${x}_${y}`);
    });

    const { result } = renderHook(() => useRasterizedTiles([ok, bad], true));

    await waitFor(() => expect(result.current['15/1/1']).toBe('data:image/png;base64,OK_15_1_1'));
    // Give the rejected promise a microtask turn to settle too.
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current['15/2/2']).toBeUndefined();
  });

  it('cancels on unmount: a resolution arriving after unmount never triggers a state update (no "update on unmounted component" warning)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tile = { z: 15, x: 9, y: 9 };
    const tileDeferred = deferred<string>();
    mockRasterizeBasemapTile.mockImplementation(() => tileDeferred.promise);

    const { unmount } = renderHook(() => useRasterizedTiles([tile], true));
    unmount();

    tileDeferred.resolve('data:image/png;base64,TOO_LATE');
    // Flush microtasks so the (guarded-against) state update would have had
    // its chance to fire and warn.
    await Promise.resolve();
    await Promise.resolve();

    const unmountedWarnings = consoleErrorSpy.mock.calls.filter((args) =>
      String(args[0]).includes('unmounted'),
    );
    expect(unmountedWarnings).toHaveLength(0);
    consoleErrorSpy.mockRestore();
  });

  it('cancels on tile-set change: a stale resolution from the PREVIOUS tile set never lands in the record for the NEW tile set', async () => {
    const tileA = { z: 15, x: 5, y: 5 };
    const tileB = { z: 15, x: 6, y: 6 };
    const aDeferred = deferred<string>();
    mockRasterizeBasemapTile.mockImplementation((z: number, x: number, y: number) => {
      if (z === tileA.z && x === tileA.x && y === tileA.y) return aDeferred.promise;
      return Promise.resolve(`data:image/png;base64,B_${z}_${x}_${y}`);
    });

    const { result, rerender } = renderHook(
      ({ tiles }: { tiles: { z: number; x: number; y: number }[] }) => useRasterizedTiles(tiles, true),
      { initialProps: { tiles: [tileA] } },
    );

    // Tile set changes to [tileB] BEFORE tileA's rasterization settles.
    rerender({ tiles: [tileB] });
    await waitFor(() => expect(result.current['15/6/6']).toBe('data:image/png;base64,B_15_6_6'));

    // tileA's stale promise settles late — must not appear in the record,
    // which now belongs to the [tileB] tile set.
    aDeferred.resolve('data:image/png;base64,STALE_A');
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current['15/5/5']).toBeUndefined();
    expect(Object.keys(result.current)).toEqual(['15/6/6']);
  });
});
