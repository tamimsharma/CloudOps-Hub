// Frontend domain types (mirrors the API response shapes).

export type Role = 'ADMIN' | 'ENGINEER' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
export type ResourceStatus = 'RUNNING' | 'STOPPED' | 'PENDING' | 'ERROR' | 'UNKNOWN';

export interface Resource {
  id: string;
  name: string;
  type: string;
  provider: string;
  environment: string;
  region: string;
  status: ResourceStatus;
  health: HealthStatus;
  cpuUsage?: number | null;
  memoryUsage?: number | null;
  diskUsage?: number | null;
  networkIn?: number | null;
  networkOut?: number | null;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
  lastHealthCheckAt?: string;
  createdAt?: string;
}

export type DeploymentStatus =
  | 'PENDING'
  | 'BUILDING'
  | 'DEPLOYING'
  | 'RUNNING'
  | 'FAILED'
  | 'STOPPED'
  | 'ROLLED_BACK';

export interface Deployment {
  id: string;
  name: string;
  image: string;
  tag: string;
  port: number;
  replicas: number;
  status: DeploymentStatus;
  resourceId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  resource?: { id: string; name: string; type: string; health: HealthStatus } | null;
  user?: { id: string; name: string; email: string };
}

export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  created?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  memoryLimit?: number;
  ports?: Array<{ privatePort: number; publicPort?: number; type: string }>;
  state?: { Status: string; Running: boolean; StartedAt?: string };
}

export interface K8sCluster {
  id: string;
  name: string;
  provider: string;
  region: string;
  version: string;
  status: ResourceStatus;
  health: HealthStatus;
  nodeCount: number;
  cpuCapacity: number;
  memoryCapacity: number;
  endpoint: string;
  _count?: { workloads: number };
}

export interface K8sWorkload {
  id: string;
  clusterId: string;
  namespace: string;
  name: string;
  kind: string;
  desiredReplicas: number;
  availableReplicas: number;
  readyReplicas: number;
  cpuUsage?: number | null;
  memoryUsage?: number | null;
  restartCount: number;
  status: ResourceStatus;
  health: HealthStatus;
  labels?: Record<string, string>;
  cluster?: { id: string; name: string; provider: string; region: string };
}

export interface MetricPoint {
  timestamp: number;
  value: number;
}

export interface MetricSeries {
  metric: string;
  unit: string;
  points: MetricPoint[];
  source: 'prometheus' | 'simulated' | 'database';
}

export interface MetricsOverview {
  cpu: { value: number; unit: string };
  memory: { value: number; unit: string };
  disk: { value: number; unit: string };
  networkIn: { value: number; unit: string };
  networkOut: { value: number; unit: string };
  requests: { value: number; unit: string };
  errors: { value: number; unit: string };
  latency: { value: number; unit: string };
  resources: number;
  uptimeSeconds: number;
  source: string;
  updatedAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  severity: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  source: string;
  message: string;
  resourceId?: string | null;
  traceId?: string | null;
  fields?: Record<string, unknown>;
}

export interface LogStats {
  total: number;
  range: string;
  bySeverity: Record<string, number>;
  bySource: Array<{ source: string; count: number }>;
  errorRate: number;
  timeline: Array<{ timestamp: string; count: number; errors: number }>;
  source: string;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  source: string;
  status: 'FIRING' | 'ACKNOWLEDGED' | 'RESOLVED';
  resourceId?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  resource?: { id: string; name: string; type: string } | null;
  acknowledgedByUser?: { id: string; name: string } | null;
  resolvedByUser?: { id: string; name: string } | null;
}

export interface AlertStats {
  range: string;
  total: number;
  open: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  bySource: Array<{ source: string; count: number }>;
  recent: Alert[];
}

export type IncidentSeverity = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';

export interface IncidentTimelineEvent {
  id: string;
  type: string;
  description: string;
  userId?: string | null;
  createdAt: string;
}

export interface IncidentNote {
  id: string;
  content: string;
  createdAt: string;
  user?: { id: string; name: string; email: string };
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affectedResourceId?: string | null;
  assignedTo?: string | null;
  rootCause?: string | null;
  resolution?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  affectedResource?: { id: string; name: string; type: string } | null;
  assignedToUser?: { id: string; name: string; email: string } | null;
  alerts?: Array<{ id: string; title: string; severity: string; status: string; createdAt: string }>;
  timeline?: IncidentTimelineEvent[];
  notes?: IncidentNote[];
  _count?: { notes: number; timeline: number };
}

export interface IncidentStats {
  total: number;
  open: number;
  mttrMinutes: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  recent: Incident[];
}

export interface CostLine {
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  dailyCost: number;
  monthlyCost: number;
}

export interface CostEstimate {
  id: string;
  resourceId: string;
  resourceType: string;
  provider: string;
  service: string;
  dailyCost: number;
  monthlyCost: number;
  currency: string;
  breakdown: CostLine[];
  assumptions: string[];
  estimatedAt: string;
  resource?: { id: string; name: string; type: string; environment: string; health: HealthStatus };
}

export interface CostSummary {
  totalDaily: number;
  totalMonthly: number;
  currency: string;
  resourceCount: number;
  byProvider: Record<string, number>;
  byService: Record<string, number>;
  byEnvironment: Record<string, number>;
  topResources: Array<{
    id: string;
    resourceId: string;
    name: string;
    type: string;
    environment?: string;
    monthlyCost: number;
    dailyCost: number;
  }>;
  assumptions: string[];
  trend: Array<{ date: string; value: number }>;
}

export interface CostForecast {
  currency: string;
  currentMonthly: number;
  growthRate: number;
  months: Array<{ month: string; projected: number; low: number; high: number }>;
  assumptions: string[];
}

export interface Report {
  id: string;
  name: string;
  type: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  fileUrl?: string | null;
  errorMessage?: string | null;
  parameters?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string | null;
  generatedByUser?: { id: string; name: string; email: string };
}

export interface CicdWorkflow {
  id: string;
  name: string;
  repository: string;
  branch: string;
  trigger: string;
  status: string;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  runs?: CicdRun[];
}

export interface CicdStep {
  id?: string;
  name: string;
  status: string;
  startedAt?: string;
  completedAt?: string | null;
  output?: string | null;
}

export interface CicdJob {
  id: string;
  name: string;
  status: string;
  startedAt?: string;
  completedAt?: string | null;
  steps: CicdStep[];
}

export interface CicdRun {
  id: string;
  workflowId: string;
  runNumber: number;
  trigger: string;
  branch: string;
  commitSha: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  duration?: number | null;
  url: string;
  workflow?: { id: string; name: string };
  jobs?: CicdJob[];
}

export interface HealthCheck {
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  checkedAt?: string;
}

export interface SystemHealth {
  database: HealthCheck;
  redis: HealthCheck;
  prometheus: HealthCheck;
  grafana: HealthCheck;
  opensearch: HealthCheck;
  docker: HealthCheck;
  kubernetes: HealthCheck;
  aws: HealthCheck;
  github: HealthCheck;
  overall: HealthStatus;
}

export interface DashboardSummary {
  generatedAt: string;
  healthScore: number;
  uptimeSeconds: number;
  metricsSource: string;
  resources: {
    total: number;
    byStatus: Record<string, number>;
    byHealth: Record<string, number>;
    avgCpu: number;
    avgMemory: number;
  };
  deployments: {
    byStatus: Record<string, number>;
    total: number;
    recent: Array<{ id: string; name: string; status: string; createdAt: string; image: string; tag: string }>;
  };
  kubernetes: { clusters: number; workloads: number; ready: number };
  alerts: {
    open: number;
    critical: number;
    bySeverity: Record<string, number>;
    recent: Array<{ id: string; title: string; severity: string; status: string; createdAt: string }>;
  };
  incidents: {
    open: number;
    stats: { byStatus: Record<string, number>; bySeverity: Record<string, number> };
  };
  costs: {
    totalMonthly: number;
    totalDaily: number;
    currency: string;
    topResources: CostSummary['topResources'];
    trend: Array<{ date: string; value: number }>;
  };
  logs: { total24h: number; errorRate: number; bySeverity: Record<string, number> };
  series: Array<{ metric: string; unit: string; points: MetricPoint[] }>;
  activity: Array<{ type: string; message: string; severity: string; timestamp: string }>;
}
