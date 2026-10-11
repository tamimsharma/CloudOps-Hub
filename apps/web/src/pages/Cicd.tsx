// CI/CD: workflows, pipeline runs and their jobs/steps.
import { useState } from 'react';
import { useList, useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { CicdRun, CicdWorkflow } from '../types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
} from '../components/ui';
import { BarChart } from '../charts/charts';
import { formatDateTime, healthTone, titleCase } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

const RUN_STATUSES = ['', 'PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'CANCELLED'];
const TRIGGERS = ['PUSH', 'PR', 'MANUAL', 'SCHEDULE'];

interface CicdStats {
  totalWorkflows: number;
  totalRuns: number;
  runsByStatus: Record<string, number>;
  successRate: number;
  avgDurationMs: number;
  recentRuns: CicdRun[];
}

interface ExternalFeed {
  source: string;
  workflows: Array<Record<string, unknown>>;
  runs: Array<Record<string, unknown>>;
}

function seconds(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 60) return `${Math.floor(value / 60)}m ${value % 60}s`;
  return `${value}s`;
}

export default function Cicd() {
  const { hasRole } = useAuth();
  const canAct = hasRole('ADMIN', 'ENGINEER');

  const [status, setStatus] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', repository: '', branch: 'main', trigger: 'PUSH' });

  const stats = useQuery<CicdStats>('/api/cicd/stats');
  const workflows = useList<CicdWorkflow>('/api/cicd/workflows', { limit: 6 });
  const runs = useList<CicdRun>('/api/cicd/runs', { status, limit: 10 });
  const external = useQuery<ExternalFeed>('/api/cicd/external');
  const runDetail = useQuery<CicdRun>(selectedRunId ? `/api/cicd/runs/${selectedRunId}` : null, {
    enabled: Boolean(selectedRunId),
  });

  const reload = () => {
    stats.reload();
    workflows.reload();
    runs.reload();
    runDetail.reload();
  };

  const mutation = useMutation(reload);

  const trigger = (workflow: CicdWorkflow) => {
    void mutation.run(() => request(`/api/cicd/workflows/${workflow.id}/trigger`, { method: 'POST' }));
  };

  const createWorkflow = () => {
    if (!form.name.trim() || !form.repository.trim()) return;
    void mutation
      .run(() =>
        request('/api/cicd/workflows', {
          method: 'POST',
          body: {
            name: form.name.trim(),
            repository: form.repository.trim(),
            branch: form.branch.trim() || 'main',
            trigger: form.trigger,
          },
        })
      )
      .then((result) => {
        if (result !== undefined) {
          setCreating(false);
          setForm({ name: '', repository: '', branch: 'main', trigger: 'PUSH' });
        }
      });
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="CI/CD"
        description="GitHub Actions workflows, run history and pipeline execution detail."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={reload}>
              Refresh
            </button>
            {canAct && (
              <button className="btn sm primary" onClick={() => setCreating(true)}>
                New workflow
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-4">
        <StatCard label="Workflows" value={stats.data?.totalWorkflows ?? '—'} />
        <StatCard label="Runs" value={stats.data?.totalRuns ?? '—'} />
        <StatCard
          label="Success rate"
          value={`${stats.data?.successRate ?? 0}%`}
          tone={(stats.data?.successRate ?? 0) >= 80 ? 'success' : 'warning'}
          meta="finished runs"
        />
        <StatCard
          label="Avg duration"
          value={seconds(Math.round((stats.data?.avgDurationMs ?? 0) / 1000))}
          tone="info"
          meta="per run"
        />
      </div>

      <div className="grid grid-2">
        <Card title="Runs by status">
          <div style={{ marginTop: 10 }}>
            <BarChart
              data={Object.entries(stats.data?.runsByStatus ?? {}).map(([label, value]) => ({
                label: titleCase(label),
                value,
                color:
                  label === 'SUCCESS'
                    ? '#2ecc8f'
                    : label === 'FAILURE'
                      ? '#ff5d73'
                      : label === 'RUNNING'
                        ? '#4f8cff'
                        : undefined,
              }))}
            />
          </div>
        </Card>

        <Card
          title="External feed"
          subtitle={`Source: ${titleCase(external.data?.source ?? 'unknown')}`}
        >
          {external.loading && !external.data ? (
            <Spinner />
          ) : external.error ? (
            <ErrorState message={external.error} onRetry={external.reload} />
          ) : (
            <dl className="kv-list" style={{ marginTop: 10 }}>
              <div className="kv">
                <dt>Workflows reported</dt>
                <dd>{external.data?.workflows.length ?? 0}</dd>
              </div>
              <div className="kv">
                <dt>Runs reported</dt>
                <dd>{external.data?.runs.length ?? 0}</dd>
              </div>
              <div className="kv">
                <dt>Mode</dt>
                <dd>
                  {external.data?.source === 'github'
                    ? 'Live GitHub API'
                    : 'Simulated (GitHub integration disabled)'}
                </dd>
              </div>
            </dl>
          )}
        </Card>
      </div>

      <Card title="Workflows">
        {workflows.loading && !workflows.data ? (
          <Spinner />
        ) : workflows.error ? (
          <ErrorState message={workflows.error} onRetry={workflows.reload} />
        ) : !workflows.data?.length ? (
          <EmptyState icon="⚙️" title="No workflows configured" message="Create one to start running pipelines." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Repository</th>
                  <th>Branch</th>
                  <th>Trigger</th>
                  <th>Last run</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {workflows.data.map((workflow) => (
                  <tr key={workflow.id}>
                    <td>
                      <div className="cell-title">{workflow.name}</div>
                      <div className="cell-sub">{workflow.repository}</div>
                    </td>
                    <td className="small mono muted">{workflow.repository}</td>
                    <td className="small muted">{workflow.branch}</td>
                    <td>
                      <Badge tone="neutral">{workflow.trigger}</Badge>
                    </td>
                    <td>
                      {workflow.lastRunStatus ? (
                        <div className="row" style={{ gap: 6 }}>
                          <Badge tone={healthTone(workflow.lastRunStatus) as 'success'}>
                            {workflow.lastRunStatus}
                          </Badge>
                          <span className="small faint">
                            {workflow.lastRunAt ? formatDateTime(workflow.lastRunAt) : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="small faint">Never</span>
                      )}
                    </td>
                    <td>
                      {canAct && (
                        <button
                          className="btn sm"
                          disabled={mutation.running}
                          onClick={() => trigger(workflow)}
                        >
                          Run
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pagination={workflows.pagination} onPage={workflows.setPage} label="workflows" />
      </Card>

      <Card
        title="Pipeline runs"
        action={
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
            {RUN_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option || 'All statuses'}
              </option>
            ))}
          </select>
        }
      >
        {runs.loading && !runs.data ? (
          <Spinner />
        ) : runs.error ? (
          <ErrorState message={runs.error} onRetry={runs.reload} />
        ) : !runs.data?.length ? (
          <EmptyState icon="🚀" title="No runs match this filter" message="Trigger a workflow to create one." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Workflow</th>
                  <th>Status</th>
                  <th>Branch</th>
                  <th>Commit</th>
                  <th>Duration</th>
                  <th>Started</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.data.map((run) => (
                  <tr key={run.id}>
                    <td className="cell-title">#{run.runNumber}</td>
                    <td className="small muted">{run.workflow?.name ?? '—'}</td>
                    <td>
                      <Badge tone={healthTone(run.status) as 'success'}>{run.status}</Badge>
                    </td>
                    <td className="small mono muted">{run.branch}</td>
                    <td className="small mono muted">{run.commitSha.slice(0, 7)}</td>
                    <td className="small muted">{seconds(run.duration)}</td>
                    <td className="small muted">{formatDateTime(run.startedAt)}</td>
                    <td>
                      <button className="btn sm ghost" onClick={() => setSelectedRunId(run.id)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pagination={runs.pagination} onPage={runs.setPage} label="runs" />
      </Card>

      {selectedRunId && (
        <Modal title={`Run #${runDetail.data?.runNumber ?? ''}`} onClose={() => setSelectedRunId(null)}>
          {runDetail.loading ? (
            <Spinner />
          ) : runDetail.error ? (
            <ErrorState message={runDetail.error} onRetry={runDetail.reload} />
          ) : runDetail.data ? (
            <div className="stack">
              <div className="row" style={{ gap: 8 }}>
                <Badge tone={healthTone(runDetail.data.status) as 'success'}>{runDetail.data.status}</Badge>
                <Badge tone="neutral">{runDetail.data.branch}</Badge>
                <Badge tone="neutral">{runDetail.data.commitSha.slice(0, 7)}</Badge>
              </div>

              <dl className="kv-list">
                <div className="kv">
                  <dt>Workflow</dt>
                  <dd>{runDetail.data.workflow?.name ?? '—'}</dd>
                </div>
                <div className="kv">
                  <dt>Trigger</dt>
                  <dd>{runDetail.data.trigger}</dd>
                </div>
                <div className="kv">
                  <dt>Started</dt>
                  <dd>{formatDateTime(runDetail.data.startedAt)}</dd>
                </div>
                <div className="kv">
                  <dt>Completed</dt>
                  <dd>{formatDateTime(runDetail.data.completedAt)}</dd>
                </div>
                <div className="kv">
                  <dt>Duration</dt>
                  <dd>{seconds(runDetail.data.duration)}</dd>
                </div>
              </dl>

              <div className="stack" style={{ gap: 10 }}>
                {(runDetail.data.jobs ?? []).map((job) => (
                  <div className="card" key={job.id} style={{ padding: 12 }}>
                    <div className="row between">
                      <strong className="small">{job.name}</strong>
                      <Badge tone={healthTone(job.status) as 'success'}>{job.status}</Badge>
                    </div>
                    <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                      {(job.steps ?? []).map((step) => (
                        <div className="row between small" key={step.id ?? step.name}>
                          <span className="muted">{step.name}</span>
                          <span className="row" style={{ gap: 6 }}>
                            <span className="faint">{step.output ?? ''}</span>
                            <Badge tone={healthTone(step.status) as 'success'}>{step.status}</Badge>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {runDetail.data.url && (
                <a className="small" href={runDetail.data.url} target="_blank" rel="noreferrer">
                  Open in GitHub ↗
                </a>
              )}
            </div>
          ) : null}
        </Modal>
      )}

      {creating && (
        <Modal title="New workflow" onClose={() => setCreating(false)}>
          <div className="stack">
            <Field label="Name">
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Deploy API"
              />
            </Field>
            <Field label="Repository" hint="owner/repo">
              <input
                className="input"
                value={form.repository}
                onChange={(event) => setForm({ ...form, repository: event.target.value })}
                placeholder="acme/cloudops"
              />
            </Field>
            <Field label="Branch">
              <input
                className="input"
                value={form.branch}
                onChange={(event) => setForm({ ...form, branch: event.target.value })}
              />
            </Field>
            <Field label="Trigger">
              <select
                className="select"
                value={form.trigger}
                onChange={(event) => setForm({ ...form, trigger: event.target.value })}
              >
                {TRIGGERS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            {mutation.error && <div className="alert-banner error">{mutation.error}</div>}

            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={mutation.running || !form.name.trim() || !form.repository.trim()}
                onClick={createWorkflow}
              >
                Create
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
