// Centralized error handler
import { Request, Response, NextFunction } from 'express';
import { isAppError, isOperationalError } from '@cloudops-hub/shared';
import { getConfig } from '@cloudops-hub/config';
import { prisma } from '../main';
import type { AuthenticatedRequest } from './auth';

const config = getConfig();

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.headers['x-request-id'] as string | undefined;

  // Log error
  console.error(`[${requestId}] Error:`, {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode: isAppError(err) ? err.statusCode : 500,
  });

  // Audit log for errors
  const authenticatedReq = req as AuthenticatedRequest;
  if (authenticatedReq.user) {
    prisma.auditLog.create({
      data: {
        userId: authenticatedReq.user.id,
        action: 'ERROR',
        resourceType: 'REQUEST',
        resourceId: requestId,
        success: false,
        errorMessage: err.message,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    }).catch(() => {}); // Don't let audit logging failure affect response
  }

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: Record<string, unknown> | undefined;

  if (isAppError(err)) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = err.message;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    code = 'AUTHENTICATION_ERROR';
    message = 'Invalid or expired token';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token has expired';
  } else if (err.name === 'PrismaClientKnownRequestError') {
    // Prisma errors
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      statusCode = 409;
      code = 'DUPLICATE_ENTRY';
      message = 'A record with this value already exists';
      details = { field: prismaErr.meta?.target };
    } else if (prismaErr.code === 'P2025') {
      statusCode = 404;
      code = 'NOT_FOUND';
      message = 'Record not found';
    }
  }

  // Don't leak internal errors in production
  if (!isOperationalError(err) && config.nodeEnv === 'production') {
    message = 'Internal server error';
    details = undefined;
  }

  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
      requestId,
    },
  };

  res.status(statusCode).json(response);
}

/** A route handler: may be sync or async, its result is routed to `next` on rejection. */
export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => unknown;

export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}