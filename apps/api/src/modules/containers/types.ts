// Containers module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const containerFilterSchema = paginationSchema.extend({
  status: z.string().optional(),
  name: z.string().optional(),
});

export type ContainerFilterParams = z.infer<typeof containerFilterSchema>;