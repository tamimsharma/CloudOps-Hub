// Users routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getUsers,
  getUserStats,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} from './controller';

export const userRoutes = Router();

// All routes require authentication
userRoutes.use(authMiddleware);

// Admin only routes
userRoutes.get('/stats', requireRole('ADMIN'), asyncHandler(getUserStats));
userRoutes.post('/', requireRole('ADMIN'), asyncHandler(createUser));
userRoutes.delete('/:id', requireRole('ADMIN'), asyncHandler(deleteUser));

// All authenticated users
userRoutes.get('/', asyncHandler(getUsers));
userRoutes.get('/:id', asyncHandler(getUser));
userRoutes.patch('/:id', requireRole('ADMIN', 'ENGINEER'), asyncHandler(updateUser));