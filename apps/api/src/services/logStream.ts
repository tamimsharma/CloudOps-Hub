// Live log tail: keeps appending fresh log entries so the log explorer always
// has new data to show. Writes go to PostgreSQL and, when enabled, OpenSearch.
import { prisma } from '../main';
import { Prisma } from '@prisma/client';
import { generateLogBatch } from './demoData';
import { opensearchClient } from './opensearch';

export async function emitLogBatch(count = 3): Promise<number> {
  const entries = generateLogBatch(count);

  const created = await prisma.logEntry.createMany({
    data: entries.map((entry) => ({
      timestamp: entry.timestamp,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      fields: entry.fields as Prisma.InputJsonValue,
      traceId: entry.traceId ?? null,
    })),
  });

  if (opensearchClient.enabled) {
    for (const entry of entries) {
      await opensearchClient.indexLog({
        ...entry,
        timestamp: entry.timestamp.toISOString(),
      });
    }
  }

  return created.count;
}
