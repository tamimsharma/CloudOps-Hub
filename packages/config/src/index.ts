// Configuration for CloudOps Hub
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

/** `DATABASE_URL` -> `databaseUrl` so SCREAMING_SNAKE_CASE env files map onto the schema. */
function toCamelCase(key: string): string {
  return key.toLowerCase().replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/**
 * Snapshot of `process.env` with both the original keys and camelCase aliases,
 * so `.env` files can use conventional SCREAMING_SNAKE_CASE names.
 */
function readEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    env[key] = value;
    const camel = toCamelCase(key);
    if (env[camel] === undefined) env[camel] = value;
  }
  return env;
}

/** `"false"` / `"0"` / `"no"` must stay falsy — `z.coerce.boolean()` would make them `true`. */
const boolFlag = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return value;
}, z.coerce.boolean());

const configSchema = z.object({
  // Application
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(4000),
  apiUrl: z.string().url().default('http://localhost:4000'),
  webUrl: z.string().url().default('http://localhost:5173'),

  // Database
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),

  // Authentication
  jwtSecret: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  jwtExpiresIn: z.string().default('15m'),
  jwtRefreshSecret: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  jwtRefreshExpiresIn: z.string().default('7d'),
  bcryptRounds: z.coerce.number().default(12),

  // AWS
  awsRegion: z.string().default('us-east-1'),
  awsAccessKeyId: z.string().optional(),
  awsSecretAccessKey: z.string().optional(),
  awsSessionToken: z.string().optional(),

  // Prometheus
  prometheusUrl: z.string().url().optional(),

  // Grafana
  grafanaUrl: z.string().url().optional(),
  grafanaApiKey: z.string().optional(),

  // OpenSearch
  opensearchUrl: z.string().url().optional(),
  opensearchUsername: z.string().optional(),
  opensearchPassword: z.string().optional(),

  // GitHub
  githubToken: z.string().optional(),
  githubOwner: z.string().optional(),
  githubRepo: z.string().optional(),

  // Docker
  dockerHost: z.string().default('unix:///var/run/docker.sock'),

  // Kubernetes
  kubeconfigPath: z.string().optional(),

  // Email
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().default(587),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().optional(),

  // Slack
  slackWebhookUrl: z.string().url().optional(),

  // Feature Flags
  enableAwsIntegration: boolFlag.default(false),
  enableKubernetesIntegration: boolFlag.default(false),
  enablePrometheusIntegration: boolFlag.default(false),
  enableGrafanaIntegration: boolFlag.default(false),
  enableOpensearchIntegration: boolFlag.default(false),
  enableDockerIntegration: boolFlag.default(false),
  enableGithubIntegration: boolFlag.default(false),

  // Rate Limiting
  rateLimitWindowMs: z.coerce.number().default(900000),
  rateLimitMaxRequests: z.coerce.number().default(100),

  // CORS
  corsOrigin: z.string().url().default('http://localhost:5173'),
});

export type Config = z.infer<typeof configSchema>;

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    const result = configSchema.safeParse(readEnv());
    if (!result.success) {
      console.error('Configuration validation failed:');
      console.error(result.error.flatten().fieldErrors);
      throw new Error('Invalid configuration');
    }
    config = result.data;
  }
  return config;
}

export function resetConfig(): void {
  config = null;
}

// Feature flag helpers
export const features = {
  aws: () => getConfig().enableAwsIntegration,
  kubernetes: () => getConfig().enableKubernetesIntegration,
  prometheus: () => getConfig().enablePrometheusIntegration,
  grafana: () => getConfig().enableGrafanaIntegration,
  opensearch: () => getConfig().enableOpensearchIntegration,
  docker: () => getConfig().enableDockerIntegration,
  github: () => getConfig().enableGithubIntegration,
} as const;