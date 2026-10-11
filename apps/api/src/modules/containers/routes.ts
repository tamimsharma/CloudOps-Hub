// Containers routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getContainers,
  getContainer,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  getContainerLogs,
  getContainerStats,
  getContainerHealth,
} from './controller';

export const containerRoutes = Router();

// All routes require authentication
containerRoutes.use(authMiddleware);

// Read routes - all authenticated users
containerRoutes.get('/', asyncHandler(getContainers));
containerRoutes.get('/health', asyncHandler(getContainerHealth));
containerRoutes.get('/:id', asyncHandler(getContainer));
containerRoutes.get('/:id/logs', asyncHandler(getContainerLogs));
containerRoutes.get('/:id/stats', asyncHandler(getContainerStats));

// Write routes - ENGINEER and ADMIN
containerRoutes.post('/:id/start', requireRole('ADMIN', 'ENGINEER'), asyncHandler(startContainer));
containerRoutes.post('/:id/stop', requireRole('ADMIN', 'ENGINEER'), asyncHandler(stopContainer));
containerRoutes.post('/:id/restart', requireRole('ADMIN', 'ENGINEER'), asyncHandler(restartContainer));
containerRoutes.delete('/:id', requireRole('ADMIN'), asyncHandler(removeContainer));