// OpenSearch/Elasticsearch client with graceful fallback to PostgreSQL.
import { getConfig } from '@cloudops-hub/config';

const config = getConfig();

export interface SearchHit {
  id: string;
  index: string;
  score?: number;
  source: Record<string, unknown>;
}

export interface SearchResponse {
  total: number;
  hits: SearchHit[];
  aggregations?: Record<string, unknown>;
}

class OpenSearchClient {
  private readonly baseUrl: string | null;
  private readonly authHeader: string | null;

  constructor() {
    this.baseUrl = config.enableOpensearchIntegration && config.opensearchUrl
      ? config.opensearchUrl.replace(/\/$/, '')
      : null;
    this.authHeader = config.opensearchUsername && config.opensearchPassword
      ? `Basic ${Buffer.from(`${config.opensearchUsername}:${config.opensearchPassword}`).toString('base64')}`
      : null;
  }

  get enabled(): boolean {
    return this.baseUrl !== null;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authHeader) headers.Authorization = this.authHeader;
    return headers;
  }

  private async request<T>(path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers as Record<string, string> | undefined) },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Full text + filter search over the log index. */
  async searchLogs(params: {
    query?: string;
    severity?: string;
    source?: string;
    resourceId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<SearchResponse | null> {
    const must: Record<string, unknown>[] = [];
    const filter: Record<string, unknown>[] = [];

    if (params.query) {
      must.push({
        simple_query_string: {
          query: params.query,
          fields: ['message', 'source', 'fields.*'],
          default_operator: 'and',
        },
      });
    }
    if (params.severity) filter.push({ term: { severity: params.severity } });
    if (params.source) filter.push({ term: { source: params.source } });
    if (params.resourceId) filter.push({ term: { resourceId: params.resourceId } });
    if (params.from || params.to) {
      const range: Record<string, string> = {};
      if (params.from) range.gte = params.from;
      if (params.to) range.lte = params.to;
      filter.push({ range: { timestamp: range } });
    }

    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const body = {
      from: (page - 1) * limit,
      size: limit,
      sort: [{ timestamp: { order: 'desc' } }],
      query: {
        bool: {
          must: must.length ? must : [{ match_all: {} }],
          filter,
        },
      },
      aggs: {
        by_severity: { terms: { field: 'severity', size: 10 } },
        by_source: { terms: { field: 'source', size: 20 } },
        over_time: {
          date_histogram: {
            field: 'timestamp',
            fixed_interval: '1h',
            min_doc_count: 0,
          },
        },
      },
    };

    const data = await this.request<{
      hits: { total: { value: number }; hits: Array<{ _id: string; _score: number; _source: Record<string, unknown> }> };
      aggregations?: Record<string, unknown>;
    }>('cloudops-logs/_search', { method: 'POST', body: JSON.stringify(body) });

    if (!data) return null;

    return {
      total: data.hits.total?.value ?? 0,
      hits: data.hits.hits.map((hit) => ({
        id: hit._id,
        index: 'cloudops-logs',
        score: hit._score,
        source: hit._source,
      })),
      aggregations: data.aggregations,
    };
  }

  async indexLog(entry: Record<string, unknown>): Promise<boolean> {
    const result = await this.request('cloudops-logs/_doc', {
      method: 'PUT',
      body: JSON.stringify(entry),
    });
    return result !== null;
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; status?: string }> {
    const started = Date.now();
    const data = await this.request<{ status: { cluster_name?: string; status?: string } }>(
      '_cluster/health'
    );
    return {
      ok: data !== null,
      latencyMs: Date.now() - started,
      status: data?.status?.status,
    };
  }
}

export const opensearchClient = new OpenSearchClient();
