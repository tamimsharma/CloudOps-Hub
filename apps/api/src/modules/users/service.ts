// Users service
import { prisma } from '../../main';
import { hashPassword } from '@cloudops-hub/shared';
import { NotFoundError, ConflictError, ValidationError } from '@cloudops-hub/shared';
import { CreateUserInput, UpdateUserInput, UserFilterParams } from './types';
import { paginate, applySorting } from '@cloudops-hub/shared';

export class UserService {
  async create(input: CreateUserInput, currentUserId: string) {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const passwordHash = hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
        role: input.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async findAll(params: UserFilterParams) {
    const { page, limit, sortBy, sortOrder, role, isActive, search } = params;

    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder || 'asc' } : { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User', id);
    }

    return user;
  }

  async update(id: string, input: UpdateUserInput, currentUserId: string) {
    // Prevent self-demotion
    if (id === currentUserId && input.role && input.role !== 'ADMIN') {
      const currentUser = await prisma.user.findUnique({ where: { id: currentUserId } });
      if (currentUser?.role === 'ADMIN') {
        throw new ValidationError('Cannot demote yourself from ADMIN role');
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: input,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async delete(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new ValidationError('Cannot delete your own account');
    }

    await prisma.user.delete({ where: { id } });
  }

  async getStats() {
    const [total, active, byRole] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.groupBy({ by: ['role'], _count: true }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      byRole: byRole.reduce((acc, r) => ({ ...acc, [r.role]: r._count }), {}),
    };
  }
}

export const userService = new UserService();