// Deployments module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const createDeploymentSchema = z.object({
  name: z.string().min(1).max(255),
  image: z.string().min(1).max(500),
  tag: z.string().min(1).max(100).default('latest'),
  port: z.number().int().positive().max(65535),
  environmentVariables: z.record(z.string()).optional(),
  cpuLimit: z.string().default('500m'),
  memoryLimit: z.string().default('512Mi'),
  replicas: z.number().int().positive().max(10).default(1),
  resourceId: z.string().uuid().optional(),
});

export const updateDeploymentSchema = createDeploymentSchema.partial();

export const deploymentFilterSchema = paginationSchema.extend({
  status: z.string().optional(),
  resourceId: z.string().optional(),
});

export const scaleDeploymentSchema = z.object({
  replicas: z.number().int().positive().max(100),
});

export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;
export type UpdateDeploymentInput = z.infer<typeof updateDeploymentSchema>;
export type DeploymentFilterParams = z.infer<typeof deploymentFilterSchema>;
export type ScaleDeploymentInput = z.infer<typeof scaleDeploymentSchema>;