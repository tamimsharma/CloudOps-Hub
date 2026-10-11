// Periodic metric snapshot collector.
// Persists the current CPU/memory/disk/network values for every running
// resource so historical charts and the alert engine always have data.
import { prisma } from '../main';
import { MetricKey, currentMetric, metricUnit } from './metricsSimulator';

const METRIC_MAP: Array<{ key: MetricKey; type: 'CPU_USAGE' | 'MEMORY_USAGE' | 'DISK_USAGE' | 'NETWORK_IN' | 'NETWORK_OUT' }> = [
  { key: 'cpu', type: 'CPU_USAGE' },
  { key: 'memory', type: 'MEMORY_USAGE' },
  { key: 'disk', type: 'DISK_USAGE' },
  { key: 'network_in', type: 'NETWORK_IN' },
  { key: 'network_out', type: 'NETWORK_OUT' },
];

export async function collectMetricSnapshots(): Promise<number> {
  const resources = await prisma.resource.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, type: true },
    take: 100,
  });

  if (resources.length === 0) return 0;

  const now = new Date();
  const data = resources.flatMap((resource) =>
    METRIC_MAP.map((metric) => {
      const value = currentMetric(metric.key, resource.id);
      return {
        resourceId: resource.id,
        resourceType: resource.type,
        metricType: metric.type,
        value,
        unit: metricUnit(metric.key),
        timestamp: now,
        labels: { collectedBy: 'scheduler' },
      };
    })
  );

  await prisma.metricSnapshot.createMany({ data });

  // Reflect the freshest values on the resource row itself.
  await Promise.all(
    resources.map(async (resource) => {
      const cpuUsage = currentMetric('cpu', resource.id);
      const memoryUsage = currentMetric('memory', resource.id);
      const diskUsage = currentMetric('disk', resource.id);
      const networkIn = currentMetric('network_in', resource.id);
      const networkOut = currentMetric('network_out', resource.id);

      await prisma.resource.update({
        where: { id: resource.id },
        data: { cpuUsage, memoryUsage, diskUsage, networkIn, networkOut, lastHealthCheckAt: now },
      });
    })
  );

  return data.length;
}
