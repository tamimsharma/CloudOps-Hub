// Alerts service
import { prisma } from '../../main';
import { NotFoundError, ConflictError } from '@cloudops-hub/shared';
import { Prisma, ResourceType } from '@prisma/client';
import { evaluateAlerts } from '../../services/alertEngine';
import { AlertListParams, CreateAlertInput } from './types';

const RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const ALERT_INCLUDE = {
  resource: { select: { id: true, name: true, type: true, health: true, environment: true } },
  acknowledgedByUser: { select: { id: true, name: true, email: true } },
  resolvedByUser: { select: { id: true, name: true, email: true } },
  _count: { select: { incidents: true } },
} satisfies Prisma.AlertInclude;

export class AlertService {
  async findAll(params: AlertListParams) {
    const where: Prisma.AlertWhereInput = {};
    if (params.severity) where.severity = params.severity as Prisma.AlertWhereInput['severity'];
    if (params.status) where.status = params.status as Prisma.AlertWhereInput['status'];
    if (params.source) where.source = params.source;
    if (params.resourceId) where.resourceId = params.resourceId;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: ALERT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.alert.count({ where }),
    ]);

    return { alerts, total };
  }

  async findById(id: string) {
    const alert = await prisma.alert.findUnique({ where: { id }, include: ALERT_INCLUDE });
    if (!alert) throw new NotFoundError('Alert', id);
    return alert;
  }

  async create(input: CreateAlertInput) {
    return prisma.alert.create({
      data: {
        title: input.title,
        description: input.description,
        severity: input.severity,
        source: input.source,
        resourceId: input.resourceId ?? null,
        resourceType: (input.resourceType as ResourceType | undefined) ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
      include: ALERT_INCLUDE,
    });
  }

  async acknowledge(id: string, userId: string) {
    const alert = await this.findById(id);
    if (alert.status === 'RESOLVED') {
      throw new ConflictError('Alert is already resolved');
    }
    if (alert.status === 'ACKNOWLEDGED') {
      throw new ConflictError('Alert is already acknowledged');
    }

    return prisma.alert.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedBy: userId, acknowledgedAt: new Date() },
      include: ALERT_INCLUDE,
    });
  }

  async resolve(id: string, userId: string) {
    const alert = await this.findById(id);
    if (alert.status === 'RESOLVED') {
      throw new ConflictError('Alert is already resolved');
    }

    return prisma.alert.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedBy: userId, resolvedAt: new Date() },
      include: ALERT_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await prisma.alert.delete({ where: { id } });
  }

  async stats(range: string) {
    const since = new Date(Date.now() - (RANGE_MS[range] ?? RANGE_MS['24h']));

    const [total, byStatus, bySeverity, bySource, recent] = await Promise.all([
      prisma.alert.count({ where: { createdAt: { gte: since } } }),
      prisma.alert.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: true }),
      prisma.alert.groupBy({ by: ['severity'], where: { createdAt: { gte: since } }, _count: true }),
      prisma.alert.groupBy({
        by: ['source'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.alert.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { resource: { select: { id: true, name: true } } },
      }),
    ]);

    const openCount = await prisma.alert.count({ where: { status: { in: ['FIRING', 'ACKNOWLEDGED'] } } });

    return {
      range,
      since: since.toISOString(),
      total,
      open: openCount,
      byStatus: byStatus.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: row._count }), {}),
      bySeverity: bySeverity.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.severity]: row._count }), {}),
      bySource: (bySource as Array<{ source: string; _count: { _all: number } }>)
        .slice()
        .sort((a, b) => b._count._all - a._count._all)
        .slice(0, 10)
        .map((row) => ({
          source: row.source,
          count: row._count._all,
        })),
      recent,
    };
  }

  /** Runs the detection rules on demand (also used by the scheduler). */
  async evaluate() {
    return evaluateAlerts();
  }
}

export const alertService = new AlertService();
