// Incidents routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getIncidents,
  getIncidentStats,
  getIncident,
  createIncident,
  updateIncident,
  acknowledgeIncident,
  investigateIncident,
  assignIncident,
  resolveIncident,
  closeIncident,
  addIncidentNote,
} from './controller';

export const incidentRoutes = Router();

// All routes require authentication
incidentRoutes.use(authMiddleware);

// Read routes - all authenticated users
incidentRoutes.get('/', asyncHandler(getIncidents));
incidentRoutes.get('/stats', asyncHandler(getIncidentStats));
incidentRoutes.get('/:id', asyncHandler(getIncident));

// Lifecycle routes - ENGINEER and ADMIN
incidentRoutes.post('/', requireRole('ADMIN', 'ENGINEER'), asyncHandler(createIncident));
incidentRoutes.patch('/:id', requireRole('ADMIN', 'ENGINEER'), asyncHandler(updateIncident));
incidentRoutes.post('/:id/acknowledge', requireRole('ADMIN', 'ENGINEER'), asyncHandler(acknowledgeIncident));
incidentRoutes.post('/:id/investigate', requireRole('ADMIN', 'ENGINEER'), asyncHandler(investigateIncident));
incidentRoutes.post('/:id/assign', requireRole('ADMIN', 'ENGINEER'), asyncHandler(assignIncident));
incidentRoutes.post('/:id/resolve', requireRole('ADMIN', 'ENGINEER'), asyncHandler(resolveIncident));
incidentRoutes.post('/:id/close', requireRole('ADMIN', 'ENGINEER'), asyncHandler(closeIncident));
incidentRoutes.post('/:id/notes', requireRole('ADMIN', 'ENGINEER'), asyncHandler(addIncidentNote));
