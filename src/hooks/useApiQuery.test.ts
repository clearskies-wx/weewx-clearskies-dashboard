// useApiQuery.test.ts — A4 (EYEBALL-FIX-PLAN-2026-08-04 Round A, S-SPEC-4).
//
// Client resilience guard: on a fetch error, useApiQuery must schedule a
// retry with exponential backoff (5s -> 10s -> 20s -> 40s -> cap 60s) and
// recover WITHOUT the caller doing anything -- no manual refetch(), no page
// reload. Mechanism M1 (EYEBALL-FIX-PLAN §0): before S-SPEC-4, a failed
// fetch armed no further timer at all -- the component stayed in its error
// state until something external (e.g. a reload) triggered a new mount or
// manual refetch. These guards assert the OBSERVABLE behavior (fetch call
// count as fake time advances, and the returned data/error state) -- not
// the retryDelayRef/retryTimerRef internals.
//
// useIsIdle() is mocked because useApiQuery calls it unconditionally
// (poll-interval idle-awareness, ADR-075) and it throws outside an
// IdleDetectorProvider -- idle behavior is not under test here (same
// pattern as useImageryConfig.test.ts).
//
// Module-level cache note (useApiQuery.ts `getCacheKey`): the cache key is
// derived from `fetcher.toString() + JSON.stringify(deps)`. Every test here
// passes a distinct `deps` value so no test's cached/in-flight request can
// leak into another's assertions, regardless of what a vi.fn() wrapper
// stringifies to.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApiQuery } from './useApiQuery';

vi.mock('./useIdleDetector', () => ({
  useIsIdle: () => false,
}));

describe('useApiQuery — error-retry backoff (A4, S-SPEC-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('retries a failed fetch automatically at the ~5s floor and recovers data WITHOUT any manual refetch or reload', async () => {
    let callCount = 0;
    const fetcher = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.reject(new Error('transient 503'));
      }
      return Promise.resolve({ recovered: true, call: callCount });
    });

    const { result } = renderHook(() =>
      useApiQuery(fetcher, { deps: ['a4-recovers-without-manual-refetch'] }),
    );

    // Initial mount fetch fails.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toBeNull();

    // Nothing has retried yet just short of 5s -- proves the retry is
    // scheduled at the 5s floor, not fired immediately.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Crossing the 5s mark fires the retry with no call to result.current.refetch().
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    // The retry's promise (already resolved) settles into state.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data).toEqual({ recovered: true, call: 2 });
    expect(result.current.error).toBeNull();
  });

  it('backs off exponentially on consecutive failures (5s -> 10s -> 20s -> 40s) and a success resets the delay so the next failure retries at 5s again', async () => {
    let callCount = 0;
    const fetcher = vi.fn(() => {
      callCount += 1;
      // Calls 1-4 fail (observes the 5/10/20/40s backoff sequence between
      // them); call 5 succeeds; call 6 (triggered manually below, AFTER the
      // success, to isolate the reset) fails again to prove the delay was
      // reset to the floor rather than continuing from the 60s cap.
      if (callCount <= 4 || callCount === 6) {
        return Promise.reject(new Error(`failure #${callCount}`));
      }
      return Promise.resolve({ call: callCount });
    });

    const { result } = renderHook(() =>
      useApiQuery(fetcher, { deps: ['a4-backoff-then-reset'] }),
    );

    // Call 1 fails on mount.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Retry #1 fires at +5s -> call 2 fails.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Retry #2 fires at +10s (not +5s again) -> call 3 fails.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);

    // Retry #3 fires at +20s -> call 4 fails.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(19999);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledTimes(4);

    // Retry #4 fires at +40s -> call 5 SUCCEEDS.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(39999);
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledTimes(5);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data).toEqual({ call: 5 });
    expect(result.current.error).toBeNull();

    // Manually trigger one more failure (call 6) to observe what delay the
    // NEXT retry after a success uses. If the backoff had not reset, the
    // previous cap (60s) would still apply; the reset behavior under test
    // means this retry fires at the 5s floor again.
    await act(async () => {
      result.current.refetch();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(fetcher).toHaveBeenCalledTimes(6);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledTimes(7);
  });
});
