// Audit logger middleware
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../main';
import { AuthenticatedRequest } from './auth';

const AUDIT_ACTIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'secret',
  'key',
  'credential',
]);

function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const lowerKey = key.toLowerCase();
    if ([...SENSITIVE_FIELDS].some((s) => lowerKey.includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeBody(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function getResourceInfo(req: Request): { type: string; id?: string } {
  const pathParts = req.path.split('/').filter(Boolean);
  // Expected pattern: /api/:resource/:id or /api/:resource
  const resourceType = pathParts[1]?.toUpperCase() || 'UNKNOWN';
  const resourceId = pathParts[2] && !isNaN(Number(pathParts[2])) ? undefined : pathParts[2];
  return { type: resourceType, id: resourceId };
}

export function auditLogger(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Only audit mutating requests from authenticated users
  if (!AUDIT_ACTIONS.has(req.method) || !req.user) {
    return next();
  }

  const originalSend = res.send;
  const startTime = Date.now();

  res.send = function (body?: unknown): Response {
    const duration = Date.now() - startTime;
    const { type: resourceType, id: resourceId } = getResourceInfo(req);
    const sanitizedBody = sanitizeBody((req.body ?? {}) as Record<string, unknown>);

    // Don't await to avoid blocking response
    prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: `${req.method} ${resourceType}`,
        resourceType,
        resourceId,
        oldValues: req.method !== 'POST' ? (sanitizedBody as Prisma.InputJsonValue) : undefined,
        newValues: res.statusCode < 400 ? (sanitizedBody as Prisma.InputJsonValue) : undefined,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: res.statusCode < 400,
        errorMessage: res.statusCode >= 400 && typeof body === 'string' ? body.slice(0, 1000) : undefined,
      },
    }).catch((err) => {
      console.error('Audit log failed:', err);
    });

    return originalSend.call(this, body);
  };

  next();
}