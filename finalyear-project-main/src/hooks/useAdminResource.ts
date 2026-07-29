/**
 * Loader for admin screens.
 *
 * Every screen under `app/(admin)/` reads from a `/api/admin/**` endpoint
 * and needs the same four things: the data, whether a request is in
 * flight, the last error, and a way to re-fetch. Putting that here means
 * "pull to refresh re-reads the backend" is implemented once rather than
 * per screen.
 *
 * The fetcher is called on mount and on every `reload()`. Results are
 * never cached across mounts — an admin opening a screen always sees the
 * current database state, not a snapshot from an earlier visit.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface AdminResource<T> {
  data: T | null;
  loading: boolean;
  /** Message from the last failed fetch, or null. */
  error: string | null;
  /** Re-runs the fetcher. Safe to call from a refresh control. */
  reload: () => Promise<void>;
  /** True while a `reload()` refreshes data that's already on screen. */
  refreshing: boolean;
}

/**
 * @param fetcher called on mount and on each reload
 * @param deps    re-runs the fetcher when these change (filter values, etc.)
 */
export function useAdminResource<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
): AdminResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keeps the latest fetcher without making it a dependency of `run` —
  // screens pass an inline arrow, which would otherwise change identity
  // on every render and re-fetch forever.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Guards against a setState after unmount, and against an in-flight
  // response from a stale filter overwriting a newer one.
  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (isRefresh: boolean) => {
    const id = ++requestId.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const result = await fetcherRef.current();
      if (!mounted.current || id !== requestId.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (!mounted.current || id !== requestId.current) return;
      setError((err as Error)?.message ?? "Couldn't load data from the server.");
    } finally {
      if (mounted.current && id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const reload = useCallback(() => run(true), [run]);

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, refreshing };
}
