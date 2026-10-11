// AWS service - inventory, costs and resource synchronisation.
import { prisma } from '../../main';
import { ServiceUnavailableError } from '@cloudops-hub/shared';
import { Prisma } from '@prisma/client';
import type { ResourceStatus } from '@prisma/client';
import { getConfig, features } from '@cloudops-hub/config';
import {
  getAwsHealth,
  getAwsIdentity,
  getAwsInventory,
  isAwsCliAvailable,
} from '../../services/aws';
import { AWS_SERVICE_CATALOGUE, AwsSyncResult } from './types';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mergeMetadata(existing: unknown, additions: Record<string, unknown>): Prisma.InputJsonObject {
  return { ...asRecord(existing), ...additions } as Prisma.InputJsonObject;
}

function mapInstanceStatus(state: string): ResourceStatus {
  switch (state.toLowerCase()) {
    case 'running':
      return 'RUNNING';
    case 'pending':
    case 'initializing':
      return 'PENDING';
    case 'stopping':
    case 'stopped':
    case 'shutting-down':
    case 'terminated':
      return 'STOPPED';
    case 'rebooting':
      return 'PENDING';
    default:
      return 'UNKNOWN';
  }
}

function zeroedCosts() {
  return {
    totals: { dailyCost: 0, monthlyCost: 0, currency: 'USD', estimateCount: 0 },
    byService: [] as Array<{ service: string; dailyCost: number; monthlyCost: number }>,
    topResources: [] as Array<{
      resourceId: string;
      resourceName: string;
      resourceType: string;
      service: string;
      dailyCost: number;
      monthlyCost: number;
    }>,
  };
}

export class AwsService {
  async getStatus() {
    const config = getConfig();

    const [cliAvailable, health, identity] = await Promise.all([
      isAwsCliAvailable().catch(() => false),
      getAwsHealth().catch(() => ({ ok: false, latencyMs: 0, message: 'AWS health check failed' })),
      getAwsIdentity().catch(() => null),
    ]);

    return {
      enabled: features.aws(),
      region: config.awsRegion,
      cliAvailable,
      identity,
      health,
    };
  }

  async getInventory() {
    let inventory: Awaited<ReturnType<typeof getAwsInventory>>;
    try {
      inventory = await getAwsInventory();
    } catch (err) {
      throw new ServiceUnavailableError(
        'AWS',
        err instanceof Error ? err.message : 'Unable to collect AWS inventory'
      );
    }

    const resources = await prisma.resource.findMany({
      where: { provider: { contains: 'AWS', mode: 'insensitive' } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    return {
      source: inventory.source,
      region: inventory.region,
      identity: inventory.identity ?? null,
      collectedAt: inventory.collectedAt,
      instances: inventory.instances,
      buckets: inventory.buckets,
      resources,
    };
  }

  /** AWS spend from stored estimates. Degrades to a zeroed shape, never throws. */
  async getCosts() {
    const where: Prisma.CostEstimateWhereInput = {
      provider: { contains: 'AWS', mode: 'insensitive' },
    };

    try {
      const [totals, groups, top] = await Promise.all([
        prisma.costEstimate.aggregate({
          where,
          _sum: { dailyCost: true, monthlyCost: true },
          _count: { _all: true },
        }),
        prisma.costEstimate.groupBy({
          by: ['service'],
          where,
          _sum: { dailyCost: true, monthlyCost: true },
          orderBy: { _sum: { monthlyCost: 'desc' } },
        }),
        prisma.costEstimate.findMany({
          where,
          orderBy: { monthlyCost: 'desc' },
          take: 5,
          include: { resource: { select: { id: true, name: true } } },
        }),
      ]);

      if (totals._count._all === 0) {
        return zeroedCosts();
      }

      return {
        totals: {
          dailyCost: round2(totals._sum.dailyCost ?? 0),
          monthlyCost: round2(totals._sum.monthlyCost ?? 0),
          currency: 'USD',
          estimateCount: totals._count._all,
        },
        byService: groups.map((group) => ({
          service: group.service,
          dailyCost: round2(group._sum.dailyCost ?? 0),
          monthlyCost: round2(group._sum.monthlyCost ?? 0),
        })),
        topResources: top.map((row) => ({
          resourceId: row.resourceId,
          resourceName: row.resource?.name ?? 'unknown',
          resourceType: row.resourceType,
          service: row.service,
          dailyCost: round2(row.dailyCost),
          monthlyCost: round2(row.monthlyCost),
        })),
      };
    } catch (err) {
      console.warn('AWS cost summary failed:', err);
      return zeroedCosts();
    }
  }

  /** Re-fetches AWS inventory and reconciles EC2_INSTANCE / S3_BUCKET rows. */
  async sync(): Promise<AwsSyncResult> {
    let inventory: Awaited<ReturnType<typeof getAwsInventory>>;
    try {
      inventory = await getAwsInventory();
    } catch (err) {
      throw new ServiceUnavailableError(
        'AWS',
        err instanceof Error ? err.message : 'Unable to collect AWS inventory'
      );
    }

    const syncedAt = new Date().toISOString();
    let created = 0;
    let updated = 0;

    for (const instance of inventory.instances) {
      const status = mapInstanceStatus(instance.state);
      const metadata = {
        instanceId: instance.instanceId,
        instanceType: instance.instanceType,
        state: instance.state,
        publicIp: instance.publicIp ?? null,
        privateIp: instance.privateIp ?? null,
        availabilityZone: instance.availabilityZone ?? null,
        launchTime: instance.launchTime ?? null,
        source: inventory.source,
        syncedAt,
      };

      const existing = await this.findEc2(instance.instanceId, instance.name);

      if (existing) {
        await prisma.resource.update({
          where: { id: existing.id },
          data: {
            status,
            provider: 'AWS',
            region: inventory.region,
            metadata: mergeMetadata(existing.metadata, metadata),
            lastHealthCheckAt: new Date(),
          },
        });
        updated += 1;
      } else {
        await prisma.resource.create({
          data: {
            name: instance.name,
            type: 'EC2_INSTANCE',
            provider: 'AWS',
            environment: 'unknown',
            region: inventory.region,
            status,
            health: 'UNKNOWN',
            tags: {},
            metadata,
          },
        });
        created += 1;
      }
    }

    for (const bucket of inventory.buckets) {
      const metadata = {
        bucketName: bucket.name,
        bucketRegion: bucket.region,
        sizeGb: bucket.sizeGb ?? null,
        creationDate: bucket.creationDate ?? null,
        source: inventory.source,
        syncedAt,
      };

      const existing = await this.findBucket(bucket.name);

      if (existing) {
        await prisma.resource.update({
          where: { id: existing.id },
          data: {
            status: 'RUNNING',
            provider: 'AWS',
            region: bucket.region || inventory.region,
            metadata: mergeMetadata(existing.metadata, metadata),
            lastHealthCheckAt: new Date(),
          },
        });
        updated += 1;
      } else {
        await prisma.resource.create({
          data: {
            name: bucket.name,
            type: 'S3_BUCKET',
            provider: 'AWS',
            environment: 'unknown',
            region: bucket.region || inventory.region,
            status: 'RUNNING',
            health: 'UNKNOWN',
            tags: {},
            metadata,
          },
        });
        created += 1;
      }
    }

    return { created, updated, source: inventory.source };
  }

  /** Catalogue of AWS services the platform consumes, status derived from data. */
  async getServices() {
    const [groups, metricCount] = await Promise.all([
      prisma.resource.groupBy({
        by: ['type'],
        where: { provider: { contains: 'AWS', mode: 'insensitive' } },
        _count: true,
      }),
      prisma.metricSnapshot.count(),
    ]);

    const counts: Record<string, number> = {};
    for (const group of groups) {
      counts[group.type] = group._count;
    }

    return AWS_SERVICE_CATALOGUE.map((definition) => {
      const resourceCount = definition.resourceTypes.reduce(
        (sum, type) => sum + (counts[type] ?? 0),
        0
      );
      const observed = definition.service === 'CloudWatch' ? metricCount : resourceCount;
      const status: 'active' | 'not-tracked' = observed > 0 ? 'active' : 'not-tracked';

      return {
        service: definition.service,
        label: definition.label,
        description: definition.description,
        enabled: features.aws(),
        resourceCount,
        status,
      };
    });
  }

  // ---------- matching helpers ----------

  private async findEc2(instanceId: string, name: string) {
    try {
      return await prisma.resource.findFirst({
        where: {
          type: 'EC2_INSTANCE',
          provider: { contains: 'AWS', mode: 'insensitive' },
          OR: [
            { name },
            { name: instanceId },
            { metadata: { path: ['instanceId'], equals: instanceId } },
          ],
        },
      });
    } catch {
      return prisma.resource.findFirst({
        where: {
          type: 'EC2_INSTANCE',
          OR: [{ name }, { name: instanceId }],
        },
      });
    }
  }

  private async findBucket(name: string) {
    try {
      return await prisma.resource.findFirst({
        where: {
          type: 'S3_BUCKET',
          provider: { contains: 'AWS', mode: 'insensitive' },
          OR: [{ name }, { metadata: { path: ['bucketName'], equals: name } }],
        },
      });
    } catch {
      return prisma.resource.findFirst({
        where: { type: 'S3_BUCKET', name },
      });
    }
  }
}

export const awsService = new AwsService();
