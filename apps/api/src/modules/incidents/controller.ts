// Incidents controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema, createPaginationMeta } from '@cloudops-hub/shared';
import { incidentService } from './service';
import {
  incidentListSchema,
  createIncidentSchema,
  updateIncidentSchema,
  assignIncidentSchema,
  incidentNoteSchema,
  resolveIncidentSchema,
} from './types';

export const getIncidents = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(incidentListSchema, req.query);
  const { incidents, total } = await incidentService.findAll(params);

  res.json({
    success: true,
    data: incidents,
    pagination: createPaginationMeta(params, total),
  });
});

export const getIncidentStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const stats = await incidentService.stats();
  res.json({ success: true, data: stats });
});

export const getIncident = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const incident = await incidentService.findById(req.params.id);
  res.json({ success: true, data: incident });
});

export const createIncident = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(createIncidentSchema, req.body);
  const incident = await incidentService.create(input, req.user!.id);

  res.status(201).json({ success: true, data: incident, message: 'Incident created successfully' });
});

export const updateIncident = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(updateIncidentSchema, req.body);
  const incident = await incidentService.update(req.params.id, input, req.user!.id);

  res.json({ success: true, data: incident, message: 'Incident updated successfully' });
});

export const acknowledgeIncident = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const incident = await incidentService.acknowledge(req.params.id, req.user!.id);
  res.json({ success: true, data: incident, message: 'Incident acknowledged' });
});

export const investigateIncident = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const incident = await incidentService.startInvestigating(req.params.id, req.user!.id);
  res.json({ success: true, data: incident, message: 'Investigation started' });
});

export const assignIncident = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(assignIncidentSchema, req.body);
  const incident = await incidentService.assign(req.params.id, input.assignedTo, req.user!.id);
  res.json({ success: true, data: incident, message: 'Incident assigned' });
});

export const resolveIncident = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(resolveIncidentSchema, req.body ?? {});
  const incident = await incidentService.resolve(req.params.id, input, req.user!.id);
  res.json({ success: true, data: incident, message: 'Incident resolved' });
});

export const closeIncident = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const incident = await incidentService.close(req.params.id, req.user!.id);
  res.json({ success: true, data: incident, message: 'Incident closed' });
});

export const addIncidentNote = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(incidentNoteSchema, req.body);
  const incident = await incidentService.addNote(req.params.id, input.content, req.user!.id);
  res.json({ success: true, data: incident, message: 'Note added' });
});
