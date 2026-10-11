// GitHub Actions integration. Falls back to locally simulated pipeline data
// whenever the GitHub integration flag is disabled or no token is configured.
import { getConfig } from '@cloudops-hub/config';

const config = getConfig();

export interface GithubRun {
  id: number;
  name: string;
  runNumber: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  headBranch: string;
  headSha: string;
  event: string;
  createdAt: string;
  updatedAt: string;
}

export interface GithubWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
  createdAt: string;
  updatedAt: string;
}

class GithubClient {
  get enabled(): boolean {
    return Boolean(config.enableGithubIntegration && config.githubToken && config.githubRepo);
  }

  private get repoPath(): string {
    return `/repos/${config.githubOwner}/${config.githubRepo}`;
  }

  private async request<T>(path: string, timeoutMs = 5000): Promise<T | null> {
    if (!this.enabled) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.githubToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async listWorkflows(): Promise<GithubWorkflow[] | null> {
    const data = await this.request<{ workflows: GithubWorkflow[] }>(
      `${this.repoPath}/actions/workflows?per_page=50`
    );
    return data?.workflows ?? null;
  }

  async listRuns(workflowId?: number): Promise<GithubRun[] | null> {
    const suffix = workflowId ? `/workflows/${workflowId}/runs?per_page=20` : '/actions/runs?per_page=20';
    const data = await this.request<{ workflow_runs: GithubRun[] }>(`${this.repoPath}/actions${suffix}`);
    return data?.workflow_runs ?? null;
  }

  async dispatch(ref: string = 'main'): Promise<boolean> {
    if (!this.enabled) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`https://api.github.com${this.repoPath}/actions/workflows/dispatches`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref }),
        signal: controller.signal,
      });
      return response.status === 204;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const started = Date.now();
    if (!this.enabled) {
      return { ok: false, latencyMs: 0, message: 'GitHub integration disabled' };
    }
    const data = await this.request<{ full_name: string }>(`${this.repoPath}`);
    return {
      ok: data !== null,
      latencyMs: Date.now() - started,
      message: data ? `Connected to ${data.full_name}` : 'Unable to reach repository',
    };
  }
}

export const githubClient = new GithubClient();
