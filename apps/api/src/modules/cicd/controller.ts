// CI/CD controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema, createPaginationMeta } from '@cloudops-hub/shared';
import { cicdService } from './service';
import { createWorkflowSchema, runListParamsSchema, workflowListParamsSchema } from './types';

export const getWorkflows = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(workflowListParamsSchema, req.query);
  const { workflows, total } = await cicdService.listWorkflows(params);

  res.json({
    success: true,
    data: workflows,
    pagination: createPaginationMeta(params, total),
  });
});

export const createWorkflow = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(createWorkflowSchema, req.body);
  const workflow = await cicdService.createWorkflow(input);

  res.status(201).json({
    success: true,
    data: workflow,
    message: 'Workflow created successfully',
  });
});

export const triggerWorkflow = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const run = await cicdService.trigger(req.params.id);

  res.status(201).json({
    success: true,
    data: run,
    message: 'Workflow triggered',
  });
});

export const getRuns = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(runListParamsSchema, req.query);
  const { runs, total } = await cicdService.listRuns(params);

  res.json({
    success: true,
    data: runs,
    pagination: createPaginationMeta(params, total),
  });
});

export const getRun = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const run = await cicdService.getRun(req.params.id);
  res.json({ success: true, data: run });
});

export const getCicdStats = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const stats = await cicdService.getStats();
  res.json({ success: true, data: stats });
});

export const getExternal = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const data = await cicdService.getExternal();
  res.json({ success: true, data });
});
