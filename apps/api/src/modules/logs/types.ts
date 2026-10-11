// Logs module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const logRangeSchema = z.enum(['15m', '1h', '6h', '24h', '7d', '30d']);

export const logQuerySchema = paginationSchema.extend({
  severity: z.string().optional(),
  source: z.string().optional(),
  resourceId: z.string().optional(),
  search: z.string().optional(),
  range: logRangeSchema.default('24h'),
  level: z.string().optional(),
});

export const logStatsQuerySchema = z.object({
  range: logRangeSchema.default('24h'),
  source: z.string().optional(),
});

const logEntrySchema = z.object({
  severity: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']),
  source: z.string().min(1).max(100),
  message: z.string().min(1).max(4000),
  resourceId: z.string().optional(),
  traceId: z.string().optional(),
  fields: z.record(z.unknown()).optional(),
});

export const ingestLogsSchema = z.object({
  entries: z.array(logEntrySchema).min(1).max(100),
});

export type LogQuery = z.infer<typeof logQuerySchema>;
export type LogStatsQuery = z.infer<typeof logStatsQuerySchema>;
export type IngestLogsInput = z.infer<typeof ingestLogsSchema>;
