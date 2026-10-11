// Reports controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema, createPaginationMeta } from '@cloudops-hub/shared';
import { reportService } from './service';
import { createReportSchema, reportFilterParamsSchema, REPORT_TYPES } from './types';

export const getReports = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(reportFilterParamsSchema, req.query);
  const { reports, total } = await reportService.findAll(params);

  res.json({
    success: true,
    data: reports,
    pagination: createPaginationMeta(params, total),
  });
});

export const getReportTypes = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, data: REPORT_TYPES });
});

export const getReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const report = await reportService.findById(req.params.id);
  res.json({ success: true, data: report });
});

export const createReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(createReportSchema, req.body);
  const report = await reportService.create(input, req.user!.id);

  // Build the markdown file in the background; generate() handles its own errors.
  setImmediate(() => {
    void reportService.generate(report.id).catch(() => undefined);
  });

  res.status(201).json({
    success: true,
    data: report,
    message: 'Report queued for generation',
  });
});

export const downloadReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { content, filename } = await reportService.readContent(req.params.id);

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
});

export const deleteReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await reportService.delete(req.params.id);
  res.json({ success: true, message: 'Report deleted successfully' });
});
