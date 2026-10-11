// Validation utilities using Zod
import { z } from 'zod';
import { ValidationError } from './errors';

export const uuidSchema = z.string().uuid({ message: 'Invalid UUID format' });

export const emailSchema = z.string().email({ message: 'Invalid email format' });

export const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters' })
  .max(128, { message: 'Password must not exceed 128 characters' })
  .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
  .regex(/[0-9]/, { message: 'Password must contain at least one number' })
  .regex(/[^A-Za-z0-9]/, { message: 'Password must contain at least one special character' });

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const timeRangeSchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  range: z.enum(['15m', '1h', '6h', '24h', '7d', '30d']).optional(),
});

export const resourceFilterSchema = z.object({
  type: z.string().optional(),
  provider: z.string().optional(),
  environment: z.string().optional(),
  region: z.string().optional(),
  status: z.string().optional(),
  health: z.string().optional(),
  search: z.string().optional(),
});

export const alertFilterSchema = z.object({
  severity: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  resourceId: z.string().optional(),
});

export const incidentFilterSchema = z.object({
  severity: z.string().optional(),
  status: z.string().optional(),
  assignedTo: z.string().optional(),
});

export const logFilterSchema = z.object({
  severity: z.string().optional(),
  source: z.string().optional(),
  resourceId: z.string().optional(),
  search: z.string().optional(),
});

export function validateSchema<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown
): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const flattened = result.error.flatten() as {
      fieldErrors?: Record<string, string[] | undefined>;
    };
    const fieldErrors = flattened.fieldErrors ?? {};
    const messages = (Object.entries(fieldErrors) as Array<[string, string[] | undefined]>).flatMap(
      ([field, fieldMessages]) => (fieldMessages ?? []).map((msg) => `${field}: ${msg}`)
    );
    throw new ValidationError('Validation failed', { errors: messages });
  }
  return result.data as z.infer<S>;
}

export type PaginationParams = z.infer<typeof paginationSchema>;
export type TimeRangeParams = z.infer<typeof timeRangeSchema>;
export type ResourceFilterParams = z.infer<typeof resourceFilterSchema>;
export type AlertFilterParams = z.infer<typeof alertFilterSchema>;
export type IncidentFilterParams = z.infer<typeof incidentFilterSchema>;
export type LogFilterParams = z.infer<typeof logFilterSchema>;