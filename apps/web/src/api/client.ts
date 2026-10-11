// Shared API client for CloudOps Hub.
// Handles the response envelope, bearer tokens and automatic refresh on 401.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: Pagination;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string; details?: unknown };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const ACCESS_TOKEN_KEY = 'cloudops.accessToken';
const REFRESH_TOKEN_KEY = 'cloudops.refreshToken';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(accessToken: string, refreshToken?: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  signal?: AbortSignal;
  raw?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const json = (await response.json()) as ApiEnvelope<{ accessToken: string; refreshToken: string }>;
    if (!json.success) return false;
    tokenStore.set(json.data.accessToken, json.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, signal, raw } = options;

  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && tokenStore.access) headers.Authorization = `Bearer ${tokenStore.access}`;

  const doFetch = () =>
    fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });

  let response = await doFetch();

  // Refresh the access token once on 401, then retry.
  if (response.status === 401 && auth && tokenStore.refresh) {
    if (!refreshPromise) refreshPromise = tryRefresh().finally(() => (refreshPromise = null));
    const refreshed = await refreshPromise;
    if (refreshed) {
      headers.Authorization = `Bearer ${tokenStore.access}`;
      response = await doFetch();
    }
  }

  if (raw) {
    if (!response.ok) throw new ApiError(await response.text(), response.status, 'RAW_ERROR');
    return (await response.text()) as unknown as T;
  }

  let json: ApiEnvelope<T>;
  try {
    json = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError('Invalid response from server', response.status, 'PARSE_ERROR');
  }

  if (!response.ok || !json.success) {
    const error = json.error;
    if (response.status === 401 && auth) tokenStore.clear();
    throw new ApiError(
      error?.message ?? 'Request failed',
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.details
    );
  }

  return json.data;
}

/** Returns list endpoints regardless of whether they wrap rows in `data`. */
export async function requestList<T>(
  path: string,
  options: RequestOptions = {}
): Promise<{ rows: T[]; pagination?: Pagination; meta?: Record<string, unknown> }> {
  const { method = 'GET', query, auth = true, signal } = options;

  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
  }

  const headers: Record<string, string> = {};
  if (auth && tokenStore.access) headers.Authorization = `Bearer ${tokenStore.access}`;

  const response = await fetch(url.toString(), { method, headers, signal });
  const json = (await response.json()) as ApiEnvelope<T[]>;

  if (!response.ok || !json.success) {
    throw new ApiError(json.error?.message ?? 'Request failed', response.status, json.error?.code ?? 'UNKNOWN');
  }

  return { rows: json.data ?? [], pagination: json.pagination, meta: json.meta };
}
