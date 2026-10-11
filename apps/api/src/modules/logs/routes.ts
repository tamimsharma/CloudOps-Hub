// Logs routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getLogs,
  getLogStats,
  getLogSources,
  getLogTail,
  getLog,
  ingestLogs,
} from './controller';

export const logsRoutes = Router();

// All routes require authentication
logsRoutes.use(authMiddleware);

logsRoutes.get('/', asyncHandler(getLogs));
logsRoutes.get('/stats', asyncHandler(getLogStats));
logsRoutes.get('/sources', asyncHandler(getLogSources));
logsRoutes.get('/tail', asyncHandler(getLogTail));
logsRoutes.get('/:id', asyncHandler(getLog));

// Ingest - ENGINEER and ADMIN (agents/collectors push logs here)
logsRoutes.post('/', requireRole('ADMIN', 'ENGINEER'), asyncHandler(ingestLogs));
