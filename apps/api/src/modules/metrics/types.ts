// Metrics module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const metricKeySchema = z.enum([
  'cpu',
  'memory',
  'disk',
  'network_in',
  'network_out',
  'requests',
  'errors',
  'latency',
]);

export const rangeSchema = z.enum(['15m', '1h', '6h', '24h', '7d', '30d']);

export const seriesQuerySchema = z.object({
  metric: metricKeySchema.default('cpu'),
  range: rangeSchema.default('1h'),
  resourceId: z.string().optional(),
});

export const multiSeriesQuerySchema = z.object({
  metrics: z.string().default('cpu,memory,requests,errors'),
  range: rangeSchema.default('24h'),
  resourceId: z.string().optional(),
});

export const prometheusQuerySchema = z.object({
  query: z.string().min(1),
  range: rangeSchema.default('1h'),
  step: z.string().optional(),
});

export const snapshotQuerySchema = paginationSchema.extend({
  resourceId: z.string().optional(),
  metricType: z.string().optional(),
});

export type SeriesQuery = z.infer<typeof seriesQuerySchema>;
export type MultiSeriesQuery = z.infer<typeof multiSeriesQuerySchema>;
export type PrometheusQuery = z.infer<typeof prometheusQuerySchema>;
export type SnapshotQuery = z.infer<typeof snapshotQuerySchema>;
