// Docker service provider
import { getConfig } from '@cloudops-hub/config';
import { ServiceUnavailableError } from '@cloudops-hub/shared';

const config = getConfig();

interface ContainerConfig {
  name: string;
  image: string;
  tag: string;
  port: number;
  environmentVariables: Record<string, string>;
  cpuLimit: string;
  memoryLimit: string;
}

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: Array<{ privatePort: number; publicPort?: number; type: string }>;
  created: Date;
  state: { Status: string; Running: boolean; StartedAt: string; FinishedAt: string };
}

class DockerProvider {
  private docker: any = null;
  private initialized = false;

  private async getDocker() {
    if (this.initialized) return this.docker;

    try {
      // Dynamic import to avoid issues when Docker is not available
      const Docker = (await import('dockerode')).default;
      this.docker = new Docker({
        socketPath: config.dockerHost.replace('unix://', ''),
      });
      
      // Test connection
      await this.docker.ping();
      this.initialized = true;
      return this.docker;
    } catch (error) {
      throw new ServiceUnavailableError('Docker', 'Docker daemon not available. Enable Docker integration or check Docker daemon.');
    }
  }

  async validateImage(image: string, tag: string): Promise<void> {
    if (!config.enableDockerIntegration) {
      // In demo mode, just validate format
      if (!image || !tag) {
        throw new Error('Image and tag are required');
      }
      return;
    }

    const docker = await this.getDocker();
    
    try {
      // Check if image exists locally or pull it
      const images = await docker.listImages({ filters: { reference: [`${image}:${tag}`] } });
      if (images.length === 0) {
        // Try to pull the image
        await this.pullImage(image, tag);
      }
    } catch (error) {
      throw new Error(`Failed to validate image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async pullImage(image: string, tag: string): Promise<void> {
    const docker = await this.getDocker();
    
    return new Promise((resolve, reject) => {
      docker.pull(`${image}:${tag}`, (err: Error, stream: any) => {
        if (err) return reject(err);
        
        docker.modem.followProgress(stream, (err: Error) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  async createContainer(options: ContainerConfig): Promise<string> {
    if (!config.enableDockerIntegration) {
      // Demo mode - return fake container ID
      return `demo-container-${Date.now()}`;
    }

    const docker = await this.getDocker();

    const container = await docker.createContainer({
      Image: `${options.image}:${options.tag}`,
      name: options.name,
      Env: Object.entries(options.environmentVariables).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        PortBindings: {
          [`${options.port}/tcp`]: [{ HostPort: `${options.port}` }],
        },
        CpuQuota: this.parseCpuLimit(options.cpuLimit),
        Memory: this.parseMemoryLimit(options.memoryLimit),
        RestartPolicy: { Name: 'unless-stopped' },
      },
      ExposedPorts: {
        [`${options.port}/tcp`]: {},
      },
    });

    await container.start();
    return container.id;
  }

  async startContainer(id: string): Promise<void> {
    if (!config.enableDockerIntegration) return;
    
    const docker = await this.getDocker();
    const container = docker.getContainer(id);
    await container.start();
  }

  async stopContainer(id: string): Promise<void> {
    if (!config.enableDockerIntegration) return;
    
    const docker = await this.getDocker();
    const container = docker.getContainer(id);
    await container.stop();
  }

  async restartContainer(id: string): Promise<void> {
    if (!config.enableDockerIntegration) return;
    
    const docker = await this.getDocker();
    const container = docker.getContainer(id);
    await container.restart();
  }

  async removeContainer(id: string): Promise<void> {
    if (!config.enableDockerIntegration) return;
    
    const docker = await this.getDocker();
    const container = docker.getContainer(id);
    await container.remove({ force: true });
  }

  async getContainer(id: string): Promise<ContainerInfo | null> {
    if (!config.enableDockerIntegration) {
      return null;
    }

    const docker = await this.getDocker();
    const container = docker.getContainer(id);
    
    try {
      const info = await container.inspect();
      return {
        id: info.Id,
        name: info.Name.replace('/', ''),
        image: info.Config.Image,
        status: info.State.Status,
        ports: info.NetworkSettings.Ports ? Object.entries(info.NetworkSettings.Ports).flatMap(([key, value]: [string, any]) => 
          value?.map((v: any) => ({ privatePort: parseInt(key.split('/')[0]), publicPort: parseInt(v.HostPort), type: key.split('/')[1] })) || []
        ) : [],
        created: new Date(info.Created),
        state: {
          Status: info.State.Status,
          Running: info.State.Running,
          StartedAt: info.State.StartedAt,
          FinishedAt: info.State.FinishedAt,
        },
      };
    } catch {
      return null;
    }
  }

  async listContainers(all: boolean = true): Promise<ContainerInfo[]> {
    if (!config.enableDockerIntegration) {
      return [];
    }

    const docker = await this.getDocker();
    const containers = await docker.listContainers({ all });
    
    return containers.map((c: any) => ({
      id: c.Id,
      name: c.Names[0]?.replace('/', '') || '',
      image: c.Image,
      status: c.Status,
      ports: c.Ports?.map((p: any) => ({ privatePort: p.PrivatePort, publicPort: p.PublicPort, type: p.Type })) || [],
      created: new Date(c.Created * 1000),
      state: { Status: c.State, Running: c.State === 'running', StartedAt: '', FinishedAt: '' },
    }));
  }

  async getLogs(id: string, lines: number = 100): Promise<string> {
    if (!config.enableDockerIntegration) {
      return `=== Demo logs (Docker not available) ===\nContainer ID: ${id}\nLines requested: ${lines}\nEnable Docker integration to view real logs.`;
    }

    const docker = await this.getDocker();
    const container = docker.getContainer(id);
    
    return new Promise((resolve, reject) => {
      container.logs({ stdout: true, stderr: true, tail: lines, follow: false }, (err: Error, stream: any) => {
        if (err) return reject(err);
        
        let output = '';
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        stream.on('end', () => resolve(output));
        stream.on('error', reject);
      });
    });
  }

  async getStats(id: string): Promise<{ cpu: number; memory: number; networkIn: number; networkOut: number } | null> {
    if (!config.enableDockerIntegration) {
      return null;
    }

    const docker = await this.getDocker();
    const container = docker.getContainer(id);
    
    try {
      const stats = await container.stats({ stream: false });
      
      // Calculate CPU percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 * (stats.cpu_stats.online_cpus || 1) : 0;
      
      // Calculate memory percentage
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 1;
      const memoryPercent = (memoryUsage / memoryLimit) * 100;
      
      // Network
      const networkIn = Object.values(stats.networks || {}).reduce((sum: number, n: any) => sum + (n.rx_bytes || 0), 0);
      const networkOut = Object.values(stats.networks || {}).reduce((sum: number, n: any) => sum + (n.tx_bytes || 0), 0);
      
      return {
        cpu: Math.round(cpuPercent * 100) / 100,
        memory: Math.round(memoryPercent * 100) / 100,
        networkIn,
        networkOut,
      };
    } catch {
      return null;
    }
  }

  private parseCpuLimit(limit: string): number {
    // Parse Kubernetes-style CPU limits (e.g., "500m" -> 50000)
    if (limit.endsWith('m')) {
      return parseInt(limit.slice(0, -1)) * 100;
    }
    return parseFloat(limit) * 100000; // 1 CPU = 100000
  }

  private parseMemoryLimit(limit: string): number {
    // Parse Kubernetes-style memory limits (e.g., "512Mi" -> bytes)
    const units: Record<string, number> = {
      'K': 1000, 'M': 1000000, 'G': 1000000000,
      'Ki': 1024, 'Mi': 1048576, 'Gi': 1073741824,
    };
    
    for (const [unit, multiplier] of Object.entries(units)) {
      if (limit.endsWith(unit)) {
        return parseFloat(limit.slice(0, -unit.length)) * multiplier;
      }
    }
    return parseFloat(limit) * 1048576; // Default to Mi
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    if (!config.enableDockerIntegration) {
      return { status: 'DEMO', message: 'Running in demo mode (Docker integration disabled)' };
    }

    try {
      const docker = await this.getDocker();
      await docker.ping();
      const info = await docker.info();
      return { status: 'HEALTHY', message: `Docker ${info.ServerVersion} running` };
    } catch (error) {
      return { 
        status: 'UNHEALTHY', 
        message: `Docker daemon unavailable: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
}

export const dockerProvider = new DockerProvider();