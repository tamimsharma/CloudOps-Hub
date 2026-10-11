// Health service - independent, time-boxed checks so one slow dependency
// can never block the endpoint.
import { prisma } from '../../main';
import { features, getConfig } from '@cloudops-hub/config';
import { prometheusClient } from '../../services/prometheus';
import { opensearchClient } from '../../services/opensearch';
import { dockerProvider } from '../../services/docker';
import { kubernetesProvider } from '../../services/kubernetes';
import { githubClient } from '../../services/github';
import { getAwsHealth } from '../../services/aws';
import {
  HealthCheckState,
  HealthStatusValue,
  IntegrationInfo,
  ReadinessReport,
  SystemHealthChecks,
  SystemHealthReport,
} from './types';

const CHECK_TIMEOUT_MS = 3000;
const TIMEOUT = Symbol('health-check-timeout');

interface CheckResult {
  status: HealthStatusValue;
  message: string;
  latencyMs?: number;
}

interface CheckOptions {
  errorStatus?: HealthStatusValue;
  timeoutStatus?: HealthStatusValue;
}

export class HealthService {
  async getSystemHealth(): Promise<SystemHealthReport> {
    const checkedAt = new Date().toISOString();
    const redis: HealthCheckState = {
      status: 'UNKNOWN',
      latencyMs: 0,
      message: 'Redis not configured',
      checkedAt,
    };

    const [database, prometheus, grafana, opensearch, docker, kubernetes, aws, github] =
      await Promise.all([
        this.checkDatabase(),
        this.checkPrometheus(),
        this.checkGrafana(),
        this.checkOpensearch(),
        this.checkDocker(),
        this.checkKubernetes(),
        this.checkAws(),
        this.checkGithub(),
      ]);

    const checks: HealthCheckState[] = [
      database,
      redis,
      prometheus,
      grafana,
      opensearch,
      docker,
      kubernetes,
      aws,
      github,
    ];
    const statuses = checks.map((check) => check.status);
    const overall: HealthStatusValue = statuses.includes('CRITICAL')
      ? 'CRITICAL'
      : statuses.includes('WARNING')
        ? 'WARNING'
        : 'HEALTHY';

    return {
      database,
      redis,
      prometheus,
      grafana,
      opensearch,
      docker,
      kubernetes,
      aws,
      github,
      overall,
    };
  }

  async getReady(): Promise<ReadinessReport> {
    const report = await this.getSystemHealth();
    const checks: SystemHealthChecks = {
      database: report.database,
      redis: report.redis,
      prometheus: report.prometheus,
      grafana: report.grafana,
      opensearch: report.opensearch,
      docker: report.docker,
      kubernetes: report.kubernetes,
      aws: report.aws,
      github: report.github,
    };

    return { ready: report.database.status === 'HEALTHY', checks };
  }

  getIntegrations(): Record<string, IntegrationInfo> {
    const config = getConfig();
    const githubUrl =
      config.githubOwner && config.githubRepo
        ? `https://github.com/${config.githubOwner}/${config.githubRepo}`
        : null;

    return {
      prometheus: { enabled: features.prometheus(), url: config.prometheusUrl ?? null },
      grafana: { enabled: features.grafana(), url: config.grafanaUrl ?? null },
      opensearch: { enabled: features.opensearch(), url: config.opensearchUrl ?? null },
      docker: { enabled: features.docker(), url: config.dockerHost },
      kubernetes: { enabled: features.kubernetes(), url: config.kubeconfigPath ?? null },
      aws: { enabled: features.aws(), url: null, region: config.awsRegion },
      github: { enabled: features.github(), url: githubUrl },
    };
  }

  // ---------- individual checks ----------

  private checkDatabase(): Promise<HealthCheckState> {
    return this.runCheck(
      'database',
      async () => {
        const started = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        return {
          status: 'HEALTHY',
          message: 'Database connection OK',
          latencyMs: Date.now() - started,
        };
      },
      { errorStatus: 'CRITICAL', timeoutStatus: 'CRITICAL' }
    );
  }

  private checkPrometheus(): Promise<HealthCheckState> {
    return this.runCheck('prometheus', async () => {
      const result = await prometheusClient.health();
      if (result.ok) {
        return {
          status: 'HEALTHY',
          latencyMs: result.latencyMs,
          message: result.version ? `Prometheus ${result.version} healthy` : 'Prometheus is healthy',
        };
      }
      return features.prometheus()
        ? { status: 'WARNING', latencyMs: result.latencyMs, message: 'Prometheus is unreachable' }
        : { status: 'UNKNOWN', latencyMs: 0, message: 'Prometheus integration disabled' };
    });
  }

  private checkGrafana(): Promise<HealthCheckState> {
    return this.runCheck('grafana', async () => {
      const config = getConfig();
      if (!features.grafana() || !config.grafanaUrl) {
        return { status: 'UNKNOWN', latencyMs: 0, message: 'Grafana not configured' };
      }

      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
      try {
        const response = await fetch(`${config.grafanaUrl.replace(/\/$/, '')}/api/health`, {
          signal: controller.signal,
        });
        return response.ok
          ? { status: 'HEALTHY', latencyMs: Date.now() - started, message: 'Grafana is reachable' }
          : {
              status: 'WARNING',
              latencyMs: Date.now() - started,
              message: `Grafana health endpoint returned HTTP ${response.status}`,
            };
      } finally {
        clearTimeout(timer);
      }
    });
  }

  private checkOpensearch(): Promise<HealthCheckState> {
    return this.runCheck('opensearch', async () => {
      const result = await opensearchClient.health();
      if (result.ok) {
        return {
          status: 'HEALTHY',
          latencyMs: result.latencyMs,
          message: result.status ? `OpenSearch cluster status: ${result.status}` : 'OpenSearch is healthy',
        };
      }
      return features.opensearch()
        ? { status: 'WARNING', latencyMs: result.latencyMs, message: 'OpenSearch is unreachable' }
        : { status: 'UNKNOWN', latencyMs: 0, message: 'OpenSearch integration disabled' };
    });
  }

  private checkDocker(): Promise<HealthCheckState> {
    return this.runCheck('docker', async () => {
      const result = await dockerProvider.healthCheck();
      if (result.status === 'HEALTHY') {
        return { status: 'HEALTHY', message: result.message };
      }
      if (result.status === 'DEMO' || result.status === 'UNKNOWN') {
        return { status: 'UNKNOWN', message: result.message };
      }
      return { status: 'WARNING', message: result.message };
    });
  }

  private checkKubernetes(): Promise<HealthCheckState> {
    return this.runCheck('kubernetes', async () => {
      if (!features.kubernetes()) {
        return { status: 'UNKNOWN', latencyMs: 0, message: 'Kubernetes integration disabled' };
      }
      const result = await kubernetesProvider.healthCheck();
      if (result.status === 'HEALTHY') {
        return { status: 'HEALTHY', message: result.message };
      }
      if (result.status === 'DEMO' || result.status === 'UNKNOWN') {
        return { status: 'UNKNOWN', message: result.message };
      }
      return { status: 'WARNING', message: result.message };
    });
  }

  private checkAws(): Promise<HealthCheckState> {
    return this.runCheck('aws', async () => {
      const result = await getAwsHealth();
      if (result.ok) {
        return { status: 'HEALTHY', latencyMs: result.latencyMs, message: result.message };
      }
      return features.aws()
        ? { status: 'WARNING', latencyMs: result.latencyMs, message: result.message }
        : { status: 'UNKNOWN', latencyMs: 0, message: result.message || 'AWS integration disabled' };
    });
  }

  private checkGithub(): Promise<HealthCheckState> {
    return this.runCheck('github', async () => {
      const result = await githubClient.health();
      if (result.ok) {
        return {
          status: 'HEALTHY',
          latencyMs: result.latencyMs,
          message: result.message ?? 'GitHub is reachable',
        };
      }
      return githubClient.enabled
        ? {
            status: 'WARNING',
            latencyMs: result.latencyMs,
            message: result.message ?? 'GitHub is unreachable',
          }
        : {
            status: 'UNKNOWN',
            latencyMs: 0,
            message: result.message ?? 'GitHub integration disabled',
          };
    });
  }

  // ---------- shared plumbing ----------

  /**
   * Runs a single check with a hard 3s time box. Failures and timeouts are
   * converted into a HealthCheckState instead of rejecting.
   */
  private async runCheck(
    label: string,
    fn: () => Promise<CheckResult>,
    options: CheckOptions = {}
  ): Promise<HealthCheckState> {
    const { errorStatus = 'WARNING', timeoutStatus = 'WARNING' } = options;
    const started = Date.now();

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), CHECK_TIMEOUT_MS);
    });

    try {
      const outcome = await Promise.race([Promise.resolve().then(fn), timeout]);

      if (outcome === TIMEOUT) {
        return {
          status: timeoutStatus,
          latencyMs: CHECK_TIMEOUT_MS,
          message: `${label} check timed out after ${CHECK_TIMEOUT_MS}ms`,
          checkedAt: new Date().toISOString(),
        };
      }

      return {
        status: outcome.status,
        latencyMs: outcome.latencyMs ?? Date.now() - started,
        message: outcome.message,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status: errorStatus,
        latencyMs: Date.now() - started,
        message: `${label} check failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        checkedAt: new Date().toISOString(),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export const healthService = new HealthService();
