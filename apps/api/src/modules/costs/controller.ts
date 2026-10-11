// Costs controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema, createPaginationMeta } from '@cloudops-hub/shared';
import { costService } from './service';
import { costListSchema, estimateSchema, forecastSchema } from './types';

export const getCosts = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(costListSchema, req.query);
  const { estimates, total } = await costService.list(params);

  res.json({
    success: true,
    data: estimates,
    pagination: createPaginationMeta(params, total),
  });
});

export const getCostSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const summary = await costService.summary();
  res.json({ success: true, data: summary });
});

export const getCostForecast = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(forecastSchema, req.query);
  const forecast = await costService.forecast(params);
  res.json({ success: true, data: forecast });
});

export const getCost = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const estimate = await costService.findById(req.params.id);
  res.json({ success: true, data: estimate });
});

export const createEstimate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(estimateSchema, req.body ?? {});

  if (input.resourceId) {
    const estimate = await costService.estimateForResource(input.resourceId);
    res.json({ success: true, data: estimate, message: 'Cost estimate updated' });
    return;
  }

  const result = await costService.estimateAll();
  res.json({ success: true, data: result, message: `Estimated costs for ${result.resources} resources` });
});
