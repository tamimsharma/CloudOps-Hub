// Metrics routes
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getMetricsOverview,
  getMetricSeries,
  getMetricMultiSeries,
  getResourceMetrics,
  getMetricTargets,
  queryPrometheus,
  getMetricSnapshots,
} from './controller';

export const metricsRoutes = Router();

// All routes require authentication
metricsRoutes.use(authMiddleware);

metricsRoutes.get('/overview', asyncHandler(getMetricsOverview));
metricsRoutes.get('/targets', asyncHandler(getMetricTargets));
metricsRoutes.get('/query', asyncHandler(queryPrometheus));
metricsRoutes.get('/series', asyncHandler(getMetricSeries));
metricsRoutes.get('/multi', asyncHandler(getMetricMultiSeries));
metricsRoutes.get('/snapshots', asyncHandler(getMetricSnapshots));
metricsRoutes.get('/resources/:id', asyncHandler(getResourceMetrics));
