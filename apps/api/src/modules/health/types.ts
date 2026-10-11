// Health module types
import { z } from 'zod';

export const healthStatusSchema = z.enum(['HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN']);

export type HealthStatusValue = z.infer<typeof healthStatusSchema>;

export interface HealthCheckState {
  status: HealthStatusValue;
  latencyMs: number;
  message: string;
  checkedAt: string;
}

export interface SystemHealthReport {
  database: HealthCheckState;
  redis: HealthCheckState;
  prometheus: HealthCheckState;
  grafana: HealthCheckState;
  opensearch: HealthCheckState;
  docker: HealthCheckState;
  kubernetes: HealthCheckState;
  aws: HealthCheckState;
  github: HealthCheckState;
  overall: HealthStatusValue;
}

export type SystemHealthChecks = Omit<SystemHealthReport, 'overall'>;

export interface ReadinessReport {
  ready: boolean;
  checks: SystemHealthChecks;
}

export interface IntegrationInfo {
  enabled: boolean;
  url: string | null;
  region?: string;
}
