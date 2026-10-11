// CI/CD service - GitHub Actions visibility plus locally simulated pipelines.
import { randomBytes } from 'node:crypto';
import { prisma } from '../../main';
import { NotFoundError } from '@cloudops-hub/shared';
import { Prisma } from '@prisma/client';
import { githubClient } from '../../services/github';
import { CreateWorkflowInput, RunListParams, WorkflowListParams } from './types';

interface JobSpec {
  name: string;
  steps: string[];
}

const JOB_SPECS: JobSpec[] = [
  { name: 'build', steps: ['Checkout repository', 'Install dependencies', 'Compile application'] },
  { name: 'test', steps: ['Unit tests', 'Integration tests', 'Coverage report'] },
  { name: 'deploy', steps: ['Build container image', 'Push image to registry', 'Roll out to environment'] },
];

const TOTAL_STEPS = JOB_SPECS.reduce((sum, spec) => sum + spec.steps.length, 0);
// 8 steps * 700ms ~= 5.6s, i.e. a run settles after roughly six seconds.
const STEP_MS = 700;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Maps the stored workflow trigger to the GitHub Actions event name. */
function toGithubEvent(trigger: string): string {
  switch (trigger) {
    case 'PUSH':
      return 'push';
    case 'PR':
      return 'pull_request';
    case 'SCHEDULE':
      return 'schedule';
    case 'MANUAL':
    default:
      return 'workflow_dispatch';
  }
}

export class CICDService {
  async listWorkflows(params: WorkflowListParams) {
    const [workflows, total] = await Promise.all([
      prisma.cICDWorkflow.findMany({
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: { runs: { take: 1, orderBy: { startedAt: 'desc' } } },
      }),
      prisma.cICDWorkflow.count(),
    ]);

    return { workflows, total };
  }

  async createWorkflow(input: CreateWorkflowInput) {
    return prisma.cICDWorkflow.create({
      data: {
        name: input.name,
        repository: this.normalizeRepository(input.repository),
        branch: input.branch,
        trigger: input.trigger,
        status: 'PENDING',
      },
      include: { runs: { take: 1, orderBy: { startedAt: 'desc' } } },
    });
  }

  /**
   * Creates a RUNNING run with build/test/deploy jobs, then advances it to a
   * terminal state over ~6 seconds. Progression never throws.
   */
  async trigger(workflowId: string) {
    const workflow = await prisma.cICDWorkflow.findUnique({ where: { id: workflowId } });
    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    const runCount = await prisma.cICDRun.count({ where: { workflowId } });
    const startedAt = new Date();

    const created = await prisma.cICDRun.create({
      data: {
        workflowId: workflow.id,
        runNumber: runCount + 1,
        branch: workflow.branch,
        commitSha: randomBytes(6).toString('hex'),
        status: 'RUNNING',
        startedAt,
        trigger: toGithubEvent(workflow.trigger),
        url: `https://github.com/${workflow.repository}/actions/runs/pending`,
      },
    });

    const run = await prisma.cICDRun.update({
      where: { id: created.id },
      data: { url: `https://github.com/${workflow.repository}/actions/runs/${created.id}` },
    });

    for (const spec of JOB_SPECS) {
      await prisma.cICDJob.create({
        data: {
          runId: run.id,
          name: spec.name,
          status: 'PENDING',
          startedAt: new Date(),
          steps: {
            create: spec.steps.map((name) => ({
              name,
              status: 'PENDING' as const,
              startedAt: new Date(),
            })),
          },
        },
      });
    }

    await prisma.cICDWorkflow.update({
      where: { id: workflow.id },
      data: { status: 'RUNNING', lastRunId: run.id, lastRunAt: new Date(), lastRunStatus: 'RUNNING' },
    });

    if (githubClient.enabled) {
      void githubClient.dispatch(workflow.branch).catch(() => false);
    }

    void this.progressRun(run.id, workflow.id).catch((err) => {
      console.error(`CI/CD run ${run.id} progression error:`, err);
    });

    return this.getRun(run.id);
  }

  async listRuns(params: RunListParams) {
    const where: Prisma.CICDRunWhereInput = {};
    if (params.workflowId) where.workflowId = params.workflowId;
    if (params.status) where.status = params.status;

    const [runs, total] = await Promise.all([
      prisma.cICDRun.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { startedAt: 'desc' },
        include: {
          workflow: { select: { id: true, name: true, repository: true } },
          jobs: {
            orderBy: { createdAt: 'asc' },
            include: { steps: { orderBy: { createdAt: 'asc' } } },
          },
        },
      }),
      prisma.cICDRun.count({ where }),
    ]);

    return { runs, total };
  }

  async getRun(id: string) {
    const run = await prisma.cICDRun.findUnique({
      where: { id },
      include: {
        workflow: { select: { id: true, name: true, repository: true, branch: true } },
        jobs: {
          orderBy: { createdAt: 'asc' },
          include: { steps: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    if (!run) {
      throw new NotFoundError('Run', id);
    }

    return run;
  }

  async getStats() {
    const [totalWorkflows, runsByStatus, aggregate] = await Promise.all([
      prisma.cICDWorkflow.count(),
      prisma.cICDRun.groupBy({ by: ['status'], _count: true }),
      prisma.cICDRun.aggregate({ _avg: { duration: true }, _count: { _all: true } }),
    ]);

    const statusCounts = runsByStatus.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count;
      return acc;
    }, {});

    const finished =
      (statusCounts.SUCCESS ?? 0) + (statusCounts.FAILURE ?? 0) + (statusCounts.CANCELLED ?? 0);
    const successRate =
      finished > 0 ? Math.round(((statusCounts.SUCCESS ?? 0) / finished) * 1000) / 10 : 0;

    const recentRuns = await prisma.cICDRun.findMany({
      take: 5,
      orderBy: { startedAt: 'desc' },
      include: { workflow: { select: { name: true, repository: true } } },
    });

    return {
      totalWorkflows,
      totalRuns: aggregate._count._all,
      runsByStatus: statusCounts,
      successRate,
      // durations are stored in seconds - expose milliseconds as the API contract states
      avgDurationMs: Math.round((aggregate._avg.duration ?? 0) * 1000),
      recentRuns,
    };
  }

  /** Live GitHub data when the integration is enabled, simulated data otherwise. */
  async getExternal() {
    try {
      if (githubClient.enabled) {
        const [workflows, runs] = await Promise.all([
          githubClient.listWorkflows(),
          githubClient.listRuns(),
        ]);
        return {
          source: 'github' as const,
          workflows: workflows ?? [],
          runs: runs ?? [],
        };
      }

      const [workflows, runs] = await Promise.all([
        prisma.cICDWorkflow.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { runs: { take: 1, orderBy: { startedAt: 'desc' } } },
        }),
        prisma.cICDRun.findMany({
          take: 10,
          orderBy: { startedAt: 'desc' },
          include: { workflow: { select: { name: true, repository: true } } },
        }),
      ]);

      return { source: 'simulated' as const, workflows, runs };
    } catch (err) {
      console.warn('CI/CD external lookup failed:', err);
      return { source: 'simulated' as const, workflows: [], runs: [] };
    }
  }

  // ---------- simulation internals ----------

  private normalizeRepository(repository: string): string {
    const trimmed = repository.trim().replace(/\.git$/, '');
    const match = trimmed.match(/github\.com\/([^/]+\/[^/]+)/);
    if (match) return match[1];
    return trimmed.replace(/^https?:\/\//, '').replace(/^\/+|\/+$/g, '');
  }

  /** Stops progression when the run was deleted or moved out of RUNNING. */
  private async isRunActive(runId: string): Promise<boolean> {
    try {
      const run = await prisma.cICDRun.findUnique({ where: { id: runId }, select: { status: true } });
      return run?.status === 'RUNNING';
    } catch {
      return false;
    }
  }

  private async progressRun(runId: string, workflowId: string): Promise<void> {
    const shouldFail = Math.random() < 0.15;
    const failAtStep = shouldFail ? Math.floor(Math.random() * TOTAL_STEPS) : -1;
    const startedAt = Date.now();
    let stepIndex = 0;

    try {
      const jobs = await prisma.cICDJob.findMany({
        where: { runId },
        orderBy: { createdAt: 'asc' },
        include: { steps: { orderBy: { createdAt: 'asc' } } },
      });

      for (let jobIndex = 0; jobIndex < jobs.length; jobIndex++) {
        const job = jobs[jobIndex];
        if (!(await this.isRunActive(runId))) return;

        await prisma.cICDJob.update({
          where: { id: job.id },
          data: { status: 'RUNNING', startedAt: new Date() },
        });

        let jobFailed = false;

        for (const step of job.steps) {
          await delay(STEP_MS);
          if (!(await this.isRunActive(runId))) return;

          const failed = stepIndex === failAtStep;
          stepIndex += 1;

          if (failed) {
            await prisma.cICDStep.update({
              where: { id: step.id },
              data: { status: 'FAILURE', completedAt: new Date(), output: 'Simulated step failure' },
            });
            jobFailed = true;
            break;
          }

          await prisma.cICDStep.update({
            where: { id: step.id },
            data: {
              status: 'SUCCESS',
              completedAt: new Date(),
              output: `${step.name} completed successfully`,
            },
          });
        }

        if (jobFailed) {
          await prisma.cICDJob.update({
            where: { id: job.id },
            data: { status: 'FAILURE', completedAt: new Date() },
          });

          for (const remaining of jobs.slice(jobIndex + 1)) {
            await prisma.cICDJob.update({
              where: { id: remaining.id },
              data: { status: 'CANCELLED', completedAt: new Date() },
            });
            await prisma.cICDStep.updateMany({
              where: { jobId: remaining.id, status: 'PENDING' },
              data: { status: 'CANCELLED', completedAt: new Date() },
            });
          }

          await this.finishRun(runId, workflowId, 'FAILURE', startedAt);
          return;
        }

        await prisma.cICDJob.update({
          where: { id: job.id },
          data: { status: 'SUCCESS', completedAt: new Date() },
        });
      }

      await this.finishRun(runId, workflowId, 'SUCCESS', startedAt);
    } catch (err) {
      console.error(`CI/CD run ${runId} progression failed:`, err);
    }
  }

  private async finishRun(
    runId: string,
    workflowId: string,
    status: 'SUCCESS' | 'FAILURE',
    startedAt: number
  ): Promise<void> {
    if (!(await this.isRunActive(runId))) return;

    const completedAt = new Date();
    await prisma.cICDRun.update({
      where: { id: runId },
      // duration is stored in seconds (same convention as prisma/seed.ts)
      data: { status, completedAt, duration: Math.max(1, Math.round((completedAt.getTime() - startedAt) / 1000)) },
    });

    await prisma.cICDWorkflow
      .update({
        where: { id: workflowId },
        data: { status, lastRunId: runId, lastRunAt: completedAt, lastRunStatus: status },
      })
      .catch(() => undefined);
  }
}

export const cicdService = new CICDService();
