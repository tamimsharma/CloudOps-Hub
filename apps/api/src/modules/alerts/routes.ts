// Alerts routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getAlerts,
  getAlertStats,
  getAlert,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
  deleteAlert,
  evaluateAlerts,
} from './controller';

export const alertRoutes = Router();

// All routes require authentication
alertRoutes.use(authMiddleware);

// Read routes - all authenticated users
alertRoutes.get('/', asyncHandler(getAlerts));
alertRoutes.get('/stats', asyncHandler(getAlertStats));
alertRoutes.get('/:id', asyncHandler(getAlert));

// Write routes - ENGINEER and ADMIN
alertRoutes.post('/', requireRole('ADMIN', 'ENGINEER'), asyncHandler(createAlert));
alertRoutes.post('/evaluate', requireRole('ADMIN', 'ENGINEER'), asyncHandler(evaluateAlerts));
alertRoutes.post('/:id/acknowledge', requireRole('ADMIN', 'ENGINEER'), asyncHandler(acknowledgeAlert));
alertRoutes.post('/:id/resolve', requireRole('ADMIN', 'ENGINEER'), asyncHandler(resolveAlert));
alertRoutes.delete('/:id', requireRole('ADMIN'), asyncHandler(deleteAlert));
