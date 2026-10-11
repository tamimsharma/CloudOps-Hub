// Metrics service - Prometheus when available, deterministic simulation otherwise.
import { prisma } from '../../main';
import { NotFoundError, ValidationError } from '@cloudops-hub/shared';
import { prometheusClient, PROMQL } from '../../services/prometheus';
import {
  MetricKey,
  MetricPoint,
  METRIC_PROFILES,
  RANGE_POINTS,
  currentMetric,
} from '../../services/metricsSimulator';
import { MultiSeriesQuery, PrometheusQuery, SeriesQuery, SnapshotQuery } from './types';

export interface MetricSeries {
  metric: string;
  unit: string;
  points: MetricPoint[];
  source: 'prometheus' | 'simulated' | 'database';
}

export class MetricsService {
  async getOverview() {
    const [aggregates, requests, errors, latency] = await Promise.all([
      prisma.resource.aggregate({
        where: { status: 'RUNNING' },
        _avg: { cpuUsage: true, memoryUsage: true, diskUsage: true },
        _sum: { networkIn: true, networkOut: true },
        _count: true,
      }),
      prometheusClient.getSeries('requests', { range: '1h' }),
      prometheusClient.getSeries('errors', { range: '1h' }),
      prometheusClient.getSeries('latency', { range: '1h' }),
    ]);

    const last = (series: MetricSeries | { points: MetricPoint[] }) =>
      series.points.length > 0 ? series.points[series.points.length - 1].value : 0;

    const avgCpu = aggregates._avg.cpuUsage ?? currentMetric('cpu');
    const avgMemory = aggregates._avg.memoryUsage ?? currentMetric('memory');
    const avgDisk = aggregates._avg.diskUsage ?? currentMetric('disk');
    const requestRate = last(requests);
    const errorRate = last(errors);
    const p95Latency = last(latency);

    return {
      cpu: { value: Math.round(avgCpu * 10) / 10, unit: 'percent' },
      memory: { value: Math.round(avgMemory * 10) / 10, unit: 'percent' },
      disk: { value: Math.round(avgDisk * 10) / 10, unit: 'percent' },
      networkIn: {
        value: Math.round((aggregates._sum.networkIn ?? currentMetric('network_in')) * 100) / 100,
        unit: 'MB/s',
      },
      networkOut: {
        value: Math.round((aggregates._sum.networkOut ?? currentMetric('network_out')) * 100) / 100,
        unit: 'MB/s',
      },
      requests: { value: Math.round(requestRate), unit: 'req/s' },
      errors: { value: Math.round(errorRate), unit: 'err/min' },
      latency: { value: Math.round(p95Latency), unit: 'ms' },
      resources: aggregates._count,
      uptimeSeconds: Math.round(process.uptime()),
      source: prometheusClient.enabled && requests.source === 'prometheus' ? 'prometheus' : 'simulated',
      updatedAt: new Date().toISOString(),
    };
  }

  async getSeries(params: SeriesQuery): Promise<MetricSeries> {
    const { points, source } = await prometheusClient.getSeries(params.metric, {
      range: params.range,
      resourceId: params.resourceId,
      points: RANGE_POINTS[params.range],
    });

    return {
      metric: params.metric,
      unit: METRIC_PROFILES[params.metric].unit,
      points,
      source,
    };
  }

  async getMultiSeries(params: MultiSeriesQuery): Promise<{ range: string; series: MetricSeries[] }> {
    const keys = params.metrics
      .split(',')
      .map((key) => key.trim())
      .filter((key): key is MetricKey => key in METRIC_PROFILES);

    if (keys.length === 0) {
      throw new ValidationError('No valid metrics requested', {
        available: Object.keys(METRIC_PROFILES),
      });
    }

    const series = await Promise.all(
      keys.map((metric) =>
        this.getSeries({ metric, range: params.range, resourceId: params.resourceId })
      )
    );

    return { range: params.range, series };
  }

  async getResourceMetrics(
    resourceId: string,
    range: SeriesQuery['range'] = '1h'
  ): Promise<Record<string, MetricSeries>> {
    const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resource) throw new NotFoundError('Resource', resourceId);

    const metrics: MetricKey[] = ['cpu', 'memory', 'disk', 'network_in', 'network_out'];
    const series = await Promise.all(
      metrics.map((metric) => this.getSeries({ metric, range, resourceId }))
    );

    return Object.fromEntries(series.map((entry) => [entry.metric, entry]));
  }

  async getTargets() {
    const targets = await prometheusClient.targets();
    if (targets && targets.length > 0) {
      return { source: 'prometheus', targets };
    }

    const now = new Date().toISOString();
    return {
      source: 'simulated',
      targets: [
        { scrapePool: 'api', scrapeUrl: 'http://api:4000/metrics', health: 'up', lastScrape: now, lastError: '' },
        { scrapePool: 'web', scrapeUrl: 'http://web:5173/metrics', health: 'up', lastScrape: now, lastError: '' },
        { scrapePool: 'node', scrapeUrl: 'http://node-exporter:9100/metrics', health: 'up', lastScrape: now, lastError: '' },
        { scrapePool: 'cadvisor', scrapeUrl: 'http://cadvisor:8080/metrics', health: 'up', lastScrape: now, lastError: '' },
        { scrapePool: 'postgres', scrapeUrl: 'http://postgres-exporter:9187/metrics', health: 'up', lastScrape: now, lastError: '' },
        { scrapePool: 'redis', scrapeUrl: 'http://redis-exporter:9121/metrics', health: 'down', lastScrape: now, lastError: 'connection refused' },
      ],
    };
  }

  async query(params: PrometheusQuery) {
    const series = await prometheusClient.queryRange(params.query, params.range, params.step);
    if (series) {
      return { source: 'prometheus' as const, query: params.query, result: series };
    }

    if (!(params.query in PROMQL)) {
      throw new ValidationError('Prometheus is unavailable and the query is not a supported metric', {
        supported: Object.keys(PROMQL),
      });
    }

    const fallback = await this.getSeries({
      metric: params.query as MetricKey,
      range: params.range,
    });
    return { source: 'simulated' as const, query: params.query, result: fallback };
  }

  async getSnapshots(params: SnapshotQuery) {
    const where: Record<string, unknown> = {};
    if (params.resourceId) where.resourceId = params.resourceId;
    if (params.metricType) where.metricType = params.metricType;

    const [snapshots, total] = await Promise.all([
      prisma.metricSnapshot.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.metricSnapshot.count({ where }),
    ]);

    return { snapshots, total };
  }
}

export const metricsService = new MetricsService();
