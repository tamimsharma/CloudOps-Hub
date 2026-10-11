// Resources module types
import { z } from 'zod';
import { paginationSchema, resourceFilterSchema } from '@cloudops-hub/shared';

export const createResourceSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum([
    'EC2_INSTANCE',
    'DOCKER_CONTAINER',
    'KUBERNETES_CLUSTER',
    'KUBERNETES_POD',
    'KUBERNETES_SERVICE',
    'KUBERNETES_DEPLOYMENT',
    'S3_BUCKET',
    'DATABASE',
    'LOAD_BALANCER',
    'APPLICATION',
  ]),
  provider: z.string().min(1).max(100),
  environment: z.string().min(1).max(50),
  region: z.string().min(1).max(50),
  status: z.enum(['RUNNING', 'STOPPED', 'PENDING', 'ERROR', 'UNKNOWN']).default('UNKNOWN'),
  health: z.enum(['HEALTHY', 'WARNING', 'DEGRADED', 'CRITICAL', 'UNKNOWN']).default('UNKNOWN'),
  cpuUsage: z.number().min(0).max(100).optional(),
  memoryUsage: z.number().min(0).max(100).optional(),
  diskUsage: z.number().min(0).max(100).optional(),
  networkIn: z.number().optional(),
  networkOut: z.number().optional(),
  tags: z.record(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateResourceSchema = createResourceSchema.partial();

export const resourceFilterParamsSchema = paginationSchema.merge(resourceFilterSchema);

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ResourceFilterParams = z.infer<typeof resourceFilterParamsSchema>;