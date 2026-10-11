// AWS controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { awsService } from './service';

export const getAwsStatus = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const status = await awsService.getStatus();
  res.json({ success: true, data: status });
});

export const getInventory = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const inventory = await awsService.getInventory();
  res.json({ success: true, data: inventory });
});

export const getCosts = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const costs = await awsService.getCosts();
  res.json({ success: true, data: costs });
});

export const syncInventory = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const result = await awsService.sync();

  res.json({
    success: true,
    data: result,
    message: `AWS inventory synchronized (${result.created} created, ${result.updated} updated)`,
  });
});

export const getServices = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const services = await awsService.getServices();
  res.json({ success: true, data: services });
});
