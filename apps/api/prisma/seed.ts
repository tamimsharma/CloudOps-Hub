// Database seed: demo role accounts, infrastructure, telemetry, incidents and reports.
// The three demo role accounts (admin/engineer/viewer) back the one-click role
// login cards on the sign-in screen. Accounts registered through the app are
// never deleted by a re-seed.
// Run with: npm run db:seed --workspace=apps/api
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateLogHistory } from '../src/services/demoData';
import { buildCostLines, summarizeLines, COST_ASSUMPTIONS } from '../src/services/costEngine';

const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface SeedResource {
  id: string;
  name: string;
  type:
    | 'EC2_INSTANCE'
    | 'DOCKER_CONTAINER'
    | 'KUBERNETES_CLUSTER'
    | 'S3_BUCKET'
    | 'DATABASE'
    | 'LOAD_BALANCER'
    | 'APPLICATION';
  provider: string;
  environment: string;
  region: string;
  status: 'RUNNING' | 'STOPPED' | 'PENDING' | 'ERROR' | 'UNKNOWN';
  health: 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIn: number;
  networkOut: number;
  metadata: Record<string, unknown>;
}

const resources: SeedResource[] = [
  { id: 'res-prod-web-01', name: 'prod-web-01', type: 'EC2_INSTANCE', provider: 'AWS', environment: 'production', region: 'us-east-1', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 34.2, memoryUsage: 51.4, diskUsage: 42.1, networkIn: 6.4, networkOut: 3.1, metadata: { instanceType: 't3.large', diskGb: 50, role: 'web' } },
  { id: 'res-prod-api-01', name: 'prod-api-01', type: 'EC2_INSTANCE', provider: 'AWS', environment: 'production', region: 'us-east-1', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 58.7, memoryUsage: 66.2, diskUsage: 55.8, networkIn: 12.8, networkOut: 9.2, metadata: { instanceType: 'c6i.xlarge', diskGb: 80, role: 'api' } },
  { id: 'res-prod-worker-01', name: 'prod-worker-01', type: 'EC2_INSTANCE', provider: 'AWS', environment: 'production', region: 'us-east-1', status: 'RUNNING', health: 'WARNING', cpuUsage: 91.4, memoryUsage: 88.1, diskUsage: 74.3, networkIn: 4.2, networkOut: 2.6, metadata: { instanceType: 'm5.xlarge', diskGb: 100, role: 'worker' } },
  { id: 'res-staging-web-01', name: 'staging-web-01', type: 'EC2_INSTANCE', provider: 'AWS', environment: 'staging', region: 'us-east-1', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 12.5, memoryUsage: 31.9, diskUsage: 28.4, networkIn: 1.1, networkOut: 0.8, metadata: { instanceType: 't3.medium', diskGb: 30, role: 'web' } },
  { id: 'res-postgres', name: 'cloudops-postgres', type: 'DOCKER_CONTAINER', provider: 'DOCKER', environment: 'development', region: 'local', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 22.6, memoryUsage: 47.5, diskUsage: 38.2, networkIn: 3.4, networkOut: 2.9, metadata: { cpuMilli: 1000, memGb: 2, image: 'postgres:16-alpine' } },
  { id: 'res-redis', name: 'cloudops-redis', type: 'DOCKER_CONTAINER', provider: 'DOCKER', environment: 'development', region: 'local', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 4.8, memoryUsage: 18.3, diskUsage: 12.1, networkIn: 1.9, networkOut: 1.7, metadata: { cpuMilli: 300, memGb: 0.5, image: 'redis:7-alpine' } },
  { id: 'res-prometheus', name: 'cloudops-prometheus', type: 'DOCKER_CONTAINER', provider: 'DOCKER', environment: 'development', region: 'local', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 18.9, memoryUsage: 54.7, diskUsage: 61.3, networkIn: 8.6, networkOut: 1.2, metadata: { cpuMilli: 500, memGb: 1, image: 'prom/prometheus:v2.48.0' } },
  { id: 'res-grafana', name: 'cloudops-grafana', type: 'DOCKER_CONTAINER', provider: 'DOCKER', environment: 'development', region: 'local', status: 'RUNNING', health: 'WARNING', cpuUsage: 82.4, memoryUsage: 69.8, diskUsage: 44.9, networkIn: 2.2, networkOut: 3.8, metadata: { cpuMilli: 400, memGb: 0.75, image: 'grafana/grafana:10.2.2' } },
  { id: 'res-opensearch', name: 'cloudops-opensearch', type: 'DOCKER_CONTAINER', provider: 'DOCKER', environment: 'development', region: 'local', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 36.1, memoryUsage: 71.2, diskUsage: 58.6, networkIn: 5.1, networkOut: 4.4, metadata: { cpuMilli: 1000, memGb: 2, image: 'opensearchproject/opensearch:2.11.0' } },
  { id: 'res-eks-cluster', name: 'cloudops-prod-eks', type: 'KUBERNETES_CLUSTER', provider: 'AWS', environment: 'production', region: 'us-east-1', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 47.3, memoryUsage: 62.8, diskUsage: 51.2, networkIn: 18.4, networkOut: 11.7, metadata: { nodes: 3, version: 'v1.28.0' } },
  { id: 'res-artifacts', name: 'cloudops-hub-artifacts', type: 'S3_BUCKET', provider: 'AWS', environment: 'production', region: 'us-east-1', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 0, memoryUsage: 0, diskUsage: 42.7, networkIn: 0.6, networkOut: 2.1, metadata: { sizeGb: 42.7, requestsMillions: 3.2 } },
  { id: 'res-backups', name: 'cloudops-hub-backups', type: 'S3_BUCKET', provider: 'AWS', environment: 'production', region: 'us-east-1', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 0, memoryUsage: 0, diskUsage: 128.4, networkIn: 1.4, networkOut: 0.2, metadata: { sizeGb: 128.4, requestsMillions: 0.4 } },
  { id: 'res-database', name: 'cloudops-primary-db', type: 'DATABASE', provider: 'AWS', environment: 'production', region: 'us-east-1', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 41.8, memoryUsage: 73.5, diskUsage: 64.2, networkIn: 9.7, networkOut: 8.3, metadata: { storageGb: 200, engine: 'postgres 16' } },
  { id: 'res-nlb', name: 'cloudops-public-nlb', type: 'LOAD_BALANCER', provider: 'AWS', environment: 'production', region: 'us-east-1', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 9.2, memoryUsage: 12.4, diskUsage: 0, networkIn: 24.6, networkOut: 21.3, metadata: { lcu: 3 } },
  { id: 'res-application', name: 'cloudops-hub', type: 'APPLICATION', provider: 'AWS', environment: 'production', region: 'us-east-1', status: 'RUNNING', health: 'HEALTHY', cpuUsage: 39.4, memoryUsage: 57.1, diskUsage: 33.6, networkIn: 7.2, networkOut: 5.9, metadata: { replicas: 2 } },
  { id: 'res-legacy-batch', name: 'legacy-batch-01', type: 'EC2_INSTANCE', provider: 'AWS', environment: 'production', region: 'us-east-1', status: 'STOPPED', health: 'UNKNOWN', cpuUsage: 0, memoryUsage: 0, diskUsage: 47.5, networkIn: 0, networkOut: 0, metadata: { instanceType: 't3.medium', diskGb: 40, role: 'batch' } },
];

async function resetData() {
  console.log('• Clearing existing demo data');
  await prisma.cICDStep.deleteMany();
  await prisma.cICDJob.deleteMany();
  await prisma.cICDRun.deleteMany();
  await prisma.cICDWorkflow.deleteMany();
  await prisma.incidentNote.deleteMany();
  await prisma.incidentTimelineEvent.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.logEntry.deleteMany();
  await prisma.metricSnapshot.deleteMany();
  await prisma.costEstimate.deleteMany();
  await prisma.deployment.deleteMany();
  await prisma.kubernetesWorkload.deleteMany();
  await prisma.kubernetesCluster.deleteMany();
  await prisma.report.deleteMany();
  await prisma.cloudAccount.deleteMany();
  await prisma.resource.deleteMany();
  // Registered accounts (and their sessions) are intentionally preserved:
  // re-seeding must never delete real users.
}

/**
 * Demo role accounts for the sign-in role cards.
 * Upserted by email so re-seeding refreshes name/role/password without ever
 * touching accounts somebody registered themselves.
 */
async function seedUsers() {
  console.log('• Demo role accounts');
  const demoUsers = [
    { id: 'user-admin', email: 'admin@cloudops.local', name: 'Ada Admin', role: 'ADMIN' as const, password: 'Admin!2345' },
    { id: 'user-engineer', email: 'engineer@cloudops.local', name: 'Evan Engineer', role: 'ENGINEER' as const, password: 'Engineer!2345' },
    { id: 'user-viewer', email: 'viewer@cloudops.local', name: 'Vera Viewer', role: 'VIEWER' as const, password: 'Viewer!2345' },
  ];

  for (const user of demoUsers) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, passwordHash, isActive: true },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        isActive: true,
      },
    });
  }
}

async function seedResources() {
  console.log('• Resources');
  for (const resource of resources) {
    await prisma.resource.create({
      data: {
        id: resource.id,
        name: resource.name,
        type: resource.type,
        provider: resource.provider,
        environment: resource.environment,
        region: resource.region,
        status: resource.status,
        health: resource.health,
        cpuUsage: resource.cpuUsage,
        memoryUsage: resource.memoryUsage,
        diskUsage: resource.diskUsage,
        networkIn: resource.networkIn,
        networkOut: resource.networkOut,
        metadata: resource.metadata as Prisma.InputJsonValue,
        tags: { managedBy: 'cloudops-hub', owner: 'platform-team' },
        lastHealthCheckAt: new Date(Date.now() - 2 * 60 * 1000),
      },
    });
  }
}

async function seedKubernetes() {
  console.log('• Kubernetes cluster and workloads');
  const cluster = await prisma.kubernetesCluster.create({
    data: {
      id: 'k8s-prod',
      name: 'cloudops-prod-eks',
      provider: 'AWS',
      region: 'us-east-1',
      version: 'v1.28.4',
      status: 'RUNNING',
      health: 'HEALTHY',
      nodeCount: 3,
      cpuCapacity: 24,
      memoryCapacity: 49152,
      endpoint: 'https://cloudops-prod-eks.gr7.us-east-1.eks.amazonaws.com',
    },
  });

  const workloads = [
    { namespace: 'default', name: 'web-frontend', desiredReplicas: 3, availableReplicas: 3, readyReplicas: 3, cpuUsage: 45.2, memoryUsage: 62.1, restartCount: 0, health: 'HEALTHY' as const, labels: { app: 'web', tier: 'frontend' } },
    { namespace: 'default', name: 'api-backend', desiredReplicas: 3, availableReplicas: 3, readyReplicas: 3, cpuUsage: 58.4, memoryUsage: 71.3, restartCount: 1, health: 'HEALTHY' as const, labels: { app: 'api', tier: 'backend' } },
    { namespace: 'default', name: 'billing-worker', desiredReplicas: 2, availableReplicas: 1, readyReplicas: 1, cpuUsage: 88.7, memoryUsage: 84.2, restartCount: 6, health: 'DEGRADED' as const, labels: { app: 'billing', tier: 'worker' } },
    { namespace: 'monitoring', name: 'prometheus-server', desiredReplicas: 1, availableReplicas: 1, readyReplicas: 1, cpuUsage: 21.4, memoryUsage: 57.8, restartCount: 0, health: 'HEALTHY' as const, labels: { app: 'prometheus' } },
    { namespace: 'logging', name: 'opensearch-master', desiredReplicas: 1, availableReplicas: 1, readyReplicas: 1, cpuUsage: 33.9, memoryUsage: 69.4, restartCount: 2, health: 'HEALTHY' as const, labels: { app: 'opensearch' } },
    { namespace: 'kube-system', name: 'coredns', desiredReplicas: 2, availableReplicas: 2, readyReplicas: 2, cpuUsage: 5.1, memoryUsage: 12.4, restartCount: 0, health: 'HEALTHY' as const, labels: { 'k8s-app': 'kube-dns' } },
    { namespace: 'kube-system', name: 'aws-node', desiredReplicas: 3, availableReplicas: 3, readyReplicas: 3, cpuUsage: 8.6, memoryUsage: 24.9, restartCount: 0, health: 'HEALTHY' as const, labels: { 'k8s-app': 'aws-node' } },
  ];

  for (const workload of workloads) {
    await prisma.kubernetesWorkload.create({
      data: {
        id: `wl-${workload.name}`,
        clusterId: cluster.id,
        kind: 'Deployment',
        status: workload.availableReplicas === workload.desiredReplicas ? 'RUNNING' : 'ERROR',
        annotations: { deployedBy: 'platform-team' },
        ...workload,
      },
    });
  }
}

async function seedDeployments() {
  console.log('• Deployments');
  const now = Date.now();
  const deployments = [
    { name: 'cloudops-web', image: 'ghcr.io/cloudops/web', tag: 'v1.8.2', port: 5173, status: 'RUNNING' as const, resourceId: 'res-application', startedAt: now - 6 * HOUR, errorMessage: null },
    { name: 'cloudops-api', image: 'ghcr.io/cloudops/api', tag: 'v1.8.2', port: 4000, status: 'RUNNING' as const, resourceId: 'res-application', startedAt: now - 6 * HOUR, errorMessage: null },
    { name: 'billing-worker', image: 'ghcr.io/cloudops/billing', tag: 'v0.9.1', port: 8081, status: 'FAILED' as const, resourceId: null, startedAt: now - 3 * HOUR, errorMessage: 'image pull failed: manifest unknown for ghcr.io/cloudops/billing:v0.9.1' },
    { name: 'log-shipper', image: 'ghcr.io/cloudops/log-shipper', tag: 'v2.1.0', port: 8082, status: 'RUNNING' as const, resourceId: 'res-opensearch', startedAt: now - 26 * HOUR, errorMessage: null },
    { name: 'metrics-exporter', image: 'ghcr.io/cloudops/metrics-exporter', tag: 'v1.2.4', port: 9100, status: 'RUNNING' as const, resourceId: 'res-prometheus', startedAt: now - 30 * HOUR, errorMessage: null },
    { name: 'search-indexer', image: 'ghcr.io/cloudops/search-indexer', tag: 'v1.0.0', port: 8083, status: 'STOPPED' as const, resourceId: null, startedAt: now - 3 * DAY, errorMessage: null },
  ];

  for (const deployment of deployments) {
    await prisma.deployment.create({
      data: {
        id: `dep-${deployment.name}`,
        name: deployment.name,
        image: deployment.image,
        tag: deployment.tag,
        port: deployment.port,
        environmentVariables: { NODE_ENV: deployment.name === 'cloudops-web' ? 'production' : 'production', LOG_LEVEL: 'info' },
        cpuLimit: '500m',
        memoryLimit: '512Mi',
        replicas: deployment.name.includes('worker') ? 2 : 1,
        status: deployment.status,
        resourceId: deployment.resourceId,
        deployedBy: null,
        startedAt: new Date(deployment.startedAt),
        completedAt: new Date(deployment.startedAt + 1000 * 95),
        errorMessage: deployment.errorMessage,
      },
    });
  }
}

async function seedMetricSnapshots() {
  console.log('• Metric snapshots (24h)');
  const rows: Array<{
    resourceId: string;
    resourceType: SeedResource['type'];
    metricType: 'CPU_USAGE' | 'MEMORY_USAGE' | 'DISK_USAGE' | 'NETWORK_IN' | 'NETWORK_OUT';
    value: number;
    unit: string;
    timestamp: Date;
    labels: Record<string, string>;
  }> = [];

  const now = Date.now();
  for (const resource of resources) {
    if (resource.status !== 'RUNNING') continue;

    const series: Array<[typeof rows[number]['metricType'], number, string]> = [
      ['CPU_USAGE', resource.cpuUsage, 'percent'],
      ['MEMORY_USAGE', resource.memoryUsage, 'percent'],
      ['DISK_USAGE', resource.diskUsage, 'percent'],
      ['NETWORK_IN', resource.networkIn, 'MB/s'],
      ['NETWORK_OUT', resource.networkOut, 'MB/s'],
    ];

    for (const [metricType, base, unit] of series) {
      for (let hour = 24; hour >= 0; hour -= 1) {
        const phase = Math.sin((24 - hour) / 3.4) * 0.12 + Math.cos((24 - hour) / 6.1) * 0.07;
        const value = Math.max(0, Math.round(base * (1 + phase) * 100) / 100);
        rows.push({
          resourceId: resource.id,
          resourceType: resource.type,
          metricType,
          value,
          unit,
          timestamp: new Date(now - hour * HOUR),
          labels: { source: 'seed' },
        });
      }
    }
  }

  await prisma.metricSnapshot.createMany({ data: rows });
  console.log(`    ${rows.length} metric snapshots`);
}

async function seedLogs() {
  console.log('• Log entries');
  const entries = generateLogHistory(600, 24 * 60);
  await prisma.logEntry.createMany({
    data: entries.map((entry) => ({
      timestamp: entry.timestamp,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      fields: entry.fields as Prisma.InputJsonValue,
      traceId: entry.traceId ?? null,
    })),
  });
}

async function seedAlerts() {
  console.log('• Alerts');
  const now = Date.now();
  const alerts = [
    { title: 'CPU usage critical (prod-worker-01)', description: 'CPU usage is at 91.4% (critical threshold 92% approaching). Sustained above 90% for 12 minutes.', severity: 'CRITICAL' as const, status: 'FIRING' as const, resourceId: 'res-prod-worker-01', source: 'rule-engine', age: 40 * 60 * 1000, rule: 'cpu_high' },
    { title: 'Memory usage elevated (cloudops-grafana)', description: 'Memory usage is at 82.4% (warning threshold 80%).', severity: 'WARNING' as const, status: 'ACKNOWLEDGED' as const, resourceId: 'res-grafana', source: 'rule-engine', age: 3 * HOUR, rule: 'memory_high' },
    { title: 'Pod restart loop (billing-worker)', description: 'Container billing-worker restarted 6 times in the last 15 minutes.', severity: 'CRITICAL' as const, status: 'FIRING' as const, resourceId: 'res-eks-cluster', source: 'prometheus', age: 70 * 60 * 1000, rule: 'pod_restarts' },
    { title: 'High p95 latency on api-gateway', description: 'p95 latency above 800ms for 5 consecutive minutes.', severity: 'WARNING' as const, status: 'FIRING' as const, resourceId: 'res-nlb', source: 'prometheus', age: 5 * HOUR, rule: 'latency_p95' },
    { title: 'Disk usage elevated (cloudops-prometheus)', description: 'Disk usage is at 61.3% and growing ~1.2%/day.', severity: 'INFO' as const, status: 'RESOLVED' as const, resourceId: 'res-prometheus', source: 'rule-engine', age: 9 * HOUR, rule: 'disk_high' },
    { title: 'Deployment failed (billing-worker)', description: 'image pull failed: manifest unknown for ghcr.io/cloudops/billing:v0.9.1', severity: 'CRITICAL' as const, status: 'ACKNOWLEDGED' as const, resourceId: 'res-application', source: 'rule-engine', age: 3 * HOUR, rule: 'deployment_failed' },
    { title: 'Certificate expiring in 14 days', description: 'TLS certificate for cloudops.local expires on the 19th.', severity: 'WARNING' as const, status: 'RESOLVED' as const, resourceId: 'res-nlb', source: 'manual', age: 20 * HOUR, rule: 'cert_expiry' },
    { title: 'Instance stopped (legacy-batch-01)', description: 'EC2 instance legacy-batch-01 was stopped by schedule.', severity: 'INFO' as const, status: 'RESOLVED' as const, resourceId: 'res-legacy-batch', source: 'aws', age: 26 * HOUR, rule: 'instance_state' },
  ];

  for (const alert of alerts) {
    const createdAt = new Date(now - alert.age);
    const acknowledged = alert.status === 'ACKNOWLEDGED' || alert.status === 'RESOLVED';
    const resolved = alert.status === 'RESOLVED';

    await prisma.alert.create({
      data: {
        id: `alert-${alert.rule}-${alert.resourceId}`,
        title: alert.title,
        description: alert.description,
        severity: alert.severity,
        status: alert.status,
        source: alert.source,
        resourceId: alert.resourceId,
        metadata: { rule: alert.rule },
        createdAt,
        updatedAt: createdAt,
        // No seeded operators exist, so attribution stays empty; timestamps remain.
        acknowledgedBy: null,
        acknowledgedAt: acknowledged ? new Date(createdAt.getTime() + 10 * 60 * 1000) : null,
        resolvedBy: null,
        resolvedAt: resolved ? new Date(createdAt.getTime() + 45 * 60 * 1000) : null,
      },
    });
  }
}

async function seedIncidents() {
  console.log('• Incidents');
  const now = Date.now();

  const incidents = [
    {
      id: 'inc-db-latency',
      title: 'Database latency spike affecting checkout',
      description: 'Checkout requests timing out because primary DB p99 latency rose above 2s.',
      severity: 'SEV1' as const,
      status: 'INVESTIGATING' as const,
      affectedResourceId: 'res-database',
      age: 2 * HOUR,
      assignedTo: null,
      acknowledgedBy: null,
      rootCause: null,
      resolution: null,
      timeline: [
        { type: 'CREATED' as const, description: 'Incident declared after checkout error rate crossed 5%', offset: 0 },
        { type: 'ACKNOWLEDGED' as const, description: 'On-call engineer acknowledged', offset: 4 },
        { type: 'INVESTIGATING' as const, description: 'Inspecting slow queries and connection pool saturation', offset: 12 },
        { type: 'NOTE_ADDED' as const, description: 'Connection pool max_connections=100, currently 98 in use', offset: 38 },
      ],
      notes: ['Increasing connection pool and enabling pgbouncer next.', 'Awaiting approval from DBA for failover test.'],
    },
    {
      id: 'inc-worker-cpu',
      title: 'Worker fleet CPU saturation',
      description: 'prod-worker-01 running above 90% CPU for extended periods, delaying jobs.',
      severity: 'SEV2' as const,
      status: 'ACKNOWLEDGED' as const,
      affectedResourceId: 'res-prod-worker-01',
      age: 6 * HOUR,
      assignedTo: null,
      acknowledgedBy: null,
      rootCause: null,
      resolution: null,
      timeline: [
        { type: 'CREATED' as const, description: 'Opened by alert rule cpu_high', offset: 0 },
        { type: 'ACKNOWLEDGED' as const, description: 'Engineer acknowledged and started profiling', offset: 15 },
      ],
      notes: ['Profiling shows batch job re-processing failed messages.'],
    },
    {
      id: 'inc-deploy-failure',
      title: 'Failed deployment of billing-worker v0.9.1',
      description: 'Rollout failed because the image tag could not be pulled from the registry.',
      severity: 'SEV3' as const,
      status: 'RESOLVED' as const,
      affectedResourceId: 'res-application',
      age: 30 * HOUR,
      assignedTo: null,
      acknowledgedBy: null,
      resolvedBy: null,
      rootCause: 'CI pipeline published the image under a different tag convention.',
      resolution: 'Re-tagged the image as v0.9.1 and re-ran the deployment successfully.',
      timeline: [
        { type: 'CREATED' as const, description: 'Opened by alert rule deployment_failed', offset: 0 },
        { type: 'ACKNOWLEDGED' as const, description: 'Acknowledged by on-call', offset: 8 },
        { type: 'INVESTIGATING' as const, description: 'Checked registry manifests and CI output', offset: 20 },
        { type: 'RESOLVED' as const, description: 'Image re-tagged and deployment rolled out', offset: 95 },
      ],
      notes: ['Adding a CI step to verify tag names before push.'],
    },
    {
      id: 'inc-grafana-memory',
      title: 'Grafana container memory pressure',
      description: 'Grafana exceeded its memory limit twice and was OOM restarted.',
      severity: 'SEV4' as const,
      status: 'CLOSED' as const,
      affectedResourceId: 'res-grafana',
      age: 3 * DAY,
      assignedTo: null,
      acknowledgedBy: null,
      resolvedBy: null,
      closedBy: null,
      rootCause: 'Unbounded dashboard query cache.',
      resolution: 'Raised container memory limit to 1Gi and capped the query cache.',
      timeline: [
        { type: 'CREATED' as const, description: 'Opened by alert rule memory_high', offset: 0 },
        { type: 'RESOLVED' as const, description: 'Memory limit raised and cache capped', offset: 240 },
        { type: 'CLOSED' as const, description: 'Verified stable for 24h, closing', offset: 1500 },
      ],
      notes: ['Follow-up: add memory alerts for all containers.'],
    },
  ];

  for (const incident of incidents) {
    const createdAt = new Date(now - incident.age);
    const timelineFor = (offsetMinutes: number) => new Date(createdAt.getTime() + offsetMinutes * 60 * 1000);

    await prisma.incident.create({
      data: {
        id: incident.id,
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        status: incident.status,
        affectedResourceId: incident.affectedResourceId,
        affectedResourceType: 'DATABASE',
        assignedTo: incident.assignedTo,
        acknowledgedBy: incident.acknowledgedBy,
        // Timestamps are kept even though no operator is attributed.
        acknowledgedAt: timelineFor(10),
        resolvedBy: incident.resolvedBy,
        resolvedAt: ['RESOLVED', 'CLOSED'].includes(incident.status) ? timelineFor(120) : null,
        closedBy: incident.closedBy,
        closedAt: incident.status === 'CLOSED' ? timelineFor(1500) : null,
        rootCause: incident.rootCause,
        resolution: incident.resolution,
        createdAt,
        updatedAt: createdAt,
        timeline: {
          create: incident.timeline.map((event) => ({
            type: event.type,
            description: event.description,
            userId: null,
            createdAt: timelineFor(event.offset),
          })),
        },
        notes: {
          create: incident.notes.map((content, index) => ({
            userId: null,
            content,
            createdAt: timelineFor(30 + index * 20),
          })),
        },
      },
    });
  }
}

async function seedCosts() {
  console.log('• Cost estimates');
  for (const resource of resources) {
    const lines = buildCostLines({ type: resource.type, name: resource.name, metadata: resource.metadata });
    const { dailyCost, monthlyCost } = summarizeLines(lines);

    await prisma.costEstimate.create({
      data: {
        resourceId: resource.id,
        resourceType: resource.type,
        provider: resource.provider,
        service: resource.type.replace(/_/g, ' ').toLowerCase(),
        dailyCost,
        monthlyCost,
        breakdown: lines as unknown as Prisma.InputJsonValue,
        assumptions: COST_ASSUMPTIONS,
      },
    });
  }
}

async function seedCicd() {
  console.log('• CI/CD workflows and runs');
  const workflows = [
    { id: 'wf-ci', name: 'CI Pipeline', repository: 'cloudops-hub', branch: 'main', trigger: 'PUSH' as const },
    { id: 'wf-deploy', name: 'Deploy to AWS', repository: 'cloudops-hub', branch: 'main', trigger: 'PUSH' as const },
    { id: 'wf-release', name: 'Release', repository: 'cloudops-hub', branch: 'main', trigger: 'MANUAL' as const },
  ];

  const now = Date.now();
  let runCounter = 0;

  for (const workflow of workflows) {
    await prisma.cICDWorkflow.create({
      data: {
        id: workflow.id,
        name: workflow.name,
        repository: workflow.repository,
        branch: workflow.branch,
        trigger: workflow.trigger,
        status: 'SUCCESS',
        lastRunAt: new Date(now - 2 * HOUR),
        lastRunStatus: 'SUCCESS',
      },
    });

    for (let index = 0; index < 3; index += 1) {
      runCounter += 1;
      const status = index === 0 ? 'SUCCESS' : index === 1 ? 'SUCCESS' : 'FAILURE';
      const startedAt = new Date(now - (index + 1) * 7 * HOUR);
      const durationMs = 180000 + index * 45000;
      const runId = `run-${workflow.id}-${index}`;

      await prisma.cICDRun.create({
        data: {
          id: runId,
          workflowId: workflow.id,
          runNumber: 1000 + runCounter,
          trigger: workflow.trigger === 'PUSH' ? 'push' : 'workflow_dispatch',
          branch: workflow.branch,
          commitSha: (runCounter * 982451653).toString(16).padStart(12, '0').slice(0, 12),
          status,
          startedAt,
          completedAt: new Date(startedAt.getTime() + durationMs),
          duration: Math.round(durationMs / 1000),
          url: `https://github.com/cloudops/cloudops-hub/actions/runs/${1000 + runCounter}`,
          createdAt: startedAt,
          jobs: {
            create: ['build', 'test', status === 'FAILURE' ? 'deploy' : 'deploy'].map((jobName, jobIndex) => ({
              id: `${runId}-${jobName}`,
              name: jobName,
              status: status === 'FAILURE' && jobName === 'deploy' ? 'FAILURE' : jobIndex < 2 || status === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
              startedAt: new Date(startedAt.getTime() + jobIndex * 40000),
              completedAt: new Date(startedAt.getTime() + jobIndex * 40000 + 40000),
              steps: {
                create: [
                  { name: 'Checkout code', status: 'SUCCESS' as const },
                  { name: 'Setup toolchain', status: 'SUCCESS' as const },
                  { name: jobName === 'test' ? 'Run unit tests' : jobName === 'deploy' ? 'Deploy to AWS' : 'Build container images', status: status === 'FAILURE' && jobName === 'deploy' ? ('FAILURE' as const) : ('SUCCESS' as const) },
                ].map((step, stepIndex) => ({
                  name: step.name,
                  status: step.status,
                  startedAt: new Date(startedAt.getTime() + jobIndex * 40000 + stepIndex * 8000),
                  completedAt: new Date(startedAt.getTime() + jobIndex * 40000 + (stepIndex + 1) * 8000),
                  output: step.status === 'FAILURE' ? 'Error: process completed with exit code 1' : 'OK',
                })),
              },
            })),
          },
        },
      });
    }
  }
}

async function seedReports() {
  console.log('• Sample reports');
  const storageDir = path.join(__dirname, '..', 'storage', 'reports');
  await mkdir(storageDir, { recursive: true });

  const reports = [
    {
      id: 'report-inventory-sample',
      name: 'Infrastructure Inventory - October 2026',
      type: 'INVENTORY' as const,
      file: 'inventory-2026-10.md',
      body: `# Infrastructure Inventory Report\n\nGenerated: ${new Date().toISOString()}\n\n| Name | Type | Provider | Environment | Status | Health |\n| --- | --- | --- | --- | --- | --- |\n${resources.map((r) => `| ${r.name} | ${r.type} | ${r.provider} | ${r.environment} | ${r.status} | ${r.health} |`).join('\n')}\n\n**Totals:** ${resources.length} resources, ${resources.filter((r) => r.status === 'RUNNING').length} running, ${resources.filter((r) => r.health !== 'HEALTHY' && r.health !== 'UNKNOWN').length} needing attention.\n`,
    },
    {
      id: 'report-health-sample',
      name: 'Platform Health Report - October 2026',
      type: 'HEALTH_REPORT' as const,
      file: 'health-2026-10.md',
      body: `# Platform Health Report\n\nGenerated: ${new Date().toISOString()}\n\n## Summary\n- Healthy: ${resources.filter((r) => r.health === 'HEALTHY').length}\n- Warning: ${resources.filter((r) => r.health === 'WARNING').length}\n- Unknown/Stopped: ${resources.filter((r) => r.health === 'UNKNOWN').length}\n\n## Unhealthy resources\n${resources.filter((r) => r.health === 'WARNING').map((r) => `- **${r.name}** - CPU ${r.cpuUsage}%, memory ${r.memoryUsage}%`).join('\n')}\n\n## Recommendations\n1. Scale prod-worker-01 horizontally before the next release window.\n2. Raise the Grafana container memory limit.\n3. Investigate billing-worker pod restarts.\n`,
    },
  ];

  for (const report of reports) {
    await writeFile(path.join(storageDir, report.file), report.body, 'utf8');
    await prisma.report.create({
      data: {
        id: report.id,
        name: report.name,
        type: report.type,
        generatedBy: null,
        status: 'COMPLETED',
        parameters: { range: '30d', sample: true },
        fileUrl: `/api/reports/${report.id}/download`,
        completedAt: new Date(Date.now() - 12 * HOUR),
        errorMessage: null,
      },
    });
  }
}

async function seedCloudAccount() {
  console.log('• Cloud account');
  await prisma.cloudAccount.create({
    data: {
      id: 'aws-main',
      name: 'CloudOps Production Account',
      provider: 'AWS',
      accountId: '123456789012',
      region: 'us-east-1',
      credentialsRef: 'env:AWS_ACCESS_KEY_ID',
      status: 'CONNECTED',
      lastSyncedAt: new Date(Date.now() - 30 * 60 * 1000),
    },
  });
}

async function main() {
  console.log('🌱 Seeding CloudOps Hub database...');
  await resetData();
  await seedUsers();
  await seedResources();
  await seedKubernetes();
  await seedDeployments();
  await seedMetricSnapshots();
  await seedLogs();
  await seedAlerts();
  await seedIncidents();
  await seedCosts();
  await seedCicd();
  await seedReports();
  await seedCloudAccount();

  console.log('');
  console.log('✅ Seed complete');
  console.log('   Demo role logins (one-click cards on the sign-in screen):');
  console.log('     admin@cloudops.local    / Admin!2345     (ADMIN)');
  console.log('     engineer@cloudops.local / Engineer!2345  (ENGINEER)');
  console.log('     viewer@cloudops.local   / Viewer!2345    (VIEWER)');
  console.log('   Or register your own account - the first one registered becomes ADMIN.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
