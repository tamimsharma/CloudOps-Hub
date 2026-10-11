// Reports routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getReports,
  getReportTypes,
  getReport,
  createReport,
  downloadReport,
  deleteReport,
} from './controller';

export const reportRoutes = Router();

// All routes require authentication
reportRoutes.use(authMiddleware);

// Read routes - all authenticated users
reportRoutes.get('/', asyncHandler(getReports));
reportRoutes.get('/types', asyncHandler(getReportTypes));
reportRoutes.get('/:id', asyncHandler(getReport));
reportRoutes.get('/:id/download', asyncHandler(downloadReport));

// Write routes - ENGINEER and ADMIN
reportRoutes.post('/', requireRole('ADMIN', 'ENGINEER'), asyncHandler(createReport));

// Destructive - ADMIN only
reportRoutes.delete('/:id', requireRole('ADMIN'), asyncHandler(deleteReport));
