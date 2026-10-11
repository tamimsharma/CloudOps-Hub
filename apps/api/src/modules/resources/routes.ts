// Resources routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getResources,
  getResourceStats,
  getResourceHealth,
  getResource,
  createResource,
  updateResource,
  deleteResource,
  updateResourceHealth,
} from './controller';

export const resourceRoutes = Router();

// All routes require authentication
resourceRoutes.use(authMiddleware);

// Read routes - all authenticated users
resourceRoutes.get('/', asyncHandler(getResources));
resourceRoutes.get('/stats', asyncHandler(getResourceStats));
resourceRoutes.get('/health', asyncHandler(getResourceHealth));
resourceRoutes.get('/:id', asyncHandler(getResource));

// Write routes - ENGINEER and ADMIN
resourceRoutes.post('/', requireRole('ADMIN', 'ENGINEER'), asyncHandler(createResource));
resourceRoutes.patch('/:id', requireRole('ADMIN', 'ENGINEER'), asyncHandler(updateResource));
resourceRoutes.delete('/:id', requireRole('ADMIN'), asyncHandler(deleteResource));
resourceRoutes.post('/:id/health', requireRole('ADMIN', 'ENGINEER'), asyncHandler(updateResourceHealth));