// Auth routes
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  register,
  login,
  logout,
  refresh,
  changePassword,
  me,
} from './controller';

export const authRoutes = Router();

// Public routes
authRoutes.post('/register', asyncHandler(register));
authRoutes.post('/login', asyncHandler(login));
authRoutes.post('/refresh', asyncHandler(refresh));

// Protected routes
authRoutes.post('/logout', authMiddleware, asyncHandler(logout));
authRoutes.post('/change-password', authMiddleware, asyncHandler(changePassword));
authRoutes.get('/me', authMiddleware, asyncHandler(me));