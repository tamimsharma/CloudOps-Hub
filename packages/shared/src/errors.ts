// Error classes for CloudOps Hub

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401, true);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403, true);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, true, { resource, identifier });
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, true, details);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, { retryAfter });
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', details?: Record<string, unknown>) {
    super(message, 'INTERNAL_ERROR', 500, false, details);
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string, message?: string) {
    super(
      message || `${service} is currently unavailable`,
      'SERVICE_UNAVAILABLE',
      503,
      true,
      { service }
    );
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'BAD_REQUEST', 400, true, details);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isOperationalError(error: unknown): boolean {
  return isAppError(error) && error.isOperational;
}