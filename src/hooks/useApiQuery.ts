// useApiQuery.ts — Generic React hook for data fetching.
// Uses useState + useEffect with AbortController. No external libraries.

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiQueryOptions {
  /** If true, the fetch is skipped (data stays null, loading stays false). */
  skip?: boolean;
  /**
   * Additional dependency values that trigger a refetch when they change.
   * Compared by reference / value, so pass primitives or stable objects.
   */
  deps?: unknown[];
}

interface UseApiQueryResult<T> {
  data: T | null;
  /** True only on the initial fetch (no prior data). False during background refetches. */
  loading: boolean;
  /** True during any in-flight request, including background refetches. */
  refreshing: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Generic data-fetching hook.
 *
 * @param fetcher  A function that accepts an AbortSignal and returns a Promise<T>.
 *                 Re-evaluated on mount, on `deps` change, and on manual refetch().
 * @param options  skip, deps
 */
export function useApiQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: UseApiQueryOptions,
): UseApiQueryResult<T> {
  const { skip = false, deps = [] } = options ?? {};

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!skip);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  // Increment to trigger a manual refetch without changing deps.
  const [refetchCounter, setRefetchCounter] = useState(0);

  // Track whether we have received data at least once, so refetches
  // keep showing stale data instead of flashing a skeleton.
  const hasDataRef = useRef(false);

  // Keep a stable ref to fetcher so the effect can always call the latest version
  // without adding it as a dep (callers typically pass inline functions).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, refetchCounter, ...deps]);

  const refetch = useCallback(() => {
    setRefetchCounter((c) => c + 1);
  }, []);

  return { data, loading, refreshing, error, refetch };
}
