// Health check utilities
import { HealthStatus, HealthCheckResult, SystemHealth } from '@cloudops-hub/types';

export interface HealthCheckOptions {
  timeout?: number;
  critical?: boolean;
}

export async function checkHealth<T>(
  name: string,
  checkFn: () => Promise<T>,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  const { timeout = 5000, critical = true } = options;
  const start = Date.now();
  const stamp = () => new Date().toISOString() as HealthCheckResult['lastCheckedAt'];

  try {
    await Promise.race([
      checkFn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ]);

    return {
      status: 'HEALTHY',
      latency: Date.now() - start,
      message: `${name} is healthy`,
      lastCheckedAt: stamp(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      status: critical ? 'CRITICAL' : 'WARNING',
      latency: Date.now() - start,
      message: `${name} check failed: ${message}`,
      lastCheckedAt: stamp(),
    };
  }
}

export function calculateOverallHealth(checks: Record<string, HealthCheckResult>): HealthStatus {
  const statuses = Object.values(checks).map((c) => c.status);

  if (statuses.includes('CRITICAL')) return 'CRITICAL';
  if (statuses.includes('DEGRADED')) return 'DEGRADED';
  if (statuses.includes('WARNING')) return 'WARNING';
  if (statuses.includes('UNKNOWN')) return 'UNKNOWN';
  return 'HEALTHY';
}

function unknownCheck(name: string): HealthCheckResult {
  return {
    status: 'UNKNOWN',
    message: `${name} is not configured`,
    lastCheckedAt: new Date().toISOString() as HealthCheckResult['lastCheckedAt'],
  };
}

export function createSystemHealth(
  checks: Record<string, HealthCheckResult>
): SystemHealth {
  const pick = (key: string): HealthCheckResult => checks[key] ?? unknownCheck(key);

  return {
    database: pick('database'),
    redis: pick('redis'),
    prometheus: pick('prometheus'),
    grafana: pick('grafana'),
    opensearch: pick('opensearch'),
    aws: pick('aws'),
    docker: pick('docker'),
    kubernetes: pick('kubernetes'),
    overall: calculateOverallHealth(checks),
  };
}

export const commonHealthChecks = {
  database: async (prisma: unknown): Promise<HealthCheckResult> => {
    // This would be implemented with actual Prisma client
    return checkHealth('database', async () => {
      // await prisma.$queryRaw`SELECT 1`;
      return true;
    });
  },

  redis: async (redis: unknown): Promise<HealthCheckResult> => {
    return checkHealth('redis', async () => {
      // await redis.ping();
      return true;
    });
  },

  http: async (url: string, name: string): Promise<HealthCheckResult> => {
    return checkHealth(name, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return true;
      } finally {
        clearTimeout(timeout);
      }
    });
  },

  docker: async (): Promise<HealthCheckResult> => {
    return checkHealth('docker', async () => {
      // Check Docker daemon
      return true;
    }, { critical: false });
  },

  kubernetes: async (): Promise<HealthCheckResult> => {
    return checkHealth('kubernetes', async () => {
      // Check Kubernetes API
      return true;
    }, { critical: false });
  },
};