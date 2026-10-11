// Prometheus HTTP API client with graceful fallback.
// When ENABLE_PROMETHEUS_INTEGRATION is off or Prometheus is unreachable the
// callers fall back to the deterministic simulator, so the UI always has data.
import { getConfig } from '@cloudops-hub/config';
import { generateSeries, MetricKey, MetricPoint, RANGE_MS } from './metricsSimulator';

const config = getConfig();

export interface PrometheusSeries {
  metric: Record<string, string>;
  values: [number, string][];
}

export interface PrometheusTarget {
  scrapePool: string;
  scrapeUrl: string;
  health: 'up' | 'down' | string;
  lastScrape: string;
  lastError: string;
}

interface RangeQueryResponse {
  status: string;
  data: {
    resultType: string;
    result: Array<{ metric: Record<string, string>; values: [number, string][] }>;
  };
}

interface InstantQueryResponse {
  status: string;
  data: {
    resultType: string;
    result: Array<{ metric: Record<string, string>; value: [number, string, string?] }>;
  };
}

/** Maps platform metric keys to PromQL expressions. */
export const PROMQL: Record<MetricKey, string> = {
  cpu: '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
  memory: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
  disk: '(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100',
  network_in: 'rate(node_network_receive_bytes_total[5m]) / 1024 / 1024',
  network_out: 'rate(node_network_transmit_bytes_total[5m]) / 1024 / 1024',
  requests: 'rate(http_requests_total[5m])',
  errors: 'rate(http_requests_total{status=~"5.."}[5m]) * 60',
  latency: 'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m]))) * 1000',
};

class PrometheusClient {
  private readonly baseUrl: string | null;

  constructor() {
    this.baseUrl = config.enablePrometheusIntegration && config.prometheusUrl
      ? config.prometheusUrl.replace(/\/$/, '')
      : null;
  }

  get enabled(): boolean {
    return this.baseUrl !== null;
  }

  private async fetchJson<T>(path: string, timeoutMs = 4000): Promise<T | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { signal: controller.signal });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Range query; returns null when Prometheus is unavailable. */
  async queryRange(query: string, range: string, step = '60s'): Promise<PrometheusSeries[] | null> {
    const duration = RANGE_MS[range] ?? RANGE_MS['1h'];
    const end = Math.floor(Date.now() / 1000);
    const start = Math.floor((Date.now() - duration) / 1000);
    const path = `/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${encodeURIComponent(step)}`;
    const data = await this.fetchJson<RangeQueryResponse>(path);
    if (!data || data.status !== 'success') return null;

    return data.data.result.map((series) => ({
      metric: series.metric,
      values: series.values.map(([ts, value]) => [ts, value] as [number, string]),
    }));
  }

  /** Instant query; returns null when Prometheus is unavailable. */
  async queryInstant(query: string): Promise<number | null> {
    const path = `/api/v1/query?query=${encodeURIComponent(query)}`;
    const data = await this.fetchJson<InstantQueryResponse>(path);
    if (!data || data.status !== 'success' || data.data.result.length === 0) return null;
    const value = data.data.result[0].value?.[1];
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async targets(): Promise<PrometheusTarget[] | null> {
    const data = await this.fetchJson<{ data: { activeTargets: PrometheusTarget[] } }>(
      '/api/v1/targets'
    );
    return data?.data?.activeTargets ?? null;
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; version?: string }> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      if (!this.baseUrl) return { ok: false, latencyMs: 0 };
      const response = await fetch(`${this.baseUrl}/-/healthy`, { signal: controller.signal });
      return { ok: response.ok, latencyMs: Date.now() - started };
    } catch {
      return { ok: false, latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Returns a series for a metric key: Prometheus data when available,
   * simulated data otherwise. `source` tells the UI which one was used.
   */
  async getSeries(
    metric: MetricKey,
    options: { range: string; resourceId?: string; points?: number } = { range: '1h' }
  ): Promise<{ points: MetricPoint[]; source: 'prometheus' | 'simulated' }> {
    const series = await this.queryRange(PROMQL[metric], options.range);
    if (series && series.length > 0) {
      // Aggregate all instances into a single series (mean per timestamp).
      const buckets = new Map<number, number[]>();
      for (const s of series) {
        for (const [ts, raw] of s.values) {
          const value = Number(raw);
          if (!Number.isFinite(value)) continue;
          const key = ts * 1000;
          const list = buckets.get(key) ?? [];
          list.push(value);
          buckets.set(key, list);
        }
      }
      const points: MetricPoint[] = [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([timestamp, values]) => ({
          timestamp,
          value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
        }));

      if (points.length > 0) return { points, source: 'prometheus' };
    }

    const duration = RANGE_MS[options.range] ?? RANGE_MS['1h'];
    const to = Date.now();
    return {
      points: generateSeries({
        metric,
        resourceId: options.resourceId,
        from: to - duration,
        to,
        points: options.points,
      }),
      source: 'simulated',
    };
  }
}

export const prometheusClient = new PrometheusClient();
