// Resources service
import { prisma } from '../../main';
import { NotFoundError, ValidationError } from '@cloudops-hub/shared';
import { CreateResourceInput, UpdateResourceInput, ResourceFilterParams } from './types';
import { paginate, createPaginationMeta, applySorting } from '@cloudops-hub/shared';
import { Prisma } from '@prisma/client';

export class ResourceService {
  async create(input: CreateResourceInput) {
    const resource = await prisma.resource.create({
      data: {
        ...input,
        tags: input.tags || {},
        metadata: (input.metadata || {}) as Prisma.InputJsonValue,
      },
    });

    return resource;
  }

  async findAll(params: ResourceFilterParams) {
    const { page, limit, sortBy, sortOrder, type, provider, environment, region, status, health, search } = params;

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (provider) where.provider = provider;
    if (environment) where.environment = environment;
    if (region) where.region = region;
    if (status) where.status = status;
    if (health) where.health = health;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { provider: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [resources, total] = await Promise.all([
      prisma.resource.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder || 'asc' } : { createdAt: 'desc' },
      }),
      prisma.resource.count({ where }),
    ]);

    return { resources, total };
  }

  async findById(id: string) {
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: {
        deployments: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
          },
        },
        alerts: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          where: { status: { not: 'RESOLVED' } },
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
            createdAt: true,
          },
        },
        incidents: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
            createdAt: true,
          },
        },
        costEstimates: {
          take: 1,
          orderBy: { estimatedAt: 'desc' },
        },
      },
    });

    if (!resource) {
      throw new NotFoundError('Resource', id);
    }

    return resource;
  }

  async update(id: string, input: UpdateResourceInput) {
    // Check if resource exists
    await this.findById(id);

    const resource = await prisma.resource.update({
      where: { id },
      data: {
        ...input,
        tags: input.tags ?? undefined,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return resource;
  }

  async delete(id: string) {
    await this.findById(id);
    await prisma.resource.delete({ where: { id } });
  }

  async updateHealth(id: string, health: string, cpuUsage?: number, memoryUsage?: number) {
    const resource = await prisma.resource.update({
      where: { id },
      data: {
        health: health as any,
        cpuUsage: cpuUsage ?? undefined,
        memoryUsage: memoryUsage ?? undefined,
        lastHealthCheckAt: new Date(),
      },
    });

    return resource;
  }

  async getStats() {
    const [
      total,
      byStatus,
      byHealth,
      byType,
      byProvider,
      byEnvironment,
    ] = await Promise.all([
      prisma.resource.count(),
      prisma.resource.groupBy({ by: ['status'], _count: true }),
      prisma.resource.groupBy({ by: ['health'], _count: true }),
      prisma.resource.groupBy({ by: ['type'], _count: true }),
      prisma.resource.groupBy({ by: ['provider'], _count: true }),
      prisma.resource.groupBy({ by: ['environment'], _count: true }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
      byHealth: byHealth.reduce((acc, h) => ({ ...acc, [h.health]: h._count }), {}),
      byType: byType.reduce((acc, t) => ({ ...acc, [t.type]: t._count }), {}),
      byProvider: byProvider.reduce((acc, p) => ({ ...acc, [p.provider]: p._count }), {}),
      byEnvironment: byEnvironment.reduce((acc, e) => ({ ...acc, [e.environment]: e._count }), {}),
    };
  }

  async getHealthSummary() {
    const resources = await prisma.resource.findMany({
      select: { id: true, name: true, type: true, health: true, status: true, cpuUsage: true, memoryUsage: true },
    });

    const healthy = resources.filter(r => r.health === 'HEALTHY').length;
    const warning = resources.filter(r => r.health === 'WARNING').length;
    const degraded = resources.filter(r => r.health === 'DEGRADED').length;
    const critical = resources.filter(r => r.health === 'CRITICAL').length;
    const unknown = resources.filter(r => r.health === 'UNKNOWN').length;

    const running = resources.filter(r => r.status === 'RUNNING').length;
    const stopped = resources.filter(r => r.status === 'STOPPED').length;
    const error = resources.filter(r => r.status === 'ERROR').length;

    return {
      total: resources.length,
      healthy,
      warning,
      degraded,
      critical,
      unknown,
      running,
      stopped,
      error,
      resources: resources.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        health: r.health,
        status: r.status,
        cpuUsage: r.cpuUsage,
        memoryUsage: r.memoryUsage,
      })),
    };
  }
}

export const resourceService = new ResourceService();