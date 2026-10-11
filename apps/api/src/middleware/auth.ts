// Authentication middleware
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../main';
import { getConfig } from '@cloudops-hub/config';
import { AuthenticationError, AuthorizationError } from '@cloudops-hub/shared';

const config = getConfig();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.substring(7);

    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token has expired');
      }
      throw new AuthenticationError('Invalid token');
    }

    // Check if user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or inactive');
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AuthorizationError(`Required role: ${allowedRoles.join(' or ')}`);
    }

    next();
  };
}

export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    req.user = {
      id: decoded.sub as string,
      email: decoded.email as string,
      name: decoded.name as string,
      role: decoded.role as string,
    };
  } catch {
    // Ignore invalid tokens for optional auth
  }

  next();
}

export function generateTokens(user: { id: string; email: string; name: string; role: string }) {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
  );

  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiresIn } as jwt.SignOptions
  );

  return { accessToken, refreshToken };
}

export function verifyRefreshToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, config.jwtRefreshSecret) as jwt.JwtPayload;
}