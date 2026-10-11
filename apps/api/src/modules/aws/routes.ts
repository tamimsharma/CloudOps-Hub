// AWS routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getAwsStatus,
  getInventory,
  getCosts,
  syncInventory,
  getServices,
} from './controller';

export const awsRoutes = Router();

// All routes require authentication
awsRoutes.use(authMiddleware);

// Read routes - all authenticated users
awsRoutes.get('/status', asyncHandler(getAwsStatus));
awsRoutes.get('/inventory', asyncHandler(getInventory));
awsRoutes.get('/costs', asyncHandler(getCosts));
awsRoutes.get('/services', asyncHandler(getServices));

// Write routes - ENGINEER and ADMIN
awsRoutes.post('/sync', requireRole('ADMIN', 'ENGINEER'), asyncHandler(syncInventory));
