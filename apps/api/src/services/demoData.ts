// Pure demo/telemetry data helpers.
// Kept free of database imports so both the seed script and the live
// background workers can reuse them.
import type { LogSeverity } from '@prisma/client';

export interface DemoLog {
  timestamp: Date;
  severity: LogSeverity;
  source: string;
  message: string;
  fields: Record<string, unknown>;
  traceId?: string;
}

export const LOG_SOURCES = [
  'api-gateway',
  'auth-service',
  'deployment-service',
  'billing-worker',
  'postgres',
  'nginx-ingress',
  'kube-scheduler',
  'docker-daemon',
  'prometheus',
] as const;

const LOG_TEMPLATES: Record<LogSeverity, string[]> = {
  DEBUG: [
    'Cache lookup completed for key user:{id} in {ms}ms',
    'Rendered view "dashboard" in {ms}ms',
    'Connection pool stats: active={n} idle={n} waiting=0',
    'Resolved config value feature.enableTracing=false',
  ],
  INFO: [
    'GET /api/resources 200 {ms}ms',
    'POST /api/deployments 201 {ms}ms',
    'Health check passed for service {name}',
    'Scheduled job "metrics-snapshot" completed in {ms}ms',
    'User session established for ops@cloudops.local',
    'Container {name} started successfully',
    'Scaled deployment {name} to {n} replicas',
  ],
  WARN: [
    'Response time degraded: {ms}ms (threshold 500ms)',
    'Retrying failed downstream call attempt 2/3',
    'Disk usage above 80% on volume /dev/xvda1',
    'Connection pool nearing capacity: active={n}',
    'Deprecated API version /api/v1 used by client',
  ],
  ERROR: [
    'Upstream connection refused: payments-service:8080',
    'Failed to write metric batch: connection reset',
    'Query failed: deadlock detected on table deployments',
    'Deployment rollout failed: image pull error for {name}',
    'Unhandled rejection in request handler',
  ],
  FATAL: [
    'Out of memory killer terminated process node',
    'Database connection lost, entering read-only mode',
  ],
};

const SEVERITY_WEIGHTS: Array<{ severity: LogSeverity; weight: number }> = [
  { severity: 'DEBUG', weight: 0.12 },
  { severity: 'INFO', weight: 0.58 },
  { severity: 'WARN', weight: 0.18 },
  { severity: 'ERROR', weight: 0.1 },
  { severity: 'FATAL', weight: 0.02 },
];

function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.abs(Math.floor(seed)) % items.length];
}

function randomHex(length: number, seed: number): string {
  let value = Math.abs(Math.floor(seed)) + 1;
  let out = '';
  for (let i = 0; i < length; i += 1) {
    value = (value * 1103515245 + 12345) % 2147483647;
    out += '0123456789abcdef'[value % 16];
  }
  return out;
}

export function pickSeverity(seed: number): LogSeverity {
  const roll = (Math.abs(seed) % 1000) / 1000;
  let acc = 0;
  for (const entry of SEVERITY_WEIGHTS) {
    acc += entry.weight;
    if (roll <= acc) return entry.severity;
  }
  return 'INFO';
}

/** Builds a single synthetic log entry. */
export function createLogEntry(options: {
  timestamp?: Date;
  severity?: LogSeverity;
  source?: string;
  seed?: number;
}): DemoLog {
  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000);
  const severity = options.severity ?? pickSeverity(seed);
  const source = options.source ?? pick(LOG_SOURCES, seed);
  const template = pick(LOG_TEMPLATES[severity], seed >> 3);
  const ms = 5 + (Math.abs(seed) % 480);
  const n = 1 + (Math.abs(seed) % 12);

  const message = template
    .replace('{ms}', String(ms))
    .replace('{n}', String(n))
    .replace('{id}', String(1000 + (Math.abs(seed) % 9000)))
    .replace('{name}', pick(['web-frontend', 'api-backend', 'billing-worker', 'ingress'], seed >> 5));

  return {
    timestamp: options.timestamp ?? new Date(),
    severity,
    source,
    message,
    fields: {
      service: source,
      environment: 'production',
      region: 'us-east-1',
      durationMs: ms,
      thread: `worker-${n}`,
    },
    traceId: randomHex(32, seed),
  };
}

/** Creates `count` log entries spread across the last `minutes` minutes. */
export function generateLogHistory(count: number, minutes: number, now = new Date()): DemoLog[] {
  const entries: DemoLog[] = [];
  const spanMs = minutes * 60 * 1000;

  for (let i = 0; i < count; i += 1) {
    const seed = i * 7919 + 13;
    const offset = Math.floor((i / count) * spanMs);
    entries.push(createLogEntry({ seed, timestamp: new Date(now.getTime() - spanMs + offset) }));
  }

  return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/** Builds a small batch of fresh log entries for the live tail. */
export function generateLogBatch(count: number, now = new Date()): DemoLog[] {
  return Array.from({ length: count }, (_, index) =>
    createLogEntry({ timestamp: new Date(now.getTime() - index * 900), seed: Math.floor(Math.random() * 1_000_000) })
  );
}
