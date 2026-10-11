// Deployments routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getDeployments,
  getDeploymentStats,
  getDeployment,
  createDeployment,
  updateDeployment,
  deleteDeployment,
  restartDeployment,
  scaleDeployment,
  getDeploymentLogs,
} from './controller';

export const deploymentRoutes = Router();

// All routes require authentication
deploymentRoutes.use(authMiddleware);

// Read routes - all authenticated users
deploymentRoutes.get('/', asyncHandler(getDeployments));
deploymentRoutes.get('/stats', asyncHandler(getDeploymentStats));
deploymentRoutes.get('/:id', asyncHandler(getDeployment));
deploymentRoutes.get('/:id/logs', asyncHandler(getDeploymentLogs));

// Write routes - ENGINEER and ADMIN
deploymentRoutes.post('/', requireRole('ADMIN', 'ENGINEER'), asyncHandler(createDeployment));
deploymentRoutes.patch('/:id', requireRole('ADMIN', 'ENGINEER'), asyncHandler(updateDeployment));
deploymentRoutes.delete('/:id', requireRole('ADMIN'), asyncHandler(deleteDeployment));
deploymentRoutes.post('/:id/restart', requireRole('ADMIN', 'ENGINEER'), asyncHandler(restartDeployment));
deploymentRoutes.post('/:id/scale', requireRole('ADMIN', 'ENGINEER'), asyncHandler(scaleDeployment));