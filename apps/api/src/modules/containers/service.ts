// Containers service
import { dockerProvider } from '../../services/docker';
import { ServiceUnavailableError } from '@cloudops-hub/shared';
import { ContainerFilterParams } from './types';
import { getConfig } from '@cloudops-hub/config';
import { createPaginationMeta } from '@cloudops-hub/shared';

const config = getConfig();

export class ContainerService {
  async list(params: ContainerFilterParams) {
    if (!config.enableDockerIntegration) {
      // Return demo containers
      const demoContainers = [
        {
          id: 'demo-container-1',
          name: 'web-app',
          image: 'nginx:latest',
          status: 'running',
          ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp' }],
          created: new Date(Date.now() - 86400000),
          state: { Status: 'running', Running: true, StartedAt: new Date().toISOString(), FinishedAt: '' },
          cpuUsage: 12.5,
          memoryUsage: 45.2,
          memoryLimit: 536870912,
        },
        {
          id: 'demo-container-2',
          name: 'api-server',
          image: 'node:20-alpine',
          status: 'running',
          ports: [{ privatePort: 3000, publicPort: 3000, type: 'tcp' }],
          created: new Date(Date.now() - 172800000),
          state: { Status: 'running', Running: true, StartedAt: new Date().toISOString(), FinishedAt: '' },
          cpuUsage: 25.3,
          memoryUsage: 62.1,
          memoryLimit: 1073741824,
        },
        {
          id: 'demo-container-3',
          name: 'redis-cache',
          image: 'redis:7-alpine',
          status: 'running',
          ports: [{ privatePort: 6379, publicPort: 6379, type: 'tcp' }],
          created: new Date(Date.now() - 259200000),
          state: { Status: 'running', Running: true, StartedAt: new Date().toISOString(), FinishedAt: '' },
          cpuUsage: 3.2,
          memoryUsage: 15.8,
          memoryLimit: 268435456,
        },
      ];

      let filtered = demoContainers;
      if (params.status) {
        filtered = filtered.filter(c => c.status === params.status);
      }
      if (params.name) {
        filtered = filtered.filter(c => c.name.includes(params.name!));
      }

      const { page = 1, limit = 20 } = params;
      const total = filtered.length;
      const start = (page - 1) * limit;
      const data = filtered.slice(start, start + limit);

      return {
        data,
        pagination: createPaginationMeta(params, total),
      };
    }

    const containers = await dockerProvider.listContainers(true);
    
    // Get stats for each container
    const containersWithStats = await Promise.all(
      containers.map(async (c) => {
        const stats = await dockerProvider.getStats(c.id);
        return {
          ...c,
          cpuUsage: stats?.cpu || 0,
          memoryUsage: stats?.memory || 0,
        };
      })
    );

    let filtered = containersWithStats;
    if (params.status) {
      filtered = filtered.filter(c => c.status.toLowerCase().includes(params.status!.toLowerCase()));
    }
    if (params.name) {
      filtered = filtered.filter(c => c.name.toLowerCase().includes(params.name!.toLowerCase()));
    }

    const { page = 1, limit = 20 } = params;
    const total = filtered.length;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return {
      data,
      pagination: createPaginationMeta(params, total),
    };
  }

  async get(id: string) {
    if (!config.enableDockerIntegration) {
      // Demo container
      return {
        id: 'demo-container-1',
        name: 'web-app',
        image: 'nginx:latest',
        status: 'running',
        ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp' }],
        created: new Date(Date.now() - 86400000),
        state: { Status: 'running', Running: true, StartedAt: new Date().toISOString(), FinishedAt: '' },
        cpuUsage: 12.5,
        memoryUsage: 45.2,
        memoryLimit: 536870912,
        networkIn: 1024000,
        networkOut: 2048000,
      };
    }

    const container = await dockerProvider.getContainer(id);
    if (!container) {
      throw new ServiceUnavailableError('Container', 'Container not found');
    }

    const stats = await dockerProvider.getStats(id);

    return {
      ...container,
      cpuUsage: stats?.cpu || 0,
      memoryUsage: stats?.memory || 0,
      networkIn: stats?.networkIn || 0,
      networkOut: stats?.networkOut || 0,
    };
  }

  async start(id: string) {
    if (!config.enableDockerIntegration) {
      return { success: true, message: 'Container started (demo mode)' };
    }
    await dockerProvider.startContainer(id);
    return { success: true, message: 'Container started' };
  }

  async stop(id: string) {
    if (!config.enableDockerIntegration) {
      return { success: true, message: 'Container stopped (demo mode)' };
    }
    await dockerProvider.stopContainer(id);
    return { success: true, message: 'Container stopped' };
  }

  async restart(id: string) {
    if (!config.enableDockerIntegration) {
      return { success: true, message: 'Container restarted (demo mode)' };
    }
    await dockerProvider.restartContainer(id);
    return { success: true, message: 'Container restarted' };
  }

  async remove(id: string) {
    if (!config.enableDockerIntegration) {
      return { success: true, message: 'Container removed (demo mode)' };
    }
    await dockerProvider.removeContainer(id);
    return { success: true, message: 'Container removed' };
  }

  async logs(id: string, lines: number = 100) {
    return dockerProvider.getLogs(id, lines);
  }

  async stats(id: string) {
    if (!config.enableDockerIntegration) {
      return {
        cpu: 12.5,
        memory: 45.2,
        networkIn: 1024000,
        networkOut: 2048000,
      };
    }
    return dockerProvider.getStats(id);
  }

  async healthCheck() {
    return dockerProvider.healthCheck();
  }
}

export const containerService = new ContainerService();