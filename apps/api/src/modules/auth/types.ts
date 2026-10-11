// Auth module types and validation
import { z } from 'zod';
import { passwordSchema } from '@cloudops-hub/shared';

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;