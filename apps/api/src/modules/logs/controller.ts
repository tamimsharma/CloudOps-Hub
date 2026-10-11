// Logs controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema, NotFoundError } from '@cloudops-hub/shared';
import { logService } from './service';
import { logQuerySchema, logStatsQuerySchema, ingestLogsSchema } from './types';

export const getLogs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(logQuerySchema, req.query);
  const result = await logService.search(params);

  res.json({
    success: true,
    data: result.entries,
    pagination: result.pagination,
    meta: { source: result.source },
  });
});

export const getLogStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(logStatsQuerySchema, req.query);
  const stats = await logService.stats(params);
  res.json({ success: true, data: stats });
});

export const getLogSources = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const sources = await logService.sources();
  res.json({ success: true, data: sources });
});

export const getLogTail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const limit = parseInt(String(req.query.limit), 10) || 20;
  const since = req.query.since as string | undefined;
  const entries = await logService.recent(limit, since);
  res.json({ success: true, data: entries });
});

export const getLog = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const entry = await logService.findById(req.params.id);
  if (!entry) throw new NotFoundError('Log entry', req.params.id);
  res.json({ success: true, data: entry });
});

export const ingestLogs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(ingestLogsSchema, req.body);
  const result = await logService.ingest(input);

  res.status(201).json({
    success: true,
    data: result,
    message: `${result.ingested} log entries ingested`,
  });
});
