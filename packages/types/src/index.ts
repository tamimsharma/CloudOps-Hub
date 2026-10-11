// Core domain types for CloudOps Hub

export type UUID = string & { readonly brand: unique symbol };
export type ISODateString = string & { readonly brand: unique symbol };

export interface BaseEntity {
  id: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type UserRole = 'ADMIN' | 'ENGINEER' | 'VIEWER';

export interface User extends BaseEntity {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: ISODateString;
  refreshTokenHash?: string;
}

export interface RefreshToken extends BaseEntity {
  userId: UUID;
  tokenHash: string;
  expiresAt: ISODateString;
  revokedAt?: ISODateString;
}

export type ResourceType = 
  | 'EC2_INSTANCE'
  | 'DOCKER_CONTAINER'
  | 'KUBERNETES_CLUSTER'
  | 'KUBERNETES_POD'
  | 'KUBERNETES_SERVICE'
  | 'KUBERNETES_DEPLOYMENT'
  | 'S3_BUCKET'
  | 'DATABASE'
  | 'LOAD_BALANCER'
  | 'APPLICATION';

export type ResourceStatus = 'RUNNING' | 'STOPPED' | 'PENDING' | 'ERROR' | 'UNKNOWN';
export type HealthStatus = 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';

export interface Resource extends BaseEntity {
  name: string;
  type: ResourceType;
  provider: string;
  environment: string;
  region: string;
  status: ResourceStatus;
  health: HealthStatus;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  networkIn?: number;
  networkOut?: number;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  lastHealthCheckAt?: ISODateString;
}

export interface Deployment extends BaseEntity {
  name: string;
  image: string;
  tag: string;
  port: number;
  environmentVariables: Record<string, string>;
  cpuLimit: string;
  memoryLimit: string;
  replicas: number;
  status: DeploymentStatus;
  resourceId?: UUID;
  deployedBy: UUID;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  errorMessage?: string;
}

export type DeploymentStatus = 
  | 'PENDING'
  | 'BUILDING'
  | 'DEPLOYING'
  | 'RUNNING'
  | 'FAILED'
  | 'STOPPED'
  | 'ROLLED_BACK';

export interface KubernetesCluster extends BaseEntity {
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
  kubeconfigRef?: string;
}

export interface KubernetesWorkload extends BaseEntity {
  clusterId: UUID;
  namespace: string;
  name: string;
  kind: 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Job' | 'CronJob';
  desiredReplicas: number;
  availableReplicas: number;
  readyReplicas: number;
  cpuUsage?: number;
  memoryUsage?: number;
  restartCount: number;
  status: ResourceStatus;
  health: HealthStatus;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export interface MetricSnapshot extends BaseEntity {
  resourceId: UUID;
  resourceType: ResourceType;
  metricType: MetricType;
  value: number;
  unit: string;
  timestamp: ISODateString;
  labels: Record<string, string>;
}

export type MetricType = 
  | 'CPU_USAGE'
  | 'MEMORY_USAGE'
  | 'DISK_USAGE'
  | 'NETWORK_IN'
  | 'NETWORK_OUT'
  | 'CONTAINER_CPU'
  | 'CONTAINER_MEMORY'
  | 'K8S_POD_CPU'
  | 'K8S_POD_MEMORY'
  | 'K8S_NODE_CPU'
  | 'K8S_NODE_MEMORY';

export interface LogEntry extends BaseEntity {
  timestamp: ISODateString;
  severity: LogSeverity;
  source: string;
  resourceId?: UUID;
  resourceType?: ResourceType;
  message: string;
  fields: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
}

export type LogSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface Alert extends BaseEntity {
  title: string;
  description: string;
  severity: AlertSeverity;
  source: string;
  resourceId?: UUID;
  resourceType?: ResourceType;
  status: AlertStatus;
  acknowledgedBy?: UUID;
  acknowledgedAt?: ISODateString;
  resolvedBy?: UUID;
  resolvedAt?: ISODateString;
  metadata: Record<string, unknown>;
}

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'FIRING' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface Incident extends BaseEntity {
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affectedResourceId?: UUID;
  affectedResourceType?: ResourceType;
  relatedAlertIds: UUID[];
  assignedTo?: UUID;
  acknowledgedBy?: UUID;
  acknowledgedAt?: ISODateString;
  resolvedBy?: UUID;
  resolvedAt?: ISODateString;
  closedBy?: UUID;
  closedAt?: ISODateString;
  timeline: IncidentTimelineEvent[];
  notes: IncidentNote[];
  rootCause?: string;
  resolution?: string;
}

export type IncidentSeverity = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';

export interface IncidentTimelineEvent {
  id: UUID;
  incidentId: UUID;
  type: 'CREATED' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'NOTE_ADDED' | 'STATUS_CHANGED' | 'RESOLVED' | 'CLOSED';
  description: string;
  userId?: UUID;
  metadata?: Record<string, unknown>;
  createdAt: ISODateString;
}

export interface IncidentNote {
  id: UUID;
  incidentId: UUID;
  userId: UUID;
  content: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CostEstimate extends BaseEntity {
  resourceId: UUID;
  resourceType: ResourceType;
  provider: string;
  service: string;
  dailyCost: number;
  monthlyCost: number;
  currency: string;
  breakdown: CostBreakdownItem[];
  assumptions: string[];
  estimatedAt: ISODateString;
}

export interface CostBreakdownItem {
  category: string;
  dailyCost: number;
  monthlyCost: number;
  details: Record<string, unknown>;
}

export interface CloudAccount extends BaseEntity {
  name: string;
  provider: 'AWS' | 'AZURE' | 'GCP';
  accountId: string;
  region: string;
  credentialsRef: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  lastSyncedAt?: ISODateString;
  errorMessage?: string;
}

export interface CICDWorkflow extends BaseEntity {
  name: string;
  repository: string;
  branch: string;
  trigger: 'PUSH' | 'PR' | 'MANUAL' | 'SCHEDULE';
  status: CICDStatus;
  lastRunId?: UUID;
  lastRunAt?: ISODateString;
  lastRunStatus?: CICDStatus;
}

export type CICDStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';

export interface CICDRun extends BaseEntity {
  workflowId: UUID;
  runNumber: number;
  trigger: string;
  branch: string;
  commitSha: string;
  status: CICDStatus;
  startedAt: ISODateString;
  completedAt?: ISODateString;
  duration?: number;
  url: string;
  jobs: CICDJob[];
}

export interface CICDJob {
  id: UUID;
  name: string;
  status: CICDStatus;
  startedAt: ISODateString;
  completedAt?: ISODateString;
  steps: CICDStep[];
}

export interface CICDStep {
  name: string;
  status: CICDStatus;
  startedAt: ISODateString;
  completedAt?: ISODateString;
  output?: string;
}

export interface Report extends BaseEntity {
  name: string;
  type: ReportType;
  generatedBy: UUID;
  status: ReportStatus;
  parameters: Record<string, unknown>;
  fileUrl?: string;
  errorMessage?: string;
  completedAt?: ISODateString;
}

export type ReportType = 
  | 'INVENTORY'
  | 'COST_ANALYSIS'
  | 'INCIDENT_SUMMARY'
  | 'DEPLOYMENT_HISTORY'
  | 'HEALTH_REPORT'
  | 'COMPLIANCE';

export type ReportStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';

export interface AuditLog extends BaseEntity {
  userId: UUID;
  action: string;
  resourceType: string;
  resourceId?: UUID;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

export interface SystemHealth {
  database: HealthCheckResult;
  redis: HealthCheckResult;
  prometheus: HealthCheckResult;
  grafana: HealthCheckResult;
  opensearch: HealthCheckResult;
  aws: HealthCheckResult;
  docker: HealthCheckResult;
  kubernetes: HealthCheckResult;
  overall: HealthStatus;
}

export interface HealthCheckResult {
  status: HealthStatus;
  latency?: number;
  message?: string;
  lastCheckedAt: ISODateString;
}