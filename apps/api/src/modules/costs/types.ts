// Costs module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const costListSchema = paginationSchema.extend({
  provider: z.string().optional(),
  service: z.string().optional(),
  resourceId: z.string().optional(),
});

export const estimateSchema = z.object({
  resourceId: z.string().optional(),
});

export const forecastSchema = z.object({
  months: z.coerce.number().int().min(1).max(12).default(6),
});

export type CostListParams = z.infer<typeof costListSchema>;
export type EstimateInput = z.infer<typeof estimateSchema>;
export type ForecastParams = z.infer<typeof forecastSchema>;
