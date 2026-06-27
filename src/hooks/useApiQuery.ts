// useApiQuery.ts — Generic React hook for data fetching.
// Uses useState + useEffect with AbortController. No external libraries.
//
// Freshness-driven auto-refetch (ADR-075):
//   - When the fetcher returns data with a `freshness.validUntil` field, a
//     background refetch is scheduled at that time (freshness timer).
//   - When `pollInterval` is provided, a proactive poll runs every
//     `pollInterval` seconds. While idle (useIsIdle()), the interval is
//     multiplied by `idleRefreshFactor` (default 10). Returning from idle
//     restarts the interval at the normal rate immediately.
//   - Both timers are complementary. All timers are cleaned up on unmount.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useIsIdle } from './useIdleDetector';

interface UseApiQueryOptions {
  /** If true, the fetch is skipped (data stays null, loading stays false). */
  skip?: boolean;
  /**
   * Additional dependency values that trigger a refetch when they change.
   * Compared by reference / value, so pass primitives or stable objects.
   */
  deps?: unknown[];
  /** Seconds between proactive poll requests. Comes from freshness.refreshInterval or StationMetadata. */
  pollInterval?: number;
  /**
   * Multiplier applied to pollInterval when the user is idle.
   * Comes from StationMetadata.idleRefreshFactor. Default: 10.
   */
  idleRefreshFactor?: number;
}

/** Freshness metadata from the last successful response, if present. */
interface FreshnessMeta {
  generatedAt: string;
  validUntil: string;
  refreshInterval: number;
}

interface UseApiQueryResult<T> {
  data: T | null;
  /** True only on the initial fetch (no prior data). False during background refetches. */
  loading: boolean;
  /** True during any in-flight request, including background refetches. */
  refreshing: boolean;
  error: Error | null;
  refetch: () => void;
  /** Freshness metadata from the last successful response, if present. */
  freshness?: FreshnessMeta;
}

/**
 * Generic data-fetching hook.
 *
 * @param fetcher  A function that accepts an AbortSignal and returns a Promise<T>.
 *                 Re-evaluated on mount, on `deps` change, and on manual refetch().
 * @param options  skip, deps, pollInterval, idleRefreshFactor
 */
export function useApiQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: UseApiQueryOptions,
): UseApiQueryResult<T> {
  const {
    skip = false,
    deps = [],
    pollInterval,
    idleRefreshFactor = 10,
  } = options ?? {};

  const isIdle = useIsIdle();

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!skip);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [freshness, setFreshness] = useState<FreshnessMeta | undefined>(undefined);
  // Increment to trigger a manual refetch without changing deps.
  const [refetchCounter, setRefetchCounter] = useState(0);

  // Track whether we have received data at least once, so refetches
  // keep showing stale data instead of flashing a skeleton.
  const hasDataRef = useRef(false);

  // Keep a stable ref to fetcher so the effect can always call the latest version
  // without adding it as a dep (callers typically pass inline functions).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Timer ref for the freshness-based refetch (setTimeout).
  const freshnessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refetch callback — increments the counter to trigger the fetch effect.
  const refetch = useCallback(() => {
    setRefetchCounter((c) => c + 1);
  }, []);

  // Stable ref for refetch so timer callbacks always call the latest version
  // without capturing a stale closure.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // ---------------------------------------------------------------------------
  // Main fetch effect
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (skip) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const controller = new AbortController();
    if (hasDataRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          hasDataRef.current = true;
          setData(result);
          setLoading(false);
          setRefreshing(false);

          // Freshness-driven refetch scheduling (ADR-075).
          // Use duck typing — T may or may not carry a freshness block.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const maybeFreshness = (result as any)?.freshness;
          if (
            maybeFreshness &&
            typeof maybeFreshness.validUntil === 'string' &&
            typeof maybeFreshness.generatedAt === 'string' &&
            typeof maybeFreshness.refreshInterval === 'number'
          ) {
            const meta: FreshnessMeta = {
              generatedAt: maybeFreshness.generatedAt,
              validUntil: maybeFreshness.validUntil,
              refreshInterval: maybeFreshness.refreshInterval,
            };
            setFreshness(meta);

            // Clear any previous freshness timer before scheduling a new one.
            if (freshnessTimerRef.current !== null) {
              clearTimeout(freshnessTimerRef.current);
            }
            const validUntilMs = new Date(maybeFreshness.validUntil).getTime();
            const delayMs = Math.max(0, validUntilMs - Date.now());
            freshnessTimerRef.current = setTimeout(() => {
              freshnessTimerRef.current = null;
              refetchRef.current();
            }, delayMs);
          }
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      controller.abort();
      // Clear the freshness timer when the effect re-runs (new fetch supersedes it).
      if (freshnessTimerRef.current !== null) {
        clearTimeout(freshnessTimerRef.current);
        freshnessTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, refetchCounter, ...deps]);

  // ---------------------------------------------------------------------------
  // Proactive poll effect (idle-aware)
  // ---------------------------------------------------------------------------
  // Runs whenever pollInterval, idleRefreshFactor, or isIdle changes.
  // When idle, the interval is stretched by idleRefreshFactor.
  // Returning from idle restarts the interval at the normal rate immediately.
  useEffect(() => {
    if (!pollInterval || pollInterval <= 0 || skip) {
      return;
    }

    const effectiveInterval = isIdle
      ? pollInterval * idleRefreshFactor * 1000
      : pollInterval * 1000;

    const id = setInterval(() => {
      refetchRef.current();
    }, effectiveInterval);

    return () => {
      clearInterval(id);
    };
  }, [pollInterval, idleRefreshFactor, isIdle, skip]);

  return { data, loading, refreshing, error, refetch, freshness };
}
