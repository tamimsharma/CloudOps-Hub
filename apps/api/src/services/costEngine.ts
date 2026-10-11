// Pure cost engine: price book + cost line calculation.
// Kept free of database imports so the seed script and API can share it.

export interface CostLine {
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  dailyCost: number;
  monthlyCost: number;
}

/** On-demand AWS pricing in us-east-1 (USD) - kept simple and transparent. */
export const PRICE_BOOK = {
  instanceHourly: {
    't3.micro': 0.0104,
    't3.small': 0.0208,
    't3.medium': 0.0416,
    't3.large': 0.0832,
    't3.xlarge': 0.1664,
    'm5.large': 0.096,
    'm5.xlarge': 0.192,
    'c6i.xlarge': 0.17,
    'c6i.2xlarge': 0.34,
    'r5.large': 0.126,
  } as Record<string, number>,
  defaultInstanceHourly: 0.096,
  ebsGbMonthly: 0.08,
  s3GbMonthly: 0.023,
  s3RequestsPerMillion: 0.4,
  rdsInstanceHourly: 0.068,
  rdsGbMonthly: 0.115,
  loadBalancerHourly: 0.0225,
  eksClusterHourly: 0.1,
  dataTransferGbMonthly: 0.09,
  containerCpuMilliHourly: 0.0000046,
  containerMemGbHourly: 0.000005,
} as const;

export const COST_ASSUMPTIONS = [
  'On-demand pricing in us-east-1, no reserved instances or savings plans',
  '30.4 day month, 24/7 running time',
  'Excludes data transfer, support plans and taxes',
];

export function roundCost(value: number): number {
  return Math.round(value * 100) / 100;
}

function readMetadata(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
}

export function buildCostLines(resource: {
  type: string;
  name: string;
  metadata?: unknown;
}): CostLine[] {
  const details = readMetadata(resource.metadata);
  const lines: CostLine[] = [];

  const add = (category: string, quantity: number, unit: string, unitPrice: number, dailyCost: number) => {
    lines.push({
      category,
      quantity: roundCost(quantity),
      unit,
      unitPrice,
      dailyCost: roundCost(dailyCost),
      monthlyCost: roundCost(dailyCost * 30.4),
    });
  };

  switch (resource.type) {
    case 'EC2_INSTANCE': {
      const instanceType = String(details.instanceType ?? 't3.medium');
      const hourly = PRICE_BOOK.instanceHourly[instanceType] ?? PRICE_BOOK.defaultInstanceHourly;
      add('Compute (EC2)', 24 * 30.4, 'instance-hours', hourly, hourly * 24);
      const diskGb = Number(details.diskGb ?? 30);
      add('Storage (EBS gp3)', diskGb, 'GB-month', PRICE_BOOK.ebsGbMonthly, (diskGb * PRICE_BOOK.ebsGbMonthly) / 30.4);
      break;
    }
    case 'DATABASE': {
      add('Compute (RDS)', 24 * 30.4, 'instance-hours', PRICE_BOOK.rdsInstanceHourly, PRICE_BOOK.rdsInstanceHourly * 24);
      const storageGb = Number(details.storageGb ?? 50);
      add('Storage (RDS)', storageGb, 'GB-month', PRICE_BOOK.rdsGbMonthly, (storageGb * PRICE_BOOK.rdsGbMonthly) / 30.4);
      break;
    }
    case 'S3_BUCKET': {
      const sizeGb = Number(details.sizeGb ?? 10);
      add('Storage (S3)', sizeGb, 'GB-month', PRICE_BOOK.s3GbMonthly, (sizeGb * PRICE_BOOK.s3GbMonthly) / 30.4);
      const requests = Number(details.requestsMillions ?? 1);
      add('Requests (S3)', requests, 'million requests', PRICE_BOOK.s3RequestsPerMillion, (requests * PRICE_BOOK.s3RequestsPerMillion) / 30.4);
      break;
    }
    case 'LOAD_BALANCER': {
      add('Load balancer', 24 * 30.4, 'hours', PRICE_BOOK.loadBalancerHourly, PRICE_BOOK.loadBalancerHourly * 24);
      const lcu = Number(details.lcu ?? 2);
      add('Load balancer capacity', lcu * 24 * 30.4, 'LCU-hours', 0.008, lcu * 24 * 0.008);
      break;
    }
    case 'KUBERNETES_CLUSTER': {
      add('EKS control plane', 24 * 30.4, 'cluster-hours', PRICE_BOOK.eksClusterHourly, PRICE_BOOK.eksClusterHourly * 24);
      const nodes = Number(details.nodes ?? 3);
      add('Worker nodes', nodes * 24 * 30.4, 'instance-hours', PRICE_BOOK.defaultInstanceHourly, nodes * 24 * PRICE_BOOK.defaultInstanceHourly);
      break;
    }
    case 'DOCKER_CONTAINER':
    case 'KUBERNETES_POD':
    case 'KUBERNETES_DEPLOYMENT': {
      const cpuMilli = Number(details.cpuMilli ?? 500);
      const memGb = Number(details.memGb ?? 1);
      add('Container CPU', cpuMilli * 24 * 30.4, 'millicore-hours', PRICE_BOOK.containerCpuMilliHourly, cpuMilli * 24 * PRICE_BOOK.containerCpuMilliHourly);
      add('Container memory', memGb * 24 * 30.4, 'GB-hours', PRICE_BOOK.containerMemGbHourly, memGb * 24 * PRICE_BOOK.containerMemGbHourly);
      break;
    }
    case 'APPLICATION': {
      const replicas = Number(details.replicas ?? 2);
      add('Application compute', replicas * 24 * 30.4, 'instance-hours', PRICE_BOOK.defaultInstanceHourly, replicas * 24 * PRICE_BOOK.defaultInstanceHourly);
      break;
    }
    default: {
      const transferGb = Number(details.transferGb ?? 20);
      add('Data transfer', transferGb, 'GB-month', PRICE_BOOK.dataTransferGbMonthly, (transferGb * PRICE_BOOK.dataTransferGbMonthly) / 30.4);
    }
  }

  return lines;
}

export function summarizeLines(lines: CostLine[]): { dailyCost: number; monthlyCost: number } {
  return {
    dailyCost: roundCost(lines.reduce((sum, line) => sum + line.dailyCost, 0)),
    monthlyCost: roundCost(lines.reduce((sum, line) => sum + line.monthlyCost, 0)),
  };
}
