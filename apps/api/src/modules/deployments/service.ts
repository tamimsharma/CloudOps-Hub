// Deployments service
import { prisma } from '../../main';
import { NotFoundError, ValidationError, ServiceUnavailableError } from '@cloudops-hub/shared';
import { CreateDeploymentInput, UpdateDeploymentInput, DeploymentFilterParams, ScaleDeploymentInput } from './types';
import { createPaginationMeta } from '@cloudops-hub/shared';
import { dockerProvider } from '../../services/docker';
import { getConfig } from '@cloudops-hub/config';

const config = getConfig();

export class DeploymentService {
  async create(input: CreateDeploymentInput, userId: string) {
    // Validate resource if provided
    if (input.resourceId) {
      const resource = await prisma.resource.findUnique({
        where: { id: input.resourceId },
      });
      if (!resource) {
        throw new NotFoundError('Resource', input.resourceId);
      }
    }

    // Validate Docker image if Docker integration is enabled
    if (config.enableDockerIntegration) {
      try {
        await dockerProvider.validateImage(input.image, input.tag);
      } catch (error) {
        throw new ValidationError(`Invalid Docker image: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const deployment = await prisma.deployment.create({
      data: {
        ...input,
        environmentVariables: input.environmentVariables || {},
        deployedBy: userId,
        status: 'PENDING',
      },
      include: {
        resource: true,
      },
    });

    // Start deployment asynchronously
    this.deployAsync(deployment.id).catch(console.error);

    return deployment;
  }

  private async deployAsync(deploymentId: string) {
    try {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'DEPLOYING', startedAt: new Date() },
      });

      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
      });

      if (!deployment) return;

      if (config.enableDockerIntegration) {
        // Deploy using Docker provider
        const containerId = await dockerProvider.createContainer({
          name: deployment.name,
          image: deployment.image,
          tag: deployment.tag,
          port: deployment.port,
          environmentVariables: deployment.environmentVariables as Record<string, string>,
          cpuLimit: deployment.cpuLimit,
          memoryLimit: deployment.memoryLimit,
        });

        await prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: 'RUNNING',
            resourceId: containerId,
            completedAt: new Date(),
          },
        });

        // Update or create resource
        await prisma.resource.upsert({
          where: { id: containerId },
          create: {
            id: containerId,
            name: deployment.name,
            type: 'DOCKER_CONTAINER',
            provider: 'DOCKER',
            environment: 'development',
            region: 'local',
            status: 'RUNNING',
            health: 'HEALTHY',
            tags: { deploymentId },
            metadata: { image: deployment.image, tag: deployment.tag },
          },
          update: {
            status: 'RUNNING',
            health: 'HEALTHY',
            lastHealthCheckAt: new Date(),
          },
        });
      } else {
        // Demo mode - simulate deployment
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const demoResourceId = `demo-${deploymentId}`;
        
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: 'RUNNING',
            resourceId: demoResourceId,
            completedAt: new Date(),
          },
        });

        await prisma.resource.upsert({
          where: { id: demoResourceId },
          create: {
            id: demoResourceId,
            name: deployment.name,
            type: 'DOCKER_CONTAINER',
            provider: 'DEMO',
            environment: 'development',
            region: 'local',
            status: 'RUNNING',
            health: 'HEALTHY',
            tags: { deploymentId, demo: 'true' },
            metadata: { image: deployment.image, tag: deployment.tag, demo: true },
          },
          update: {
            status: 'RUNNING',
            health: 'HEALTHY',
            lastHealthCheckAt: new Date(),
          },
        });
      }
    } catch (error) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Deployment failed',
          completedAt: new Date(),
        },
      });
    }
  }

  async findAll(params: DeploymentFilterParams) {
    const { page, limit, sortBy, sortOrder, status, resourceId } = params;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (resourceId) where.resourceId = resourceId;

    const [deployments, total] = await Promise.all([
      prisma.deployment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder || 'asc' } : { createdAt: 'desc' },
        include: {
          resource: {
            select: { id: true, name: true, type: true, health: true },
          },
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.deployment.count({ where }),
    ]);

    return { deployments, total };
  }

  async findById(id: string) {
    const deployment = await prisma.deployment.findUnique({
      where: { id },
      include: {
        resource: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!deployment) {
      throw new NotFoundError('Deployment', id);
    }

    return deployment;
  }

  async update(id: string, input: UpdateDeploymentInput) {
    await this.findById(id);

    const deployment = await prisma.deployment.update({
      where: { id },
      data: input,
      include: { resource: true },
    });

    return deployment;
  }

  async delete(id: string) {
    const deployment = await this.findById(id);

    // Stop container if running
    if (deployment.resourceId && config.enableDockerIntegration) {
      try {
        await dockerProvider.stopContainer(deployment.resourceId);
        await dockerProvider.removeContainer(deployment.resourceId);
      } catch (error) {
        console.error('Failed to stop/remove container:', error);
      }
    }

    await prisma.deployment.delete({ where: { id } });
  }

  async restart(id: string) {
    const deployment = await this.findById(id);

    if (deployment.status !== 'RUNNING' && deployment.status !== 'FAILED') {
      throw new ValidationError('Can only restart RUNNING or FAILED deployments');
    }

    if (deployment.resourceId && config.enableDockerIntegration) {
      try {
        await dockerProvider.restartContainer(deployment.resourceId);
      } catch (error) {
        throw new ServiceUnavailableError('Docker', `Failed to restart container: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    await prisma.deployment.update({
      where: { id },
      data: { status: 'RUNNING', errorMessage: null },
    });

    return { success: true, message: 'Deployment restarted' };
  }

  async scale(id: string, input: ScaleDeploymentInput) {
    const deployment = await this.findById(id);

    if (deployment.status !== 'RUNNING') {
      throw new ValidationError('Can only scale RUNNING deployments');
    }

    if (config.enableDockerIntegration && deployment.resourceId) {
      // For Docker, we'd need to use Docker Swarm or Kubernetes for scaling
      // This is a simplified implementation
      throw new ValidationError('Scaling requires Kubernetes. Use Kubernetes deployments for scaling.');
    }

    await prisma.deployment.update({
      where: { id },
      data: { replicas: input.replicas },
    });

    return { success: true, message: `Scaled to ${input.replicas} replicas` };
  }

  async getLogs(id: string, lines: number = 100) {
    const deployment = await this.findById(id);

    if (!deployment.resourceId) {
      throw new NotFoundError('Container', deployment.id);
    }

    if (config.enableDockerIntegration) {
      return dockerProvider.getLogs(deployment.resourceId, lines);
    }

    // Demo logs
    return `=== Demo logs for ${deployment.name} ===\n[${new Date().toISOString()}] Container started\n[${new Date().toISOString()}] Application listening on port ${deployment.port}\n[${new Date().toISOString()}] Health check passed\n`;
  }

  async getStats() {
    const [total, byStatus] = await Promise.all([
      prisma.deployment.count(),
      prisma.deployment.groupBy({ by: ['status'], _count: true }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
    };
  }
}

export const deploymentService = new DeploymentService();