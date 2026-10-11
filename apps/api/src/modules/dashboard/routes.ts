// Dashboard routes
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { getDashboardSummary } from './controller';

export const dashboardRoutes = Router();

dashboardRoutes.use(authMiddleware);

dashboardRoutes.get('/summary', asyncHandler(getDashboardSummary));
