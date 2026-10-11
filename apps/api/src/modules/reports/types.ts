// Reports module types
import { z } from 'zod';
import { paginationSchema } from '@cloudops-hub/shared';

export const reportTypeSchema = z.enum([
  'INVENTORY',
  'COST_ANALYSIS',
  'INCIDENT_SUMMARY',
  'DEPLOYMENT_HISTORY',
  'HEALTH_REPORT',
  'COMPLIANCE',
]);

export const reportStatusSchema = z.enum(['PENDING', 'GENERATING', 'COMPLETED', 'FAILED']);

export type ReportTypeValue = z.infer<typeof reportTypeSchema>;
export type ReportStatusValue = z.infer<typeof reportStatusSchema>;

export interface ReportTypeMeta {
  value: ReportTypeValue;
  label: string;
  description: string;
}

export const REPORT_TYPES: readonly ReportTypeMeta[] = [
  {
    value: 'INVENTORY',
    label: 'Resource Inventory',
    description: 'Snapshot of every tracked resource grouped by type, status and health',
  },
  {
    value: 'COST_ANALYSIS',
    label: 'Cost Analysis',
    description: 'Estimated spend totals, per-service breakdown and most expensive resources',
  },
  {
    value: 'INCIDENT_SUMMARY',
    label: 'Incident Summary',
    description: 'Incident counts by severity and status plus the most recent incidents',
  },
  {
    value: 'DEPLOYMENT_HISTORY',
    label: 'Deployment History',
    description: 'Recent deployments with status, duration and who deployed them',
  },
  {
    value: 'HEALTH_REPORT',
    label: 'Health Report',
    description: 'Fleet health distribution and every resource that is not healthy',
  },
  {
    value: 'COMPLIANCE',
    label: 'Compliance Checks',
    description: 'PASS/WARN/FAIL checks for secrets, ownership tags and stale deployments',
  },
];

const dateStringSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' });

export const createReportSchema = z.object({
  type: reportTypeSchema,
  name: z.string().min(1).max(255).optional(),
  parameters: z.record(z.unknown()).optional(),
  dateRange: z
    .object({
      from: dateStringSchema.optional(),
      to: dateStringSchema.optional(),
    })
    .optional(),
});

export const reportFilterParamsSchema = paginationSchema.extend({
  type: reportTypeSchema.optional(),
  status: reportStatusSchema.optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ReportFilterParams = z.infer<typeof reportFilterParamsSchema>;
