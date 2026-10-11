// Costs service - deterministic price book + stored estimates + forecasting.
import { prisma } from '../../main';
import { NotFoundError } from '@cloudops-hub/shared';
import { Prisma } from '@prisma/client';
import { buildCostLines, COST_ASSUMPTIONS, roundCost } from '../../services/costEngine';
import { CostListParams, ForecastParams } from './types';

const ASSUMPTIONS = COST_ASSUMPTIONS;
const round = roundCost;

export class CostService {
  async estimateForResource(resourceId: string) {
    const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resource) throw new NotFoundError('Resource', resourceId);

    const lines = buildCostLines(resource);
    const dailyCost = round(lines.reduce((sum, line) => sum + line.dailyCost, 0));
    const monthlyCost = round(lines.reduce((sum, line) => sum + line.monthlyCost, 0));
    const service = resource.type.replace(/_/g, ' ').toLowerCase();
    const existing = await prisma.costEstimate.findFirst({
      where: { resourceId: resource.id },
      orderBy: { estimatedAt: 'desc' },
    });

    const data = {
      provider: resource.provider,
      service,
      dailyCost,
      monthlyCost,
      breakdown: lines as unknown as Prisma.InputJsonValue,
      assumptions: ASSUMPTIONS,
      estimatedAt: new Date(),
    };

    if (existing) {
      return prisma.costEstimate.update({ where: { id: existing.id }, data });
    }

    return prisma.costEstimate.create({
      data: {
        resourceId: resource.id,
        resourceType: resource.type,
        ...data,
      },
    });
  }

  async estimateAll() {
    const resources = await prisma.resource.findMany({ select: { id: true } });
    let created = 0;

    for (const resource of resources) {
      const existing = await prisma.costEstimate.findFirst({ where: { resourceId: resource.id } });
      if (!existing) created += 1;
      await this.estimateForResource(resource.id);
    }

    return { resources: resources.length, created };
  }

  async ensureEstimates() {
    const count = await prisma.costEstimate.count();
    if (count === 0) {
      await this.estimateAll();
    }
  }

  async list(params: CostListParams) {
    await this.ensureEstimates();

    const where: Prisma.CostEstimateWhereInput = {};
    if (params.provider) where.provider = params.provider;
    if (params.service) where.service = params.service;
    if (params.resourceId) where.resourceId = params.resourceId;

    const [estimates, total] = await Promise.all([
      prisma.costEstimate.findMany({
        where,
        include: {
          resource: { select: { id: true, name: true, type: true, environment: true, health: true } },
        },
        orderBy: { monthlyCost: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.costEstimate.count({ where }),
    ]);

    return { estimates, total };
  }

  async findById(id: string) {
    await this.ensureEstimates();
    const estimate = await prisma.costEstimate.findUnique({
      where: { id },
      include: { resource: true },
    });
    if (!estimate) throw new NotFoundError('Cost estimate', id);
    return estimate;
  }

  async summary() {
    await this.ensureEstimates();

    const estimates = await prisma.costEstimate.findMany({
      include: { resource: { select: { id: true, name: true, type: true, environment: true } } },
    });

    const totalDaily = round(estimates.reduce((sum, row) => sum + row.dailyCost, 0));
    const totalMonthly = round(estimates.reduce((sum, row) => sum + row.monthlyCost, 0));

    const group = <T extends string | number>(rows: typeof estimates, key: (row: (typeof estimates)[number]) => T) =>
      rows.reduce<Record<string, number>>((acc, row) => {
        const bucket = String(key(row));
        acc[bucket] = round((acc[bucket] ?? 0) + row.monthlyCost);
        return acc;
      }, {});

    const byProvider = group(estimates, (row) => row.provider);
    const byService = group(estimates, (row) => row.service);
    const byEnvironment = group(
      estimates.filter((row) => row.resource),
      (row) => row.resource?.environment ?? 'unknown'
    );

    const topResources = [...estimates]
      .sort((a, b) => b.monthlyCost - a.monthlyCost)
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        resourceId: row.resourceId,
        name: row.resource?.name ?? 'unknown',
        type: row.resourceType,
        environment: row.resource?.environment,
        monthlyCost: row.monthlyCost,
        dailyCost: row.dailyCost,
      }));

    return {
      totalDaily,
      totalMonthly,
      currency: 'USD',
      resourceCount: estimates.length,
      byProvider,
      byService,
      byEnvironment,
      topResources,
      assumptions: ASSUMPTIONS,
      trend: this.trend(totalMonthly),
      updatedAt: new Date().toISOString(),
    };
  }

  /** Estimated daily spend for the last 30 days (deterministic shape). */
  private trend(totalMonthly: number) {
    const base = totalMonthly / 30.4;
    const now = new Date();

    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(now.getTime() - (29 - index) * 24 * 60 * 60 * 1000);
      const wave = Math.sin(index / 3.5) * 0.06 + Math.cos(index / 7) * 0.04;
      const drift = 1 + index * 0.0012;
      return {
        date: date.toISOString().slice(0, 10),
        value: round(base * (1 + wave) * drift),
      };
    });
  }

  async forecast(params: ForecastParams) {
    const summary = await this.summary();
    const monthly = summary.totalMonthly;
    const growthRate = 0.04; // assumed 4% month-over-month growth

    const now = new Date();
    const months = Array.from({ length: params.months }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() + index + 1, 1);
      const projected = round(monthly * Math.pow(1 + growthRate, index + 1));
      const range = round(projected * 0.08);
      return {
        month: date.toISOString().slice(0, 7),
        projected,
        low: round(projected - range),
        high: round(projected + range),
      };
    });

    return {
      currency: 'USD',
      currentMonthly: monthly,
      growthRate,
      months,
      assumptions: [...ASSUMPTIONS, 'Linear 4% month-over-month growth applied'],
    };
  }
}

export const costService = new CostService();
