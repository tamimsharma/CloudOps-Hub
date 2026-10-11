// CI/CD routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getWorkflows,
  createWorkflow,
  triggerWorkflow,
  getRuns,
  getRun,
  getCicdStats,
  getExternal,
} from './controller';

export const cicdRoutes = Router();

// All routes require authentication
cicdRoutes.use(authMiddleware);

// Read routes - all authenticated users
cicdRoutes.get('/workflows', asyncHandler(getWorkflows));
cicdRoutes.get('/runs', asyncHandler(getRuns));
cicdRoutes.get('/runs/:id', asyncHandler(getRun));
cicdRoutes.get('/stats', asyncHandler(getCicdStats));
cicdRoutes.get('/external', asyncHandler(getExternal));

// Write routes - ENGINEER and ADMIN
cicdRoutes.post('/workflows', requireRole('ADMIN', 'ENGINEER'), asyncHandler(createWorkflow));
cicdRoutes.post(
  '/workflows/:id/trigger',
  requireRole('ADMIN', 'ENGINEER'),
  asyncHandler(triggerWorkflow)
);
