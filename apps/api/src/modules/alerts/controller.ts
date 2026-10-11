// Alerts controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema, createPaginationMeta } from '@cloudops-hub/shared';
import { alertService } from './service';
import { alertListSchema, createAlertSchema, alertStatsSchema } from './types';

export const getAlerts = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(alertListSchema, req.query);
  const { alerts, total } = await alertService.findAll(params);

  res.json({
    success: true,
    data: alerts,
    pagination: createPaginationMeta(params, total),
  });
});

export const getAlertStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(alertStatsSchema, req.query);
  const stats = await alertService.stats(params.range);
  res.json({ success: true, data: stats });
});

export const getAlert = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const alert = await alertService.findById(req.params.id);
  res.json({ success: true, data: alert });
});

export const createAlert = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(createAlertSchema, req.body);
  const alert = await alertService.create(input);

  res.status(201).json({ success: true, data: alert, message: 'Alert created successfully' });
});

export const acknowledgeAlert = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const alert = await alertService.acknowledge(req.params.id, req.user!.id);
  res.json({ success: true, data: alert, message: 'Alert acknowledged' });
});

export const resolveAlert = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const alert = await alertService.resolve(req.params.id, req.user!.id);
  res.json({ success: true, data: alert, message: 'Alert resolved' });
});

export const deleteAlert = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await alertService.remove(req.params.id);
  res.json({ success: true, message: 'Alert deleted successfully' });
});

export const evaluateAlerts = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await alertService.evaluate();
  res.json({ success: true, data: result, message: 'Alert rules evaluated' });
});
