// Users module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
  role: z.enum(['ADMIN', 'ENGINEER', 'VIEWER']),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'ENGINEER', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
});

export const userFilterSchema = paginationSchema.extend({
  role: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserFilterParams = z.infer<typeof userFilterSchema>;