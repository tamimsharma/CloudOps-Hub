// Health routes
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { getSystemHealth, getReadiness, getIntegrations } from './controller';

export const healthRoutes = Router();

// All routes require authentication
healthRoutes.use(authMiddleware);

// Read routes - all authenticated users
healthRoutes.get('/', asyncHandler(getSystemHealth));
healthRoutes.get('/ready', asyncHandler(getReadiness));
healthRoutes.get('/integrations', asyncHandler(getIntegrations));
