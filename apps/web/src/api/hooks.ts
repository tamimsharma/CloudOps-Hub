// Small data-fetching helpers: `useQuery` for GETs, `useList` for paginated
// collections, and `useMutation` for actions.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, Pagination, request, requestList } from './client';

function toQueryString(query: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (updater: T | ((previous: T | undefined) => T)) => void;
}

/**
 * Fetches `path` whenever it changes. `enabled: false` keeps the hook idle
 * (used by tabs that should not fetch until opened).
 */
export function useQuery<T>(
  path: string | null,
  options: { enabled?: boolean; intervalMs?: number; deps?: unknown[] } = {}
): QueryState<T> {
  const { enabled = true, intervalMs, deps = [] } = options;
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(Boolean(path) && enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path || !enabled) return;
    const controller = new AbortController();

    setLoading(true);
    request<T>(path, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setDataState(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof ApiError ? cause.message : 'Request failed');
      })
      .finally(() => {
        if (!controller.signal.aborted && active.current) setLoading(false);
      });

    return () => controller.abort();
    // `...deps` is intentional: callers can pin extra refetch triggers.
  }, [path, enabled, nonce, ...deps]);

  useEffect(() => {
    if (!intervalMs || !path || !enabled) return;
    const timer = setInterval(() => setNonce((value) => value + 1), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, path, enabled]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const setData = useCallback((updater: T | ((previous: T | undefined) => T)) => {
    setDataState((previous) =>
      typeof updater === 'function' ? (updater as (value: T | undefined) => T)(previous) : updater
    );
  }, []);

  return { data, loading, error, reload, setData };
}

export interface ListState<T> extends QueryState<T[]> {
  pagination: Pagination | undefined;
  meta: Record<string, unknown> | undefined;
  page: number;
  setPage: (page: number) => void;
}

/** Paginated list endpoint; page resets automatically whenever filters change. */
export function useList<T>(
  path: string | null,
  query: Record<string, string | number | boolean | undefined | null> = {},
  options: { enabled?: boolean; intervalMs?: number } = {}
): ListState<T> {
  const [page, setPageState] = useState(1);
  // Serialised once so a fresh `query` object literal per render cannot refetch.
  const filterKey = useMemo(() => toQueryString(query), [JSON.stringify(query)]);
  const queryString = `${filterKey}${filterKey ? '&' : ''}page=${page}`;
  const fullPath = path ? `${path}?${queryString}` : null;

  const [rows, setRowsState] = useState<T[] | undefined>(undefined);
  const [pagination, setPagination] = useState<Pagination | undefined>(undefined);
  const [meta, setMeta] = useState<Record<string, unknown> | undefined>(undefined);
  const [loading, setLoading] = useState(Boolean(fullPath) && options.enabled !== false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  // Any filter change invalidates the current page number.
  const previousFilters = useRef(filterKey);
  useEffect(() => {
    if (previousFilters.current !== filterKey) {
      previousFilters.current = filterKey;
      setPageState(1);
    }
  }, [filterKey]);

  useEffect(() => {
    if (!fullPath || options.enabled === false) return;
    const controller = new AbortController();

    setLoading(true);
    requestList<T>(fullPath, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRowsState(result.rows);
        setPagination(result.pagination);
        setMeta(result.meta);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof ApiError ? cause.message : 'Request failed');
      })
      .finally(() => {
        if (!controller.signal.aborted && active.current) setLoading(false);
      });

    return () => controller.abort();
    // Query string already encodes every filter, so page/nonce drive refetches.
  }, [fullPath, options.enabled, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const setData = useCallback((updater: T[] | ((previous: T[] | undefined) => T[])) => {
    setRowsState((previous) =>
      typeof updater === 'function' ? (updater as (value: T[] | undefined) => T[])(previous) : updater
    );
  }, []);

  const setPage = useCallback((next: number) => setPageState(Math.max(1, next)), []);

  return { data: rows, loading, error, reload, setData, pagination, meta, page, setPage };
}

export interface MutationState {
  running: boolean;
  error: string | null;
  clearError: () => void;
  run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
}

/** Wraps a mutating API call with running/error state and a friendly message. */
export function useMutation(onSettled?: () => void): MutationState {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(onSettled);
  settled.current = onSettled;

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setRunning(true);
    setError(null);
    try {
      const result = await action();
      settled.current?.();
      return result;
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Request failed');
      return undefined;
    } finally {
      setRunning(false);
    }
  }, []);

  return { running, error, clearError: () => setError(null), run };
}
