// Incidents service - full incident lifecycle with timeline tracking.
import { prisma } from '../../main';
import { NotFoundError, ConflictError } from '@cloudops-hub/shared';
import { Prisma, ResourceType, TimelineEventType } from '@prisma/client';
import {
  CreateIncidentInput,
  IncidentListParams,
  ResolveIncidentInput,
  UpdateIncidentInput,
} from './types';

const INCIDENT_INCLUDE = {
  affectedResource: { select: { id: true, name: true, type: true, health: true } },
  assignedToUser: { select: { id: true, name: true, email: true } },
  acknowledgedByUser: { select: { id: true, name: true, email: true } },
  resolvedByUser: { select: { id: true, name: true, email: true } },
  closedByUser: { select: { id: true, name: true, email: true } },
  alerts: { select: { id: true, title: true, severity: true, status: true, createdAt: true } },
  timeline: { orderBy: { createdAt: 'desc' as const } },
  notes: {
    orderBy: { createdAt: 'desc' as const },
    include: { user: { select: { id: true, name: true, email: true } } },
  },
} satisfies Prisma.IncidentInclude;

async function addTimeline(
  incidentId: string,
  type: TimelineEventType,
  description: string,
  userId?: string,
  metadata: Record<string, unknown> = {}
) {
  await prisma.incidentTimelineEvent.create({
    data: { incidentId, type, description, userId, metadata: metadata as Prisma.InputJsonValue },
  });
}

export class IncidentService {
  async findAll(params: IncidentListParams) {
    const where: Prisma.IncidentWhereInput = {};
    if (params.severity) where.severity = params.severity as Prisma.IncidentWhereInput['severity'];
    if (params.status) where.status = params.status as Prisma.IncidentWhereInput['status'];
    if (params.assignedTo) where.assignedTo = params.assignedTo;
    if (params.affectedResourceId) where.affectedResourceId = params.affectedResourceId;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        include: {
          affectedResource: { select: { id: true, name: true, type: true } },
          assignedToUser: { select: { id: true, name: true, email: true } },
          alerts: { select: { id: true, severity: true, status: true } },
          _count: { select: { notes: true, timeline: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.incident.count({ where }),
    ]);

    return { incidents, total };
  }

  async findById(id: string) {
    const incident = await prisma.incident.findUnique({ where: { id }, include: INCIDENT_INCLUDE });
    if (!incident) throw new NotFoundError('Incident', id);
    return incident;
  }

  async create(input: CreateIncidentInput, userId: string) {
    const incident = await prisma.incident.create({
      data: {
        title: input.title,
        description: input.description,
        severity: input.severity,
        status: 'OPEN',
        affectedResourceId: input.affectedResourceId ?? null,
        affectedResourceType: (input.affectedResourceType as ResourceType | undefined) ?? null,
        assignedTo: input.assignedTo ?? null,
        alerts: input.alertIds?.length ? { connect: input.alertIds.map((id) => ({ id })) } : undefined,
      },
      include: INCIDENT_INCLUDE,
    });

    await addTimeline(
      incident.id,
      'CREATED',
      `Incident declared with severity ${input.severity}`,
      userId,
      { severity: input.severity }
    );

    if (input.assignedTo) {
      await addTimeline(incident.id, 'STATUS_CHANGED', 'Incident assigned on creation', userId, {
        assignedTo: input.assignedTo,
      });
    }

    return this.findById(incident.id);
  }

  async update(id: string, input: UpdateIncidentInput, userId: string) {
    await this.findById(id);

    const incident = await prisma.incident.update({
      where: { id },
      data: input,
      include: INCIDENT_INCLUDE,
    });

    await addTimeline(id, 'NOTE_ADDED', 'Incident details updated', userId, {
      fields: Object.keys(input),
    });

    return incident;
  }

  async acknowledge(id: string, userId: string) {
    const incident = await this.findById(id);
    if (incident.status !== 'OPEN') {
      throw new ConflictError(`Only OPEN incidents can be acknowledged (current: ${incident.status})`);
    }

    await prisma.incident.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedBy: userId, acknowledgedAt: new Date() },
    });
    await addTimeline(id, 'ACKNOWLEDGED', 'Incident acknowledged', userId);

    return this.findById(id);
  }

  async startInvestigating(id: string, userId: string) {
    const incident = await this.findById(id);
    if (['RESOLVED', 'CLOSED'].includes(incident.status)) {
      throw new ConflictError(`Incident is already ${incident.status}`);
    }

    await prisma.incident.update({
      where: { id },
      data: { status: 'INVESTIGATING', ...(incident.acknowledgedBy ? {} : { acknowledgedBy: userId, acknowledgedAt: new Date() }) },
    });
    await addTimeline(id, 'INVESTIGATING', 'Investigation started', userId);

    return this.findById(id);
  }

  async assign(id: string, assignedTo: string, userId: string) {
    await this.findById(id);

    const user = await prisma.user.findUnique({ where: { id: assignedTo }, select: { id: true, name: true } });
    if (!user) throw new NotFoundError('User', assignedTo);

    await prisma.incident.update({ where: { id }, data: { assignedTo } });
    await addTimeline(id, 'STATUS_CHANGED', `Assigned to ${user.name}`, userId, { assignedTo });

    return this.findById(id);
  }

  async resolve(id: string, input: ResolveIncidentInput, userId: string) {
    const incident = await this.findById(id);
    if (incident.status === 'RESOLVED' || incident.status === 'CLOSED') {
      throw new ConflictError(`Incident is already ${incident.status}`);
    }

    await prisma.incident.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedBy: userId,
        resolvedAt: new Date(),
        rootCause: input.rootCause ?? incident.rootCause,
        resolution: input.resolution ?? incident.resolution,
      },
    });
    await addTimeline(id, 'RESOLVED', input.resolution ? 'Incident resolved' : 'Incident marked resolved', userId, {
      rootCause: input.rootCause,
    });

    return this.findById(id);
  }

  async close(id: string, userId: string) {
    const incident = await this.findById(id);
    if (incident.status !== 'RESOLVED') {
      throw new ConflictError('Only RESOLVED incidents can be closed');
    }

    await prisma.incident.update({
      where: { id },
      data: { status: 'CLOSED', closedBy: userId, closedAt: new Date() },
    });
    await addTimeline(id, 'CLOSED', 'Incident closed after verification', userId);

    return this.findById(id);
  }

  async addNote(id: string, content: string, userId: string) {
    await this.findById(id);

    await prisma.incidentNote.create({ data: { incidentId: id, userId, content } });
    await addTimeline(id, 'NOTE_ADDED', content.slice(0, 200), userId);

    return this.findById(id);
  }

  async stats() {
    const [total, byStatus, bySeverity, open, resolvedLast30] = await Promise.all([
      prisma.incident.count(),
      prisma.incident.groupBy({ by: ['status'], _count: true }),
      prisma.incident.groupBy({ by: ['severity'], _count: true }),
      prisma.incident.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'] } } }),
      prisma.incident.findMany({
        where: { resolvedAt: { not: null, gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        select: { createdAt: true, resolvedAt: true },
        take: 100,
      }),
    ]);

    const mttrMinutes =
      resolvedLast30.length > 0
        ? Math.round(
            resolvedLast30.reduce((sum, row) => {
              const duration = (row.resolvedAt!.getTime() - row.createdAt.getTime()) / 60000;
              return sum + duration;
            }, 0) / resolvedLast30.length
          )
        : 0;

    const recent = await prisma.incident.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { affectedResource: { select: { id: true, name: true } } },
    });

    return {
      total,
      open,
      mttrMinutes,
      byStatus: byStatus.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: row._count }), {}),
      bySeverity: bySeverity.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.severity]: row._count }), {}),
      recent,
    };
  }
}

export const incidentService = new IncidentService();
