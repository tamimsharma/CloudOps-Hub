// Dashboard service - aggregated overview for the home screen.
import { prisma } from '../../main';
import { metricsService } from '../metrics/service';
import { costService } from '../costs/service';

export interface DashboardSummary {
  generatedAt: string;
  healthScore: number;
  uptimeSeconds: number;
  metricsSource: string;
  resources: Record<string, unknown>;
  deployments: Record<string, unknown>;
  kubernetes: Record<string, unknown>;
  alerts: Record<string, unknown>;
  incidents: Record<string, unknown>;
  costs: Record<string, unknown>;
  logs: Record<string, unknown>;
  series: Array<{ metric: string; unit: string; points: Array<{ timestamp: number; value: number }> }>;
  activity: Array<{ type: string; message: string; severity: string; timestamp: string }>;
}

export class DashboardService {
  async getSummary(): Promise<DashboardSummary> {
    const [
      resourceStats,
      healthSummary,
      deploymentStats,
      recentDeployments,
      kubernetesStats,
      alertStats,
      incidentStats,
      costSummary,
      logStats,
      cpuSeries,
      memorySeries,
      requestSeries,
      errorSeries,
    ] = await Promise.all([
      prisma.resource.groupBy({ by: ['status'], _count: true }),
      prisma.resource.findMany({
        select: { health: true, cpuUsage: true, memoryUsage: true, name: true },
      }),
      prisma.deployment.groupBy({ by: ['status'], _count: true }),
      prisma.deployment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, status: true, createdAt: true, image: true, tag: true },
      }),
      prisma.kubernetesWorkload.aggregate({ _count: { _all: true } }).then(async (workloads) => {
        const ready = await prisma.kubernetesWorkload.count({
          where: { availableReplicas: { gte: 1 }, status: 'RUNNING' },
        });
        const clusters = await prisma.kubernetesCluster.count();
        return { clusters, workloads: workloads._count._all, ready };
      }),
      prisma.alert.findMany({
        where: { status: { in: ['FIRING', 'ACKNOWLEDGED'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, severity: true, status: true, createdAt: true, resource: { select: { name: true } } },
      }),
      prisma.incident.findMany({
        where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, severity: true, status: true, createdAt: true },
      }),
      costService.summary(),
      prisma.logEntry.groupBy({
        by: ['severity'],
        where: { timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        _count: true,
      }),
      metricsService.getSeries({ metric: 'cpu', range: '24h' }),
      metricsService.getSeries({ metric: 'memory', range: '24h' }),
      metricsService.getSeries({ metric: 'requests', range: '24h' }),
      metricsService.getSeries({ metric: 'errors', range: '24h' }),
    ]);

    const healthCounts = healthSummary.reduce<Record<string, number>>((acc, row) => {
      acc[row.health] = (acc[row.health] ?? 0) + 1;
      return acc;
    }, {});

    const byStatus = resourceStats.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count;
      return acc;
    }, {});

    const deploymentByStatus = deploymentStats.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count;
      return acc;
    }, {});

    const logSeverity = logStats.reduce<Record<string, number>>((acc, row) => {
      acc[row.severity] = row._count;
      return acc;
    }, {});

    const openAlerts = await prisma.alert.count({ where: { status: { in: ['FIRING', 'ACKNOWLEDGED'] } } });
    const criticalAlerts = await prisma.alert.count({ where: { status: 'FIRING', severity: 'CRITICAL' } });
    const openIncidents = await prisma.incident.count({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'] } },
    });
    const failedDeployments = deploymentByStatus.FAILED ?? 0;

    const healthScore = Math.max(
      0,
      Math.min(
        100,
        100 -
          (healthCounts.CRITICAL ?? 0) * 8 -
          (healthCounts.DEGRADED ?? 0) * 4 -
          criticalAlerts * 6 -
          Math.min(openAlerts, 10) * 1.5 -
          openIncidents * 3 -
          failedDeployments * 4
      )
    );

    const alerts = await prisma.alert.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      select: { severity: true },
    });
    const alertBySeverity = alerts.reduce<Record<string, number>>((acc, row) => {
      acc[row.severity] = (acc[row.severity] ?? 0) + 1;
      return acc;
    }, {});

    const totalLogs = Object.values(logSeverity).reduce((sum, count) => sum + count, 0);
    const errorLogs = (logSeverity.ERROR ?? 0) + (logSeverity.FATAL ?? 0);

    const recentAlerts = await prisma.alert.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, severity: true, status: true, createdAt: true },
    });

    const activity = [
      ...recentAlerts.map((alert) => ({
        type: 'alert',
        message: alert.title,
        severity: alert.severity,
        timestamp: alert.createdAt.toISOString(),
      })),
      ...recentDeployments.map((deployment) => ({
        type: 'deployment',
        message: `${deployment.name} → ${deployment.status}`,
        severity: deployment.status === 'FAILED' ? 'CRITICAL' : 'INFO',
        timestamp: new Date(deployment.createdAt).toISOString(),
      })),
      ...incidentStats.map((incident) => ({
        type: 'incident',
        message: incident.title,
        severity: incident.severity === 'SEV1' ? 'CRITICAL' : 'WARNING',
        timestamp: new Date(incident.createdAt).toISOString(),
      })),
    ]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 10);

    return {
      generatedAt: new Date().toISOString(),
      healthScore: Math.round(healthScore),
      uptimeSeconds: Math.round(process.uptime()),
      metricsSource: cpuSeries.source,
      resources: {
        total: healthSummary.length,
        byStatus,
        byHealth: healthCounts,
        avgCpu:
          Math.round(
            (healthSummary.reduce((sum, row) => sum + (row.cpuUsage ?? 0), 0) /
              Math.max(1, healthSummary.length)) * 10
          ) / 10,
        avgMemory:
          Math.round(
            (healthSummary.reduce((sum, row) => sum + (row.memoryUsage ?? 0), 0) /
              Math.max(1, healthSummary.length)) * 10
          ) / 10,
      },
      deployments: {
        byStatus: deploymentByStatus,
        total: deploymentStats.reduce((sum, row) => sum + row._count, 0),
        recent: recentDeployments,
      },
      kubernetes: kubernetesStats,
      alerts: {
        open: openAlerts,
        critical: criticalAlerts,
        bySeverity: alertBySeverity,
        recent: recentAlerts,
      },
      incidents: {
        open: openIncidents,
        stats: await incidentServiceStats(),
      },
      costs: {
        totalMonthly: costSummary.totalMonthly,
        totalDaily: costSummary.totalDaily,
        currency: costSummary.currency,
        topResources: costSummary.topResources.slice(0, 5),
        trend: costSummary.trend.slice(-14),
      },
      logs: {
        total24h: totalLogs,
        errorRate: totalLogs > 0 ? Math.round((errorLogs / totalLogs) * 10000) / 100 : 0,
        bySeverity: logSeverity,
      },
      series: [cpuSeries, memorySeries, requestSeries, errorSeries].map((series) => ({
        metric: series.metric,
        unit: series.unit,
        points: series.points,
      })),
      activity,
    };
  }
}

async function incidentServiceStats() {
  const [byStatus, bySeverity] = await Promise.all([
    prisma.incident.groupBy({
      by: ['status'],
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'] } },
      _count: true,
    }),
    prisma.incident.groupBy({ by: ['severity'], _count: true }),
  ]);

  return {
    byStatus: byStatus.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: row._count }), {}),
    bySeverity: bySeverity.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.severity]: row._count }), {}),
  };
}

export const dashboardService = new DashboardService();
