// Alerts module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const alertListSchema = paginationSchema.extend({
  severity: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  resourceId: z.string().optional(),
  search: z.string().optional(),
});

export const createAlertSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(2000),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('WARNING'),
  source: z.string().min(1).max(100).default('manual'),
  resourceId: z.string().optional(),
  resourceType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const alertActionSchema = z.object({
  note: z.string().max(1000).optional(),
});

export const alertStatsSchema = z.object({
  range: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
});

export type AlertListParams = z.infer<typeof alertListSchema>;
export type CreateAlertInput = z.infer<typeof createAlertSchema>;
export type AlertStatsParams = z.infer<typeof alertStatsSchema>;
