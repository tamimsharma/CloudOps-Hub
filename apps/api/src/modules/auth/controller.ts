// Auth controller
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { authService } from './service';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema } from '@cloudops-hub/shared';
import { registerSchema, loginSchema, refreshTokenSchema, changePasswordSchema } from './types';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = validateSchema(registerSchema, req.body);
  const result = await authService.register(input);

  res.status(201).json({
    success: true,
    data: result,
    message: 'Registration successful',
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = validateSchema(loginSchema, req.body);
  const result = await authService.login(input);

  res.json({
    success: true,
    data: result,
    message: 'Login successful',
  });
});

export const logout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const refreshToken = req.body.refreshToken;
  await authService.logout(req.user!.id, refreshToken);

  res.json({
    success: true,
    message: 'Logout successful',
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const input = validateSchema(refreshTokenSchema, req.body);
  const result = await authService.refreshTokens(input);

  res.json({
    success: true,
    data: result,
    message: 'Tokens refreshed',
  });
});

export const changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(changePasswordSchema, req.body);
  await authService.changePassword(req.user!.id, input);

  res.json({
    success: true,
    message: 'Password changed successfully. Please log in again.',
  });
});

export const me = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await authService.getCurrentUser(req.user!.id);

  res.json({
    success: true,
    data: user,
  });
});