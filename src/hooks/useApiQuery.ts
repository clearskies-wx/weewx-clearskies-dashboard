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
//
// Module-level cache + single-flight dedup (Phase 5 T5.1):
//   - `queryCache` is a plain Map that lives outside React state, so it
//     survives component unmount/remount (e.g. navigating away from Now and
//     back, or the /radar route unmounting the whole app shell). A fresh
//     mount reads the cache synchronously (lazy useState initializer) so the
//     visitor sees last-known data immediately instead of a loading
//     skeleton — see DASHBOARD-MANUAL §5 "Stale-while-revalidate and CLS".
//   - `pendingRequests` de-duplicates concurrent identical requests (e.g.
//     useStation() mounted from 6+ components on first Now-page load all
//     firing at once) into a single underlying fetch, ref-counted so an
//     early unmount from one of several simultaneous callers does not abort
//     the fetch for the others still waiting on it.
//   - Every effect run still kicks off (or joins) a fetch regardless of
//     whether the cache hit was within its freshness TTL — this is the
//     "always revalidate" half of stale-while-revalidate, and it is also
//     what satisfies "never return expired data without a refetch in
//     flight": there is never a code path that serves a cache hit without
//     also starting a fetch in the same effect run.

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

// ---------------------------------------------------------------------------
// Module-level cache — NOT React state. Persists across mount/unmount so a
// remounted component (route change, /radar unmounting AppLayout, etc.) can
// serve last-known data synchronously instead of showing a skeleton.
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: unknown;
  timestamp: number;
  freshness: FreshnessMeta | null;
}

const queryCache = new Map<string, CacheEntry>();

/** A request currently in flight, shared by every hook instance requesting the same key. */
interface PendingRequest {
  promise: Promise<unknown>;
  controller: AbortController;
  /** Number of mounted hook instances currently awaiting this request. */
  subscribers: number;
}

const pendingRequests = new Map<string, PendingRequest>();

/**
 * Derives a stable cache key for a given call site.
 *
 * Callers pass an inline fetcher closure (e.g. `(signal) => getStation(signal)`)
 * rather than an explicit endpoint string. The closure's source text is stable
 * across renders and uniquely identifies which endpoint function is being
 * called (different endpoints call different named functions, so their source
 * text differs); `deps` distinguishes parameterized calls to the *same*
 * endpoint (e.g. useArchive with different date ranges). Combining both gives
 * a key that is unique per distinct request and shared across every call site
 * that requests the same data — which is exactly what enables cross-component
 * cache sharing and single-flight dedup.
 */
function getCacheKey(fetcher: (signal: AbortSignal) => Promise<unknown>, deps: unknown[]): string {
  return `${fetcher.toString()}::${JSON.stringify(deps)}`;
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

  // Lazy initializers run exactly once (React contract for useState), so the
  // cache lookup below happens only on mount, not on every render.
  const [data, setData] = useState<T | null>(() => {
    if (skip) return null;
    const cached = queryCache.get(getCacheKey(fetcher, deps));
    return cached ? (cached.data as T) : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (skip) return false;
    return !queryCache.has(getCacheKey(fetcher, deps));
  });
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [freshness, setFreshness] = useState<FreshnessMeta | undefined>(() => {
    if (skip) return undefined;
    return queryCache.get(getCacheKey(fetcher, deps))?.freshness ?? undefined;
  });
  // Increment to trigger a manual refetch without changing deps.
  const [refetchCounter, setRefetchCounter] = useState(0);

  // Track whether we have received data at least once, so refetches
  // keep showing stale data instead of flashing a skeleton.
  const hasDataRef = useRef(false);
  // One-time cache-based initialization, guarded so it only runs until it
  // succeeds once (mirrors the lazy useState pattern above, but useRef's
  // initial-value argument re-evaluates every render, so we guard manually).
  if (!hasDataRef.current && !skip && queryCache.has(getCacheKey(fetcher, deps))) {
    hasDataRef.current = true;
  }

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

    const key = getCacheKey(fetcherRef.current, deps);
    let cancelled = false;

    // Serve a cache hit immediately (stale-while-revalidate) regardless of
    // whether it is still within its freshness TTL — a background
    // fetch/join always follows below, so expired data is never returned
    // without a refetch already in flight.
    const cached = queryCache.get(key);
    if (cached) {
      hasDataRef.current = true;
      setData(cached.data as T);
      setFreshness(cached.freshness ?? undefined);
      setLoading(false);
      setRefreshing(true);
    } else if (hasDataRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    // Single-flight dedup: join an in-flight request for the same key
    // instead of firing a duplicate network call. Ref-counted so the shared
    // AbortController only aborts once every subscriber has unmounted.
    let pending = pendingRequests.get(key);
    if (!pending) {
      const controller = new AbortController();
      const promise = fetcherRef.current(controller.signal);
      pending = { promise, controller, subscribers: 0 };
      pendingRequests.set(key, pending);
    }
    pending.subscribers += 1;
    const myPending = pending;

    myPending.promise
      .then((result) => {
        if (cancelled) return;
        hasDataRef.current = true;
        setData(result as T);
        setLoading(false);
        setRefreshing(false);

        // Freshness-driven refetch scheduling (ADR-075).
        // Use duck typing — T may or may not carry a freshness block.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const maybeFreshness = (result as any)?.freshness;
        let freshnessMeta: FreshnessMeta | null = null;
        if (
          maybeFreshness &&
          typeof maybeFreshness.validUntil === 'string' &&
          typeof maybeFreshness.generatedAt === 'string' &&
          typeof maybeFreshness.refreshInterval === 'number'
        ) {
          freshnessMeta = {
            generatedAt: maybeFreshness.generatedAt,
            validUntil: maybeFreshness.validUntil,
            refreshInterval: maybeFreshness.refreshInterval,
          };
          setFreshness(freshnessMeta);

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

        queryCache.set(key, { data: result, timestamp: Date.now(), freshness: freshnessMeta });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        setRefreshing(false);
      })
      .finally(() => {
        // Once settled, this key is no longer "in flight" — a later mount
        // should read the (now-populated, or still-empty on error) cache
        // rather than join a promise that has already resolved.
        if (pendingRequests.get(key) === myPending) {
          pendingRequests.delete(key);
        }
      });

    return () => {
      cancelled = true;
      myPending.subscribers -= 1;
      if (myPending.subscribers <= 0 && pendingRequests.get(key) === myPending) {
        myPending.controller.abort();
        pendingRequests.delete(key);
      }
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
