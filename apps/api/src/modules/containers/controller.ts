// Containers controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema } from '@cloudops-hub/shared';
import { containerService } from './service';
import { containerFilterSchema } from './types';

export const getContainers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(containerFilterSchema, req.query);
  const result = await containerService.list(params);
  res.json({ ...result, success: true });
});

export const getContainer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const container = await containerService.get(req.params.id);
  res.json({ success: true, data: container });
});

export const startContainer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await containerService.start(req.params.id);
  res.json({ ...result, success: true });
});

export const stopContainer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await containerService.stop(req.params.id);
  res.json({ ...result, success: true });
});

export const restartContainer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await containerService.restart(req.params.id);
  res.json({ ...result, success: true });
});

export const removeContainer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await containerService.remove(req.params.id);
  res.json({ ...result, success: true });
});

export const getContainerLogs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const lines = parseInt(req.query.lines as string) || 100;
  const logs = await containerService.logs(req.params.id, lines);
  res.setHeader('Content-Type', 'text/plain');
  res.send(logs);
});

export const getContainerStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const stats = await containerService.stats(req.params.id);
  res.json({ success: true, data: stats });
});

export const getContainerHealth = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const health = await containerService.healthCheck();
  res.json({ success: true, data: health });
});