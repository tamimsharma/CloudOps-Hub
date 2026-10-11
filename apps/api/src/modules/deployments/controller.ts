// Deployments controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema } from '@cloudops-hub/shared';
import { deploymentService } from './service';
import { createDeploymentSchema, updateDeploymentSchema, deploymentFilterSchema, scaleDeploymentSchema } from './types';

export const getDeployments = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(deploymentFilterSchema, req.query);
  const { deployments, total } = await deploymentService.findAll(params);

  const { createPaginationMeta } = await import('@cloudops-hub/shared');
  const pagination = createPaginationMeta(params, total);

  res.json({
    success: true,
    data: deployments,
    pagination,
  });
});

export const getDeploymentStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const stats = await deploymentService.getStats();
  res.json({ success: true, data: stats });
});

export const getDeployment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const deployment = await deploymentService.findById(req.params.id);
  res.json({ success: true, data: deployment });
});

export const createDeployment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(createDeploymentSchema, req.body);
  const deployment = await deploymentService.create(input, req.user!.id);

  res.status(201).json({
    success: true,
    data: deployment,
    message: 'Deployment created successfully',
  });
});

export const updateDeployment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(updateDeploymentSchema, req.body);
  const deployment = await deploymentService.update(req.params.id, input);

  res.json({
    success: true,
    data: deployment,
    message: 'Deployment updated successfully',
  });
});

export const deleteDeployment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await deploymentService.delete(req.params.id);
  res.json({ success: true, message: 'Deployment deleted successfully' });
});

export const restartDeployment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await deploymentService.restart(req.params.id);
  res.json({ ...result, success: true });
});

export const scaleDeployment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(scaleDeploymentSchema, req.body);
  const result = await deploymentService.scale(req.params.id, input);
  res.json({ ...result, success: true });
});

export const getDeploymentLogs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const lines = parseInt(req.query.lines as string) || 100;
  const logs = await deploymentService.getLogs(req.params.id, lines);
  
  res.setHeader('Content-Type', 'text/plain');
  res.send(logs);
});