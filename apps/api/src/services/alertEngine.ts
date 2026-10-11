// Incident/alert detection engine.
// Evaluates threshold rules against resources, deployments and metrics and
// opens alerts (and incidents for critical conditions) with de-duplication.
import { prisma } from '../main';
import { AlertSeverity, Prisma, ResourceType } from '@prisma/client';

export interface EvaluationResult {
  evaluatedAt: string;
  resourcesChecked: number;
  alertsCreated: number;
  alertsResolved: number;
  incidentsCreated: number;
  findings: Array<{ rule: string; target: string; severity: AlertSeverity; action: 'created' | 'skipped' | 'resolved' }>;
}

const RULE_COOLDOWN_MS = 30 * 60 * 1000;

interface RuleHit {
  rule: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  resourceId?: string;
  resourceType?: ResourceType;
}

function thresholdRule(
  rule: string,
  label: string,
  value: number | null | undefined,
  warnAt: number,
  criticalAt: number
): RuleHit | null {
  if (value === null || value === undefined) return null;
  if (value >= criticalAt) {
    return {
      rule,
      title: `${label} critical on resource`,
      description: `${label} is at ${value.toFixed(1)}% (critical threshold ${criticalAt}%).`,
      severity: 'CRITICAL',
    };
  }
  if (value >= warnAt) {
    return {
      rule,
      title: `${label} elevated on resource`,
      description: `${label} is at ${value.toFixed(1)}% (warning threshold ${warnAt}%).`,
      severity: 'WARNING',
    };
  }
  return null;
}

export async function evaluateAlerts(): Promise<EvaluationResult> {
  const now = new Date();
  const findings: EvaluationResult['findings'] = [];
  let alertsCreated = 0;
  let incidentsCreated = 0;
  let alertsResolved = 0;

  const resources = await prisma.resource.findMany({
    where: { status: 'RUNNING' },
    select: {
      id: true,
      name: true,
      type: true,
      health: true,
      cpuUsage: true,
      memoryUsage: true,
      diskUsage: true,
    },
  });

  const hits: RuleHit[] = [];

  for (const resource of resources) {
    const candidates = [
      thresholdRule('cpu_high', 'CPU usage', resource.cpuUsage, 80, 92),
      thresholdRule('memory_high', 'Memory usage', resource.memoryUsage, 80, 92),
      thresholdRule('disk_high', 'Disk usage', resource.diskUsage, 85, 95),
    ].filter((hit): hit is RuleHit => hit !== null);

    if (resource.health === 'CRITICAL') {
      candidates.push({
        rule: 'health_critical',
        title: 'Resource health is critical',
        description: `Health checks report CRITICAL state for ${resource.name}.`,
        severity: 'CRITICAL',
        resourceId: resource.id,
        resourceType: resource.type,
      });
    } else if (resource.health === 'DEGRADED') {
      candidates.push({
        rule: 'health_degraded',
        title: 'Resource health degraded',
        description: `Health checks report DEGRADED state for ${resource.name}.`,
        severity: 'WARNING',
        resourceId: resource.id,
        resourceType: resource.type,
      });
    }

    for (const candidate of candidates) {
      hits.push({
        ...candidate,
        resourceId: resource.id,
        resourceType: resource.type,
        title: `${candidate.title} (${resource.name})`,
      });
    }
  }

  // Failed deployments become alerts as well.
  const failedDeployments = await prisma.deployment.findMany({
    where: { status: 'FAILED', completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    select: { id: true, name: true, errorMessage: true, resourceId: true },
    take: 10,
  });
  for (const deployment of failedDeployments) {
    hits.push({
      rule: 'deployment_failed',
      title: `Deployment failed (${deployment.name})`,
      description: deployment.errorMessage || 'The deployment reported a failure.',
      severity: 'CRITICAL',
      resourceId: deployment.resourceId ?? undefined,
    });
  }

  for (const hit of hits) {
    const existing = await prisma.alert.findFirst({
      where: {
        resourceId: hit.resourceId ?? null,
        title: hit.title,
        status: { in: ['FIRING', 'ACKNOWLEDGED'] },
        createdAt: { gte: new Date(now.getTime() - RULE_COOLDOWN_MS) },
      },
    });

    if (existing) {
      findings.push({ rule: hit.rule, target: hit.title, severity: hit.severity, action: 'skipped' });
      continue;
    }

    const alert = await prisma.alert.create({
      data: {
        title: hit.title,
        description: hit.description,
        severity: hit.severity,
        source: 'rule-engine',
        resourceId: hit.resourceId ?? null,
        resourceType: hit.resourceType ?? null,
        status: 'FIRING',
        metadata: { rule: hit.rule, detectedAt: now.toISOString() },
      },
    });
    alertsCreated += 1;
    findings.push({ rule: hit.rule, target: hit.title, severity: hit.severity, action: 'created' });

    // Critical alerts automatically open an incident.
    if (hit.severity === 'CRITICAL') {
      const openIncident = await prisma.incident.findFirst({
        where: {
          affectedResourceId: hit.resourceId ?? null,
          status: { in: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'] },
        },
      });

      if (!openIncident && hit.resourceId) {
        const incident = await prisma.incident.create({
          data: {
            title: `Incident: ${hit.title}`,
            description: `${hit.description}\n\nAuto-detected from alert rule "${hit.rule}".`,
            severity: hit.rule === 'health_critical' ? 'SEV1' : 'SEV2',
            status: 'OPEN',
            affectedResourceId: hit.resourceId,
            affectedResourceType: hit.resourceType ?? null,
            timeline: {
              create: {
                type: 'CREATED',
                description: 'Incident created automatically by the detection engine.',
                metadata: { alertId: alert.id, rule: hit.rule },
              },
            },
            alerts: { connect: { id: alert.id } },
          },
        });
        incidentsCreated += 1;
        findings.push({ rule: hit.rule, target: incident.title, severity: hit.severity, action: 'created' });
      }
    }
  }

  // Auto-resolve alerts whose metric dropped back below the warning threshold.
  const firing = await prisma.alert.findMany({
    where: { status: 'FIRING', source: 'rule-engine' },
    include: { resource: { select: { id: true, name: true, cpuUsage: true, memoryUsage: true, diskUsage: true, health: true } } },
    take: 50,
  });

  for (const alert of firing) {
    const rule = String((alert.metadata as Prisma.JsonObject)?.rule ?? '');
    const resource = alert.resource;
    if (!resource) continue;

    const value =
      rule === 'cpu_high' ? resource.cpuUsage :
      rule === 'memory_high' ? resource.memoryUsage :
      rule === 'disk_high' ? resource.diskUsage : undefined;

    const stillFiring =
      rule === 'health_critical' ? resource.health === 'CRITICAL' :
      rule === 'health_degraded' ? resource.health === 'DEGRADED' :
      value !== null && value !== undefined ? value >= 80 : false;

    if (!stillFiring) {
      await prisma.alert.update({
        where: { id: alert.id },
        data: { status: 'RESOLVED', resolvedAt: new Date(), metadata: { ...(alert.metadata as object), autoResolved: true } },
      });
      alertsResolved += 1;
      findings.push({ rule: rule || 'unknown', target: alert.title, severity: alert.severity, action: 'resolved' });
    }
  }

  return {
    evaluatedAt: now.toISOString(),
    resourcesChecked: resources.length,
    alertsCreated,
    alertsResolved,
    incidentsCreated,
    findings,
  };
}
