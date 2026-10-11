// Dashboard controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { dashboardService } from './service';

export const getDashboardSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const summary = await dashboardService.getSummary();
  res.json({ success: true, data: summary });
});
