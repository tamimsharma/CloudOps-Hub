// Health controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { healthService } from './service';

export const getSystemHealth = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const health = await healthService.getSystemHealth();
  res.json({ success: true, data: health });
});

export const getReadiness = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const readiness = await healthService.getReady();
  res.json({ success: true, data: readiness });
});

export const getIntegrations = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const integrations = healthService.getIntegrations();
  res.json({ success: true, data: integrations });
});
