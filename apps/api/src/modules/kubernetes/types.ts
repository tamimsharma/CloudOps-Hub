// Kubernetes module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const createClusterSchema = z.object({
  name: z.string().min(1).max(255),
  provider: z.string().min(1).max(100),
  region: z.string().min(1).max(50),
  version: z.string().min(1).max(50),
  endpoint: z.string().url(),
  kubeconfigRef: z.string().optional(),
});

export const updateClusterSchema = createClusterSchema.partial();

export const clusterFilterSchema = paginationSchema.extend({
  provider: z.string().optional(),
  region: z.string().optional(),
  status: z.string().optional(),
});

export const scaleWorkloadSchema = z.object({
  replicas: z.number().int().positive().max(100),
});

export type CreateClusterInput = z.infer<typeof createClusterSchema>;
export type UpdateClusterInput = z.infer<typeof updateClusterSchema>;
export type ClusterFilterParams = z.infer<typeof clusterFilterSchema>;
export type ScaleWorkloadInput = z.infer<typeof scaleWorkloadSchema>;