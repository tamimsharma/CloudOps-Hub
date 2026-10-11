// Reports service - builds real Markdown reports from live platform data.
import { access, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../main';
import { NotFoundError } from '@cloudops-hub/shared';
import { Prisma } from '@prisma/client';
import {
  CreateReportInput,
  REPORT_TYPES,
  ReportFilterParams,
} from './types';

// Works both from src/ (tsx) and dist/ (compiled) - always apps/api/storage/reports
const REPORTS_DIR = path.resolve(__dirname, '..', '..', '..', 'storage', 'reports');

const MAX_ROWS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

type ReportWithUser = Prisma.ReportGetPayload<{
  include: { generatedByUser: { select: { id: true; name: true; email: true } } };
}>;

interface DateFilter {
  gte?: Date;
  lte?: Date;
}

// ---------- small markdown helpers ----------

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDate(value: Date): string {
  return `${value.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'report'
  );
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const raw = value instanceof Date ? formatDate(value) : String(value);
  return raw.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '-';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function countBy<T>(rows: T[], key: (row: T) => string): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function countsTable(title: string, counts: Array<{ key: string; count: number }>, column: string): string {
  if (counts.length === 0) return `### ${title}\n\n_No data._\n`;
  const lines = [`### ${title}`, '', `| ${column} | Count |`, '| --- | ---: |'];
  for (const row of counts) {
    lines.push(`| ${escapeCell(row.key)} | ${row.count} |`);
  }
  return `${lines.join('\n')}\n`;
}

function sectionIntro(title: string, detail: string): string {
  return `## ${title}\n\n${detail}\n`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ---------- service ----------

export class ReportService {
  async findAll(params: ReportFilterParams) {
    const where: Prisma.ReportWhereInput = {};
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: { generatedByUser: { select: { id: true, name: true, email: true } } },
      }),
      prisma.report.count({ where }),
    ]);

    return { reports, total };
  }

  async findById(id: string) {
    const report = await prisma.report.findUnique({
      where: { id },
      include: { generatedByUser: { select: { id: true, name: true, email: true } } },
    });

    if (!report) {
      throw new NotFoundError('Report', id);
    }

    return report;
  }

  async create(input: CreateReportInput, userId: string) {
    const meta = REPORT_TYPES.find((entry) => entry.value === input.type);

    const parameters = {
      ...(input.parameters ?? {}),
      ...(input.dateRange
        ? { dateRange: { from: input.dateRange.from ?? null, to: input.dateRange.to ?? null } }
        : {}),
    } as Prisma.InputJsonObject;

    return prisma.report.create({
      data: {
        name: input.name ?? `${meta?.label ?? input.type} - ${new Date().toISOString().slice(0, 10)}`,
        type: input.type,
        generatedBy: userId,
        status: 'GENERATING',
        parameters,
      },
      include: { generatedByUser: { select: { id: true, name: true, email: true } } },
    });
  }

  /**
   * Builds the report file in the background. Never throws: any failure flips
   * the row to FAILED with an errorMessage so the UI can surface it.
   */
  async generate(id: string): Promise<void> {
    try {
      const report = await this.findById(id);
      const content = await this.buildContent(report);

      await mkdir(REPORTS_DIR, { recursive: true });
      await writeFile(path.join(REPORTS_DIR, `${report.id}.md`), content, 'utf8');

      await prisma.report.update({
        where: { id: report.id },
        data: {
          status: 'COMPLETED',
          fileUrl: `/api/reports/${report.id}/download`,
          completedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Report generation failed';
      await prisma.report
        .update({ where: { id }, data: { status: 'FAILED', errorMessage: message } })
        .catch(() => undefined);
    }
  }

  async readContent(id: string): Promise<{ content: string; filename: string }> {
    const report = await this.findById(id);

    if (report.status !== 'COMPLETED') {
      throw new NotFoundError('Report file', id);
    }

    const filePath = await this.resolveFile(report);
    if (!filePath) {
      throw new NotFoundError('Report file', id);
    }

    try {
      const content = await readFile(filePath, 'utf8');
      return { content, filename: `${slugify(report.name)}-${report.id.slice(0, 8)}.md` };
    } catch {
      throw new NotFoundError('Report file', id);
    }
  }

  /**
   * Canonical location is <reportId>.md. Rows created outside this service
   * (e.g. the seeded samples) may point at a differently named file, so fall
   * back to a declared filename and finally to a unique report-type match.
   */
  private async resolveFile(report: ReportWithUser): Promise<string | null> {
    const canonical = path.join(REPORTS_DIR, `${report.id}.md`);
    if (await fileExists(canonical)) return canonical;

    const parameters = asRecord(report.parameters);
    const declared =
      typeof parameters.file === 'string'
        ? parameters.file
        : typeof parameters.fileName === 'string'
          ? parameters.fileName
          : null;

    if (declared) {
      const declaredPath = path.join(REPORTS_DIR, path.basename(declared));
      if (await fileExists(declaredPath)) return declaredPath;
    }

    try {
      const prefix = report.type.split('_')[0].toLowerCase();
      const matches = (await readdir(REPORTS_DIR)).filter(
        (name) => name.endsWith('.md') && name.toLowerCase().startsWith(prefix)
      );
      return matches.length === 1 ? path.join(REPORTS_DIR, matches[0]) : null;
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    const report = await this.findById(id);
    const filePath = await this.resolveFile(report);
    if (filePath) {
      await unlink(filePath).catch(() => undefined);
    }
    await prisma.report.delete({ where: { id: report.id } });
  }

  // ---------- content generation ----------

  private async buildContent(report: ReportWithUser): Promise<string> {
    const parameters = asRecord(report.parameters);
    const dateRange = asRecord(parameters.dateRange);

    const fromDate = typeof dateRange.from === 'string' ? new Date(dateRange.from) : null;
    const toDate = typeof dateRange.to === 'string' ? new Date(dateRange.to) : null;
    const dateFilter: DateFilter = {};
    if (fromDate && !Number.isNaN(fromDate.getTime())) dateFilter.gte = fromDate;
    if (toDate && !Number.isNaN(toDate.getTime())) dateFilter.lte = toDate;
    const hasDateFilter = Boolean(dateFilter.gte || dateFilter.lte);

    const parameterSummary = this.parameterSummary(parameters, dateFilter, hasDateFilter);
    const meta = REPORT_TYPES.find((entry) => entry.value === report.type);
    const rawLabel = meta?.label ?? report.type;
    // "Health Report" must not become "Health Report Report"
    const title = /report$/i.test(rawLabel) ? rawLabel : `${rawLabel} Report`;

    const header = [
      `# ${title}`,
      '',
      `- **Name:** ${report.name}`,
      `- **Report ID:** ${report.id}`,
      `- **Generated at:** ${formatDate(new Date())}`,
      `- **Generated by:** ${report.generatedByUser ? `${report.generatedByUser.name} (${report.generatedByUser.email})` : 'CloudOps Hub (system)'}`,
      `- **Parameters:** ${parameterSummary}`,
      '',
      '---',
      '',
    ].join('\n');

    let body = '';
    switch (report.type) {
      case 'INVENTORY':
        body = await this.inventorySection();
        break;
      case 'COST_ANALYSIS':
        body = await this.costSection();
        break;
      case 'INCIDENT_SUMMARY':
        body = await this.incidentSection(hasDateFilter ? dateFilter : undefined);
        break;
      case 'DEPLOYMENT_HISTORY':
        body = await this.deploymentSection(hasDateFilter ? dateFilter : undefined);
        break;
      case 'HEALTH_REPORT':
        body = await this.healthSection();
        break;
      case 'COMPLIANCE':
        body = await this.complianceSection();
        break;
      default:
        body = 'Unsupported report type.\n';
    }

    const footer = ['', '---', '', `_Generated by CloudOps Hub on ${formatDate(new Date())}_`, ''];

    return `${header}${body}${footer.join('\n')}`;
  }

  private parameterSummary(
    parameters: Record<string, unknown>,
    dateFilter: DateFilter,
    hasDateFilter: boolean
  ): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(parameters)) {
      if (key === 'dateRange') continue;
      const rendered =
        value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      parts.push(`${key}=${rendered}`);
    }

    if (hasDateFilter) {
      const from = dateFilter.gte ? dateFilter.gte.toISOString().slice(0, 10) : 'beginning';
      const to = dateFilter.lte ? dateFilter.lte.toISOString().slice(0, 10) : 'now';
      parts.push(`dateRange=${from}..${to}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'defaults (all available data)';
  }

  private async inventorySection(): Promise<string> {
    const resources = await prisma.resource.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        provider: true,
        environment: true,
        region: true,
        status: true,
        health: true,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    if (resources.length === 0) {
      return `${sectionIntro('Inventory', 'No resources are currently tracked in the platform.')}\n`;
    }

    const byType = countBy(resources, (r) => r.type);
    const byStatus = countBy(resources, (r) => r.status);
    const byHealth = countBy(resources, (r) => r.health);
    const byProvider = countBy(resources, (r) => r.provider);
    const byEnvironment = countBy(resources, (r) => r.environment);

    const parts: string[] = [
      sectionIntro(
        'Inventory',
        `**${resources.length}** resources are tracked across **${byType.length}** types, ` +
          `**${byProvider.length}** providers and **${byEnvironment.length}** environments.`
      ),
      countsTable('By type', byType, 'Type'),
      countsTable('By status', byStatus, 'Status'),
      countsTable('By health', byHealth, 'Health'),
      countsTable('By provider', byProvider, 'Provider'),
      countsTable('By environment', byEnvironment, 'Environment'),
      '## Resources',
      '',
      '| Name | Type | Provider | Environment | Region | Status | Health |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    ];

    for (const resource of resources.slice(0, MAX_ROWS)) {
      parts.push(
        `| ${escapeCell(resource.name)} | ${escapeCell(resource.type)} | ${escapeCell(
          resource.provider
        )} | ${escapeCell(resource.environment)} | ${escapeCell(resource.region)} | ${escapeCell(
          resource.status
        )} | ${escapeCell(resource.health)} |`
      );
    }

    if (resources.length > MAX_ROWS) {
      parts.push('', `_Showing the first ${MAX_ROWS} of ${resources.length} resources._`);
    }
    parts.push('');

    return parts.join('\n');
  }

  private async costSection(): Promise<string> {
    const estimates = await prisma.costEstimate.findMany({
      include: { resource: { select: { id: true, name: true, type: true, environment: true } } },
      orderBy: { monthlyCost: 'desc' },
      take: 500,
    });

    if (estimates.length === 0) {
      return `${sectionIntro(
        'Cost analysis',
        'No cost estimates have been recorded yet. Run a cost estimation job from the Costs module to populate this report.'
      )}\n`;
    }

    const totalDaily = round2(estimates.reduce((sum, row) => sum + row.dailyCost, 0));
    const totalMonthly = round2(estimates.reduce((sum, row) => sum + row.monthlyCost, 0));
    const currency = estimates[0]?.currency ?? 'USD';

    const serviceMap = new Map<string, { daily: number; monthly: number }>();
    for (const row of estimates) {
      const bucket = serviceMap.get(row.service) ?? { daily: 0, monthly: 0 };
      bucket.daily += row.dailyCost;
      bucket.monthly += row.monthlyCost;
      serviceMap.set(row.service, bucket);
    }
    const byService = [...serviceMap.entries()]
      .map(([service, totals]) => ({ service, daily: round2(totals.daily), monthly: round2(totals.monthly) }))
      .sort((a, b) => b.monthly - a.monthly);

    const assumptions = new Set<string>();
    for (const row of estimates) {
      for (const item of row.assumptions) assumptions.add(item);
    }

    const parts: string[] = [
      sectionIntro(
        'Cost analysis',
        `Aggregated from **${estimates.length}** stored estimates. Currency: **${currency}**.`
      ),
      '### Totals',
      '',
      '| Metric | Amount |',
      '| --- | ---: |',
      `| Estimated daily spend | ${money(totalDaily)} |`,
      `| Estimated monthly spend | ${money(totalMonthly)} |`,
      '',
      '### Spend by service',
      '',
      '| Service | Daily | Monthly |',
      '| --- | ---: | ---: |',
    ];

    for (const row of byService) {
      parts.push(`| ${escapeCell(row.service)} | ${money(row.daily)} | ${money(row.monthly)} |`);
    }

    parts.push('', '### Most expensive resources', '', '| Resource | Type | Service | Daily | Monthly |', '| --- | --- | --- | ---: | ---: |');
    for (const row of estimates.slice(0, 10)) {
      parts.push(
        `| ${escapeCell(row.resource?.name ?? row.resourceId)} | ${escapeCell(
          row.resourceType
        )} | ${escapeCell(row.service)} | ${money(round2(row.dailyCost))} | ${money(
          round2(row.monthlyCost)
        )} |`
      );
    }

    if (assumptions.size > 0) {
      parts.push('', '### Assumptions', '');
      for (const item of assumptions) {
        parts.push(`- ${item}`);
      }
    }

    parts.push('');
    return parts.join('\n');
  }

  private async incidentSection(dateFilter?: DateFilter): Promise<string> {
    const where: Prisma.IncidentWhereInput = dateFilter ? { createdAt: dateFilter } : {};

    const [bySeverity, byStatus, incidents] = await Promise.all([
      prisma.incident.groupBy({ by: ['severity'], where, _count: true }),
      prisma.incident.groupBy({ by: ['status'], where, _count: true }),
      prisma.incident.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { affectedResource: { select: { name: true } } },
      }),
    ]);

    const openCount = incidents.filter((i) =>
      ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(i.status)
    ).length;

    const parts: string[] = [
      sectionIntro(
        'Incident summary',
        `**${byStatus.reduce((sum, row) => sum + row._count, 0)}** incidents match the report parameters; ` +
          `**${openCount}** of the ${Math.min(incidents.length, 50)} listed incidents are still open.`
      ),
      countsTable(
        'By severity',
        bySeverity.map((row) => ({ key: row.severity, count: row._count })),
        'Severity'
      ),
      countsTable(
        'By status',
        byStatus.map((row) => ({ key: row.status, count: row._count })),
        'Status'
      ),
      '### Recent incidents',
      '',
      '| Title | Severity | Status | Affected resource | Created | Resolved |',
      '| --- | --- | --- | --- | --- | --- |',
    ];

    if (incidents.length === 0) {
      parts.push('| - | - | - | - | - | - |');
      parts.push('', '_No incidents recorded for the selected parameters._');
    }

    for (const incident of incidents) {
      parts.push(
        `| ${escapeCell(incident.title)} | ${escapeCell(incident.severity)} | ${escapeCell(
          incident.status
        )} | ${escapeCell(incident.affectedResource?.name ?? '-')} | ${escapeCell(
          incident.createdAt
        )} | ${escapeCell(incident.resolvedAt ?? '-')} |`
      );
    }

    parts.push('');
    return parts.join('\n');
  }

  private async deploymentSection(dateFilter?: DateFilter): Promise<string> {
    const where: Prisma.DeploymentWhereInput = dateFilter ? { createdAt: dateFilter } : {};

    const [byStatus, deployments] = await Promise.all([
      prisma.deployment.groupBy({ by: ['status'], where, _count: true }),
      prisma.deployment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: { select: { name: true, email: true } },
          resource: { select: { name: true, environment: true } },
        },
      }),
    ]);

    const failed = byStatus.find((row) => row.status === 'FAILED')?._count ?? 0;
    const rolledBack = byStatus.find((row) => row.status === 'ROLLED_BACK')?._count ?? 0;

    const parts: string[] = [
      sectionIntro(
        'Deployment history',
        `**${byStatus.reduce((sum, row) => sum + row._count, 0)}** deployments match the report parameters ` +
          `(**${failed}** failed, **${rolledBack}** rolled back).`
      ),
      countsTable(
        'By status',
        byStatus.map((row) => ({ key: row.status, count: row._count })),
        'Status'
      ),
      '### Recent deployments',
      '',
      '| Deployment | Image | Resource | Environment | Status | Deployed by | Created | Duration |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ];

    if (deployments.length === 0) {
      parts.push('| - | - | - | - | - | - | - | - |');
      parts.push('', '_No deployments recorded for the selected parameters._');
    }

    for (const deployment of deployments) {
      const duration =
        deployment.startedAt && deployment.completedAt
          ? `${Math.round((deployment.completedAt.getTime() - deployment.startedAt.getTime()) / 1000)}s`
          : '-';
      parts.push(
        `| ${escapeCell(deployment.name)} | ${escapeCell(`${deployment.image}:${deployment.tag}`)} | ${escapeCell(
          deployment.resource?.name ?? '-'
        )} | ${escapeCell(deployment.resource?.environment ?? '-')} | ${escapeCell(
          deployment.status
        )} | ${escapeCell(deployment.user?.name ?? '-')} | ${escapeCell(deployment.createdAt)} | ${escapeCell(duration)} |`
      );
    }

    parts.push('');
    return parts.join('\n');
  }

  private async healthSection(): Promise<string> {
    const resources = await prisma.resource.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        environment: true,
        status: true,
        health: true,
        cpuUsage: true,
        memoryUsage: true,
        diskUsage: true,
        lastHealthCheckAt: true,
      },
      orderBy: { name: 'asc' },
    });

    const byHealth = countBy(resources, (r) => r.health);
    const byStatus = countBy(resources, (r) => r.status);

    const severityRank: Record<string, number> = { CRITICAL: 0, DEGRADED: 1, WARNING: 2, UNKNOWN: 3 };
    const unhealthy = resources
      .filter((r) => r.health !== 'HEALTHY')
      .sort((a, b) => (severityRank[a.health] ?? 9) - (severityRank[b.health] ?? 9));

    const parts: string[] = [
      sectionIntro(
        'Health report',
        `**${resources.length}** resources checked: **${
          resources.filter((r) => r.health === 'HEALTHY').length
        }** healthy, **${unhealthy.length}** requiring attention.`
      ),
      countsTable('Health distribution', byHealth, 'Health'),
      countsTable('Status distribution', byStatus, 'Status'),
      '### Resources requiring attention',
      '',
      '| Name | Type | Environment | Status | Health | CPU % | Memory % | Disk % | Last check |',
      '| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |',
    ];

    if (unhealthy.length === 0) {
      parts.push('| - | - | - | - | - | - | - | - | - |');
      parts.push('', '_Every tracked resource currently reports HEALTHY._');
    }

    for (const resource of unhealthy.slice(0, MAX_ROWS)) {
      parts.push(
        `| ${escapeCell(resource.name)} | ${escapeCell(resource.type)} | ${escapeCell(
          resource.environment
        )} | ${escapeCell(resource.status)} | ${escapeCell(resource.health)} | ${escapeCell(
          resource.cpuUsage === null ? '-' : round2(resource.cpuUsage)
        )} | ${escapeCell(resource.memoryUsage === null ? '-' : round2(resource.memoryUsage))} | ${escapeCell(
          resource.diskUsage === null ? '-' : round2(resource.diskUsage)
        )} | ${escapeCell(resource.lastHealthCheckAt ?? '-')} |`
      );
    }

    if (unhealthy.length > MAX_ROWS) {
      parts.push('', `_Showing the first ${MAX_ROWS} of ${unhealthy.length} unhealthy resources._`);
    }

    parts.push('');
    return parts.join('\n');
  }

  private async complianceSection(): Promise<string> {
    const [deployments, resources, incidents, users] = await Promise.all([
      prisma.deployment.findMany({
        select: { id: true, name: true, status: true, createdAt: true, environmentVariables: true },
        take: 1000,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.resource.findMany({ select: { id: true, name: true, type: true, health: true, tags: true } }),
      prisma.incident.findMany({
        select: { id: true, title: true, severity: true, status: true, createdAt: true },
        take: 1000,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
        where: { role: { in: ['ADMIN', 'ENGINEER'] } },
      }),
    ]);

    type CheckResult = { name: string; status: 'PASS' | 'WARN' | 'FAIL'; details: string };
    const checks: CheckResult[] = [];

    // 1. Secrets committed into deployment environment variables
    const secretPattern = /(secret|password|passwd|token|api[-_]?key|private[-_]?key|credential)/i;
    const secretOffenders = deployments.filter((deployment) =>
      Object.keys(asRecord(deployment.environmentVariables)).some((key) => secretPattern.test(key))
    );
    checks.push({
      name: 'No secrets in deployment environment variables',
      status: secretOffenders.length > 0 ? 'FAIL' : 'PASS',
      details:
        secretOffenders.length > 0
          ? `${secretOffenders.length} deployment(s) define sensitive-looking keys: ${secretOffenders
              .slice(0, 5)
              .map((d) => d.name)
              .join(', ')}`
          : `Scanned ${deployments.length} deployment(s) without finding secret-like keys`,
    });

    // 2. Resources without an owner tag
    const missingOwner = resources.filter((resource) => {
      const tags = asRecord(resource.tags);
      return !tags.owner && !tags.Owner && !tags.team && !tags['owned-by'];
    });
    checks.push({
      name: 'Resources carry an owner tag',
      status:
        resources.length === 0
          ? 'WARN'
          : missingOwner.length === 0
            ? 'PASS'
            : missingOwner.length === resources.length
              ? 'FAIL'
              : 'WARN',
      details:
        resources.length === 0
          ? 'No resources tracked, cannot verify ownership'
          : `${missingOwner.length} of ${resources.length} resource(s) are missing an owner/team tag`,
    });

    // 3. Stale deployments stuck in flight for more than 24 hours
    const stale = deployments.filter(
      (deployment) =>
        ['PENDING', 'BUILDING', 'DEPLOYING'].includes(deployment.status) &&
        Date.now() - deployment.createdAt.getTime() > DAY_MS
    );
    checks.push({
      name: 'No stale deployments',
      status: stale.length > 0 ? 'FAIL' : 'PASS',
      details:
        stale.length > 0
          ? `${stale.length} deployment(s) have been in flight for more than 24h: ${stale
              .slice(0, 5)
              .map((d) => d.name)
              .join(', ')}`
          : `All ${deployments.length} deployment(s) completed or are less than 24h old`,
    });

    // 4. Incidents left unresolved for more than 7 days
    const agedIncidents = incidents.filter(
      (incident) =>
        ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(incident.status) &&
        Date.now() - incident.createdAt.getTime() > 7 * DAY_MS
    );
    checks.push({
      name: 'No incidents unresolved for over 7 days',
      status: agedIncidents.length > 0 ? 'FAIL' : incidents.length > 0 && agedIncidents.length === 0 ? 'PASS' : 'WARN',
      details:
        agedIncidents.length > 0
          ? `${agedIncidents.length} incident(s) open for more than 7 days: ${agedIncidents
              .slice(0, 5)
              .map((i) => i.title)
              .join(', ')}`
          : incidents.length > 0
            ? `All ${incidents.length} recent incident(s) are resolved, closed or younger than 7 days`
            : 'No incidents recorded to evaluate',
    });

    // 5. Resources in critical health
    const critical = resources.filter((resource) => resource.health === 'CRITICAL');
    checks.push({
      name: 'No resources in CRITICAL health',
      status: critical.length > 0 ? 'FAIL' : 'PASS',
      details:
        critical.length > 0
          ? `${critical.length} resource(s) in CRITICAL health: ${critical
              .slice(0, 5)
              .map((r) => r.name)
              .join(', ')}`
          : 'No resource currently reports CRITICAL health',
    });

    // 6. Privileged accounts that have never logged in
    const dormantPrivileged = users.filter((user) => user.isActive && user.lastLoginAt === null);
    checks.push({
      name: 'Privileged accounts have signed in at least once',
      status: dormantPrivileged.length > 0 ? 'WARN' : 'PASS',
      details:
        dormantPrivileged.length > 0
          ? `${dormantPrivileged.length} active ADMIN/ENGINEER account(s) have never logged in: ${dormantPrivileged
              .slice(0, 5)
              .map((u) => u.email)
              .join(', ')}`
          : `All ${users.length} active privileged account(s) have logged in`,
    });

    const passed = checks.filter((c) => c.status === 'PASS').length;
    const warnings = checks.filter((c) => c.status === 'WARN').length;
    const failures = checks.filter((c) => c.status === 'FAIL').length;

    const parts: string[] = [
      sectionIntro(
        'Compliance checks',
        `**${passed} passed**, **${warnings} warning(s)**, **${failures} failure(s)** across ${checks.length} automated checks.`
      ),
      '| # | Check | Result | Details |',
      '| ---: | --- | --- | --- |',
    ];

    checks.forEach((check, index) => {
      parts.push(
        `| ${index + 1} | ${escapeCell(check.name)} | **${check.status}** | ${escapeCell(check.details)} |`
      );
    });

    parts.push(
      '',
      '> PASS = control satisfied, WARN = needs review, FAIL = action required.',
      ''
    );

    return parts.join('\n');
  }
}

export const reportService = new ReportService();
