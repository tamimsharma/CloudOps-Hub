// Kubernetes service
import { prisma } from '../../main';
import { HealthStatus, ResourceStatus } from '@prisma/client';
import { NotFoundError, ValidationError, ServiceUnavailableError } from '@cloudops-hub/shared';
import { CreateClusterInput, UpdateClusterInput, ClusterFilterParams, ScaleWorkloadInput } from './types';
import { createPaginationMeta } from '@cloudops-hub/shared';
import { getConfig } from '@cloudops-hub/config';
import { kubernetesProvider } from '../../services/kubernetes';

const config = getConfig();

export class KubernetesService {
  // Cluster operations
  async createCluster(input: CreateClusterInput) {
    // Validate connection if Kubernetes integration is enabled
    if (config.enableKubernetesIntegration) {
      try {
        await kubernetesProvider.testConnection(input.endpoint, input.kubeconfigRef);
      } catch (error) {
        throw new ValidationError(`Cannot connect to Kubernetes cluster: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const cluster = await prisma.kubernetesCluster.create({
      data: {
        ...input,
        status: 'PENDING',
        health: 'UNKNOWN',
      },
    });

    // Sync cluster info asynchronously
    this.syncClusterAsync(cluster.id).catch(console.error);

    return cluster;
  }

  private async syncClusterAsync(clusterId: string) {
    try {
      const cluster = await prisma.kubernetesCluster.findUnique({ where: { id: clusterId } });
      if (!cluster) return;

      if (config.enableKubernetesIntegration) {
        const info = await kubernetesProvider.getClusterInfo(cluster.endpoint, cluster.kubeconfigRef ?? undefined);
        
        await prisma.kubernetesCluster.update({
          where: { id: clusterId },
          data: {
            status: 'RUNNING',
            health: 'HEALTHY',
            version: info.version,
            nodeCount: info.nodeCount,
            cpuCapacity: info.cpuCapacity,
            memoryCapacity: info.memoryCapacity,
          },
        });

        // Sync workloads
        await this.syncWorkloads(clusterId);
      } else {
        // Demo mode
        await prisma.kubernetesCluster.update({
          where: { id: clusterId },
          data: {
            status: 'RUNNING',
            health: 'HEALTHY',
            version: 'v1.28.0',
            nodeCount: 3,
            cpuCapacity: 24,
            memoryCapacity: 49152,
          },
        });

        // Create demo workloads
        await this.createDemoWorkloads(clusterId);
      }
    } catch (error) {
      await prisma.kubernetesCluster.update({
        where: { id: clusterId },
        data: {
          status: 'ERROR',
          health: 'CRITICAL',
        },
      });
    }
  }

  private async createDemoWorkloads(clusterId: string) {
    const demoWorkloads = [
      {
        clusterId,
        namespace: 'default',
        name: 'web-frontend',
        kind: 'Deployment' as const,
        desiredReplicas: 3,
        availableReplicas: 3,
        readyReplicas: 3,
        cpuUsage: 45.2,
        memoryUsage: 62.1,
        restartCount: 0,
        status: 'RUNNING' as const,
        health: 'HEALTHY' as const,
        labels: { app: 'web', tier: 'frontend' },
        annotations: { description: 'Frontend web application' },
      },
      {
        clusterId,
        namespace: 'default',
        name: 'api-backend',
        kind: 'Deployment' as const,
        desiredReplicas: 2,
        availableReplicas: 2,
        readyReplicas: 2,
        cpuUsage: 38.5,
        memoryUsage: 71.3,
        restartCount: 1,
        status: 'RUNNING' as const,
        health: 'HEALTHY' as const,
        labels: { app: 'api', tier: 'backend' },
        annotations: { description: 'Backend API service' },
      },
      {
        clusterId,
        namespace: 'kube-system',
        name: 'coredns',
        kind: 'Deployment' as const,
        desiredReplicas: 2,
        availableReplicas: 2,
        readyReplicas: 2,
        cpuUsage: 5.1,
        memoryUsage: 12.4,
        restartCount: 0,
        status: 'RUNNING' as const,
        health: 'HEALTHY' as const,
        labels: { 'k8s-app': 'kube-dns' },
        annotations: {},
      },
    ];

    for (const workload of demoWorkloads) {
      const existing = await prisma.kubernetesWorkload.findFirst({
        where: {
          clusterId: workload.clusterId,
          namespace: workload.namespace,
          name: workload.name,
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.kubernetesWorkload.update({ where: { id: existing.id }, data: workload });
      } else {
        await prisma.kubernetesWorkload.create({ data: workload });
      }
    }
  }

  private async syncWorkloads(clusterId: string) {
    const cluster = await prisma.kubernetesCluster.findUnique({ where: { id: clusterId } });
    if (!cluster) return;

    const workloads = await kubernetesProvider.getWorkloads(cluster.endpoint, cluster.kubeconfigRef ?? undefined);
    
    for (const w of workloads) {
      const status = w.status as ResourceStatus;
      const health = w.health as HealthStatus;
      const payload = { ...w, status, health };

      const existing = await prisma.kubernetesWorkload.findFirst({
        where: { clusterId, namespace: w.namespace, name: w.name },
        select: { id: true },
      });

      if (existing) {
        await prisma.kubernetesWorkload.update({ where: { id: existing.id }, data: payload });
      } else {
        await prisma.kubernetesWorkload.create({ data: { clusterId, ...payload } });
      }
    }
  }

  async findClusters(params: ClusterFilterParams) {
    const { page, limit, sortBy, sortOrder, provider, region, status } = params;

    const where: Record<string, unknown> = {};
    if (provider) where.provider = provider;
    if (region) where.region = region;
    if (status) where.status = status;

    const [clusters, total] = await Promise.all([
      prisma.kubernetesCluster.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder || 'asc' } : { createdAt: 'desc' },
        include: {
          _count: { select: { workloads: true } },
        },
      }),
      prisma.kubernetesCluster.count({ where }),
    ]);

    return { clusters, total };
  }

  async findClusterById(id: string) {
    const cluster = await prisma.kubernetesCluster.findUnique({
      where: { id },
      include: {
        workloads: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!cluster) {
      throw new NotFoundError('Kubernetes Cluster', id);
    }

    return cluster;
  }

  async updateCluster(id: string, input: UpdateClusterInput) {
    await this.findClusterById(id);

    const cluster = await prisma.kubernetesCluster.update({
      where: { id },
      data: input,
    });

    return cluster;
  }

  async deleteCluster(id: string) {
    await this.findClusterById(id);
    await prisma.kubernetesCluster.delete({ where: { id } });
  }

  async syncCluster(id: string) {
    await this.findClusterById(id);
    await this.syncClusterAsync(id);
    return { success: true, message: 'Cluster sync initiated' };
  }

  // Workload operations
  async findAllWorkloads(clusterId?: string, namespace?: string, status?: string) {
    const where: Record<string, unknown> = {};
    if (clusterId) where.clusterId = clusterId;
    if (namespace) where.namespace = namespace;
    if (status) where.status = status;

    return prisma.kubernetesWorkload.findMany({
      where,
      orderBy: [{ namespace: 'asc' }, { name: 'asc' }],
      include: {
        cluster: { select: { id: true, name: true, provider: true, region: true } },
      },
    });
  }

  async findWorkloads(clusterId: string, namespace?: string) {
    const where: Record<string, unknown> = { clusterId };
    if (namespace) where.namespace = namespace;

    const workloads = await prisma.kubernetesWorkload.findMany({
      where,
      orderBy: [{ namespace: 'asc' }, { name: 'asc' }],
    });

    return workloads;
  }

  async findWorkloadById(id: string) {
    const workload = await prisma.kubernetesWorkload.findUnique({
      where: { id },
      include: { cluster: true },
    });

    if (!workload) {
      throw new NotFoundError('Kubernetes Workload', id);
    }

    return workload;
  }

  async scaleWorkload(id: string, input: ScaleWorkloadInput) {
    const workload = await this.findWorkloadById(id);

    if (config.enableKubernetesIntegration) {
      await kubernetesProvider.scaleWorkload(
        workload.cluster.endpoint,
        workload.cluster.kubeconfigRef ?? undefined,
        workload.namespace,
        workload.name,
        input.replicas
      );
    }

    await prisma.kubernetesWorkload.update({
      where: { id },
      data: { desiredReplicas: input.replicas },
    });

    return { success: true, message: `Scaled to ${input.replicas} replicas` };
  }

  async restartWorkload(id: string) {
    const workload = await this.findWorkloadById(id);

    if (config.enableKubernetesIntegration) {
      await kubernetesProvider.restartWorkload(
        workload.cluster.endpoint,
        workload.cluster.kubeconfigRef ?? undefined,
        workload.namespace,
        workload.name
      );
    }

    await prisma.kubernetesWorkload.update({
      where: { id },
      data: { restartCount: { increment: 1 } },
    });

    return { success: true, message: 'Workload restart initiated' };
  }

  async getWorkloadLogs(id: string, lines: number = 100) {
    const workload = await this.findWorkloadById(id);

    if (config.enableKubernetesIntegration) {
      return kubernetesProvider.getLogs(
        workload.cluster.endpoint,
        workload.cluster.kubeconfigRef ?? undefined,
        workload.namespace,
        workload.name,
        lines
      );
    }

    return `=== Demo logs for ${workload.name} ===\n[${new Date().toISOString()}] Pod started\n[${new Date().toISOString()}] Container ready\n[${new Date().toISOString()}] Health check passed\n`;
  }

  async getWorkloadEvents(id: string) {
    const workload = await this.findWorkloadById(id);

    if (config.enableKubernetesIntegration) {
      return kubernetesProvider.getEvents(
        workload.cluster.endpoint,
        workload.cluster.kubeconfigRef ?? undefined,
        workload.namespace,
        workload.name
      );
    }

    return [
      { type: 'Normal', reason: 'Created', message: `Created pod ${workload.name}`, timestamp: new Date().toISOString() },
      { type: 'Normal', reason: 'Started', message: 'Started container', timestamp: new Date().toISOString() },
    ];
  }

  async getClusterStats() {
    const [totalClusters, clustersByStatus, totalWorkloads, workloadsByStatus] = await Promise.all([
      prisma.kubernetesCluster.count(),
      prisma.kubernetesCluster.groupBy({ by: ['status'], _count: true }),
      prisma.kubernetesWorkload.count(),
      prisma.kubernetesWorkload.groupBy({ by: ['status'], _count: true }),
    ]);

    return {
      totalClusters,
      clustersByStatus: clustersByStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
      totalWorkloads,
      workloadsByStatus: workloadsByStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
    };
  }
}

export const kubernetesService = new KubernetesService();