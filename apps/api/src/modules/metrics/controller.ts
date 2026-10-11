// Metrics controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema, createPaginationMeta } from '@cloudops-hub/shared';
import { metricsService } from './service';
import {
  seriesQuerySchema,
  multiSeriesQuerySchema,
  prometheusQuerySchema,
  snapshotQuerySchema,
} from './types';

export const getMetricsOverview = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const overview = await metricsService.getOverview();
  res.json({ success: true, data: overview });
});

export const getMetricSeries = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(seriesQuerySchema, req.query);
  const series = await metricsService.getSeries(params);
  res.json({ success: true, data: series });
});

export const getMetricMultiSeries = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(multiSeriesQuerySchema, req.query);
  const result = await metricsService.getMultiSeries(params);
  res.json({ success: true, data: result });
});

export const getResourceMetrics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(seriesQuerySchema, req.query);
  const metrics = await metricsService.getResourceMetrics(req.params.id, params.range);
  res.json({ success: true, data: metrics });
});

export const getMetricTargets = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await metricsService.getTargets();
  res.json({ success: true, data: result });
});

export const queryPrometheus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(prometheusQuerySchema, req.query);
  const result = await metricsService.query(params);
  res.json({ success: true, data: result });
});

export const getMetricSnapshots = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(snapshotQuerySchema, req.query);
  const { snapshots, total } = await metricsService.getSnapshots(params);

  res.json({
    success: true,
    data: snapshots,
    pagination: createPaginationMeta(params, total),
  });
});
