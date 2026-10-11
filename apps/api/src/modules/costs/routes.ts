// Costs routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getCosts,
  getCostSummary,
  getCostForecast,
  getCost,
  createEstimate,
} from './controller';

export const costRoutes = Router();

// All routes require authentication
costRoutes.use(authMiddleware);

costRoutes.get('/', asyncHandler(getCosts));
costRoutes.get('/summary', asyncHandler(getCostSummary));
costRoutes.get('/forecast', asyncHandler(getCostForecast));
costRoutes.get('/:id', asyncHandler(getCost));

// Estimation - ENGINEER and ADMIN
costRoutes.post('/estimate', requireRole('ADMIN', 'ENGINEER'), asyncHandler(createEstimate));
