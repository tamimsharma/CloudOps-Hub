// Incidents module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const incidentListSchema = paginationSchema.extend({
  severity: z.string().optional(),
  status: z.string().optional(),
  assignedTo: z.string().optional(),
  affectedResourceId: z.string().optional(),
  search: z.string().optional(),
});

export const createIncidentSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(4000),
  severity: z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']).default('SEV3'),
  affectedResourceId: z.string().optional(),
  affectedResourceType: z.string().optional(),
  assignedTo: z.string().optional(),
  alertIds: z.array(z.string()).optional(),
});

export const updateIncidentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(4000).optional(),
  severity: z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']).optional(),
  rootCause: z.string().max(4000).optional(),
  resolution: z.string().max(4000).optional(),
});

export const assignIncidentSchema = z.object({
  assignedTo: z.string().min(1),
});

export const incidentNoteSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const resolveIncidentSchema = z.object({
  rootCause: z.string().max(4000).optional(),
  resolution: z.string().max(4000).optional(),
});

export type IncidentListParams = z.infer<typeof incidentListSchema>;
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type ResolveIncidentInput = z.infer<typeof resolveIncidentSchema>;
