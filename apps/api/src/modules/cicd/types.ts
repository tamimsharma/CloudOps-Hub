// CI/CD module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const cicdTriggerSchema = z.enum(['PUSH', 'PR', 'MANUAL', 'SCHEDULE']);
export const cicdStatusSchema = z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'CANCELLED']);

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(120),
  repository: z.string().min(1).max(255),
  branch: z.string().min(1).max(255).default('main'),
  trigger: cicdTriggerSchema.default('PUSH'),
});

export const workflowListParamsSchema = paginationSchema;

export const runListParamsSchema = paginationSchema.extend({
  workflowId: z.string().optional(),
  status: cicdStatusSchema.optional(),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type WorkflowListParams = z.infer<typeof workflowListParamsSchema>;
export type RunListParams = z.infer<typeof runListParamsSchema>;
