// Logs service - OpenSearch when available, PostgreSQL otherwise.
import { prisma } from '../../main';
import { LogSeverity, Prisma } from '@prisma/client';
import { createPaginationMeta } from '@cloudops-hub/shared';
import { opensearchClient } from '../../services/opensearch';
import { IngestLogsInput, LogQuery, LogStatsQuery } from './types';

const RANGE_MS: Record<string, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export class LogService {
  async search(params: LogQuery) {
    const startedAt = Date.now() - (RANGE_MS[params.range] ?? RANGE_MS['24h']);

    if (opensearchClient.enabled) {
      const result = await opensearchClient.searchLogs({
        query: params.search,
        severity: params.severity,
        source: params.source,
        resourceId: params.resourceId,
        from: new Date(startedAt).toISOString(),
        page: params.page,
        limit: params.limit,
      });

      if (result) {
        return {
          entries: result.hits.map((hit) => ({
            id: hit.id,
            ...(hit.source as Record<string, unknown>),
          })),
          total: result.total,
          pagination: createPaginationMeta(params, result.total),
          source: 'opensearch' as const,
        };
      }
    }

    const where: Prisma.LogEntryWhereInput = { timestamp: { gte: new Date(startedAt) } };
    if (params.severity) where.severity = params.severity as LogSeverity;
    if (params.source) where.source = params.source;
    if (params.resourceId) where.resourceId = params.resourceId;
    if (params.search) where.message = { contains: params.search, mode: 'insensitive' };

    const [entries, total] = await Promise.all([
      prisma.logEntry.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.logEntry.count({ where }),
    ]);

    return {
      entries,
      total,
      pagination: createPaginationMeta(params, total),
      source: 'postgresql' as const,
    };
  }

  async stats(params: LogStatsQuery) {
    const since = new Date(Date.now() - (RANGE_MS[params.range] ?? RANGE_MS['24h']));
    const where: Prisma.LogEntryWhereInput = { timestamp: { gte: since } };
    if (params.source) where.source = params.source;

    const [total, bySeverity, bySource, recent] = await Promise.all([
      prisma.logEntry.count({ where }),
      prisma.logEntry.groupBy({ by: ['severity'], where, _count: true }),
      prisma.logEntry.groupBy({ by: ['source'], where, _count: { _all: true } }),
      prisma.logEntry.findMany({
        where,
        select: { timestamp: true, severity: true },
        orderBy: { timestamp: 'asc' },
        take: 5000,
      }),
    ]);

    // Bucket into 24 time slices for the volume chart.
    const bucketCount = 24;
    const spanMs = Date.now() - since.getTime();
    const bucketSize = Math.max(1, spanMs / bucketCount);
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({
      timestamp: new Date(since.getTime() + index * bucketSize).toISOString(),
      count: 0,
      errors: 0,
    }));

    for (const entry of recent) {
      const index = Math.min(
        bucketCount - 1,
        Math.floor((entry.timestamp.getTime() - since.getTime()) / bucketSize)
      );
      if (index < 0) continue;
      buckets[index].count += 1;
      if (entry.severity === 'ERROR' || entry.severity === 'FATAL') buckets[index].errors += 1;
    }

    const severityMap = bySeverity.reduce<Record<string, number>>((acc, row) => {
      acc[row.severity] = row._count;
      return acc;
    }, {});

    const errorCount = (severityMap.ERROR ?? 0) + (severityMap.FATAL ?? 0);

    return {
      total,
      range: params.range,
      since: since.toISOString(),
      bySeverity: {
        DEBUG: severityMap.DEBUG ?? 0,
        INFO: severityMap.INFO ?? 0,
        WARN: severityMap.WARN ?? 0,
        ERROR: severityMap.ERROR ?? 0,
        FATAL: severityMap.FATAL ?? 0,
      },
      bySource: (bySource as Array<{ source: string; _count: { _all: number } }>)
        .slice()
        .sort((a, b) => b._count._all - a._count._all)
        .slice(0, 10)
        .map((row) => ({
          source: row.source,
          count: row._count._all,
        })),
      errorRate: total > 0 ? Math.round((errorCount / total) * 10000) / 100 : 0,
      timeline: buckets,
      source: opensearchClient.enabled ? 'opensearch' : 'postgresql',
    };
  }

  async sources(): Promise<string[]> {
    const rows = await prisma.logEntry.findMany({
      distinct: ['source'],
      select: { source: true },
      orderBy: { source: 'asc' },
    });
    return rows.map((row) => row.source);
  }

  async ingest(input: IngestLogsInput) {
    const now = new Date();
    const created = await prisma.logEntry.createMany({
      data: input.entries.map((entry, index) => ({
        timestamp: new Date(now.getTime() - index * 100),
        severity: entry.severity,
        source: entry.source,
        message: entry.message,
        resourceId: entry.resourceId ?? null,
        traceId: entry.traceId ?? null,
        fields: (entry.fields ?? {}) as Prisma.InputJsonValue,
      })),
    });

    if (opensearchClient.enabled) {
      for (const entry of input.entries) {
        await opensearchClient.indexLog({ ...entry, timestamp: now.toISOString() });
      }
    }

    return { ingested: created.count };
  }

  async findById(id: string) {
    const entry = await prisma.logEntry.findUnique({ where: { id } });
    return entry;
  }

  async recent(limit = 20, since?: string) {
    return prisma.logEntry.findMany({
      where: since ? { timestamp: { gt: new Date(since) } } : {},
      orderBy: { timestamp: 'desc' },
      take: Math.min(limit, 200),
    });
  }
}

export const logService = new LogService();
