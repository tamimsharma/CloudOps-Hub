// Request ID middleware
import { Request, Response, NextFunction } from 'express';
import { generateUUID } from '@cloudops-hub/shared';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || generateUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

export function getRequestId(req: Request): string {
  return req.headers['x-request-id'] as string;
}