// Resources controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema, createPaginationMeta, ValidationError } from '@cloudops-hub/shared';
import { resourceService } from './service';
import { createResourceSchema, updateResourceSchema, resourceFilterParamsSchema } from './types';

export const getResources = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(resourceFilterParamsSchema, req.query);
  const { resources, total } = await resourceService.findAll(params);

  const pagination = createPaginationMeta(params, total);

  res.json({
    success: true,
    data: resources,
    pagination,
  });
});

export const getResourceStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const stats = await resourceService.getStats();
  res.json({ success: true, data: stats });
});

export const getResourceHealth = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const health = await resourceService.getHealthSummary();
  res.json({ success: true, data: health });
});

export const getResource = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const resource = await resourceService.findById(req.params.id);
  res.json({ success: true, data: resource });
});

export const createResource = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(createResourceSchema, req.body);
  const resource = await resourceService.create(input);

  res.status(201).json({
    success: true,
    data: resource,
    message: 'Resource created successfully',
  });
});

export const updateResource = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(updateResourceSchema, req.body);
  const resource = await resourceService.update(req.params.id, input);

  res.json({
    success: true,
    data: resource,
    message: 'Resource updated successfully',
  });
});

export const deleteResource = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await resourceService.delete(req.params.id);
  res.json({ success: true, message: 'Resource deleted successfully' });
});

export const updateResourceHealth = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { health, cpuUsage, memoryUsage } = req.body;
  
  if (!health) {
    throw new ValidationError('Health status is required');
  }

  const resource = await resourceService.updateHealth(req.params.id, health, cpuUsage, memoryUsage);

  res.json({
    success: true,
    data: resource,
    message: 'Resource health updated successfully',
  });
});