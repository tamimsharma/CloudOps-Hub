// Auth service
import { prisma } from '../../main';
import { hashPassword, verifyPassword, generateRandomString, hashToken } from '@cloudops-hub/shared';
import { generateTokens, verifyRefreshToken } from '../../middleware/auth';
import { AuthenticationError, ConflictError, ValidationError } from '@cloudops-hub/shared';
import { RegisterInput, LoginInput, RefreshTokenInput, ChangePasswordInput } from './types';

export class AuthService {
  async register(input: RegisterInput) {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const passwordHash = hashPassword(input.password);

    // Create user. The first *real* account to register bootstraps the
    // platform as ADMIN (the seeded demo admins at @cloudops.local don't
    // count); everyone after is VIEWER - promote them from the Users page.
    const adminCount = await prisma.user.count({
      where: {
        role: 'ADMIN',
        NOT: { email: { endsWith: '@cloudops.local' } },
      },
    });
    const role = adminCount === 0 ? 'ADMIN' : 'VIEWER';

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
        role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    // Store refresh token hash
    const refreshTokenHash = hashToken(refreshToken);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { user, accessToken, refreshToken };
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Verify password
    const isValid = verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    // Store refresh token hash
    const refreshTokenHash = hashToken(refreshToken);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + (input.rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await prisma.refreshToken.updateMany({
        where: { userId, tokenHash },
        data: { revokedAt: new Date() },
      });
    } else {
      // Revoke all refresh tokens for user
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async refreshTokens(input: RefreshTokenInput) {
    let decoded;
    try {
      decoded = verifyRefreshToken(input.refreshToken);
    } catch {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Check if refresh token exists and is not revoked
    const tokenHash = hashToken(input.refreshToken);
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        userId: decoded.sub,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!storedToken) {
      throw new AuthenticationError('Refresh token revoked or expired');
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or inactive');
    }

    // Revoke old refresh token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    // Store new refresh token
    const newRefreshTokenHash = hashToken(newRefreshToken);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: newRefreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Verify current password
    const isValid = verifyPassword(input.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new ValidationError('Current password is incorrect');
    }

    // Hash new password
    const passwordHash = hashPassword(input.newPassword);

    // Update password and revoke all refresh tokens
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    return user;
  }
}

export const authService = new AuthService();