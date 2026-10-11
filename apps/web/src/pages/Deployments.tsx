// Deployments: rollout list, scaling, restarts and per-deployment logs.
import { useState } from 'react';
import { useList, useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { Deployment } from '../types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
} from '../components/ui';
import { DonutChart } from '../charts/charts';
import { formatDateTime, healthTone, titleCase, timeAgo } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

interface DeploymentStats {
  total: number;
  byStatus: Record<string, number>;
}

const STATUSES = ['', 'PENDING', 'BUILDING', 'DEPLOYING', 'RUNNING', 'FAILED', 'STOPPED', 'ROLLED_BACK'];

export default function Deployments() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'ENGINEER');

  const [status, setStatus] = useState('');
  const [scaleTarget, setScaleTarget] = useState<Deployment | null>(null);
  const [replicas, setReplicas] = useState(1);
  const [logTarget, setLogTarget] = useState<Deployment | null>(null);

  const stats = useQuery<DeploymentStats>('/api/deployments/stats');
  const list = useList<Deployment>('/api/deployments', { status, limit: 12 });
  const logs = useQuery<string>(logTarget ? `/api/deployments/${logTarget.id}/logs?lines=150` : null, {
    enabled: Boolean(logTarget),
  });

  const mutation = useMutation(() => {
    list.reload();
    stats.reload();
    logs.reload();
  });

  const deployRow = (deployment: Deployment) => (
    <tr key={deployment.id}>
      <td>
        <div className="cell-title">{deployment.name}</div>
        <div className="cell-sub mono">
          {deployment.image}:{deployment.tag}
        </div>
      </td>
      <td>
        <Badge tone={healthTone(deployment.status) as 'success'}>{deployment.status}</Badge>
        {deployment.errorMessage && (
          <div className="cell-sub" style={{ color: 'var(--danger)' }}>
            {deployment.errorMessage}
          </div>
        )}
      </td>
      <td className="small mono muted">{deployment.replicas}</td>
      <td className="small muted">{deployment.resource?.name ?? '—'}</td>
      <td className="small muted">{deployment.user?.name ?? '—'}</td>
      <td className="small muted">{formatDateTime(deployment.createdAt)}</td>
      <td>
        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn sm ghost" onClick={() => setLogTarget(deployment)}>
            Logs
          </button>
          {canEdit && (
            <>
              <button
                className="btn sm"
                disabled={mutation.running}
                onClick={() =>
                  void mutation.run(() =>
                    request(`/api/deployments/${deployment.id}/restart`, { method: 'POST' })
                  )
                }
              >
                Restart
              </button>
              <button
                className="btn sm"
                disabled={mutation.running}
                onClick={() => {
                  setScaleTarget(deployment);
                  setReplicas(deployment.replicas);
                }}
              >
                Scale
              </button>
              <button
                className="btn sm danger"
                disabled={mutation.running}
                onClick={() => {
                  if (!window.confirm(`Delete deployment ${deployment.name}?`)) return;
                  void mutation.run(() =>
                    request(`/api/deployments/${deployment.id}`, { method: 'DELETE' })
                  );
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Deployments"
        description={`${stats.data?.total ?? '—'} deployments tracked by the platform.`}
        actions={
          <button className="btn sm" onClick={() => { list.reload(); stats.reload(); }}>
            Refresh
          </button>
        }
      />

      <div className="grid grid-4">
        <StatCard label="Total" value={stats.data?.total ?? '—'} />
        <StatCard
          label="Running"
          value={stats.data?.byStatus.RUNNING ?? 0}
          tone="success"
        />
        <StatCard
          label="Failed"
          value={stats.data?.byStatus.FAILED ?? 0}
          tone={(stats.data?.byStatus.FAILED ?? 0) > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Stopped"
          value={stats.data?.byStatus.STOPPED ?? 0}
          tone="warning"
        />
      </div>

      <Card title="Status breakdown">
        <div style={{ marginTop: 10 }}>
          <DonutChart
            data={Object.entries(stats.data?.byStatus ?? {}).map(([label, value]) => ({
              label: titleCase(label),
              value,
              color:
                label === 'RUNNING'
                  ? '#2ecc8f'
                  : label === 'FAILED'
                    ? '#ff5d73'
                    : label === 'STOPPED'
                      ? '#93a1bd'
                      : '#f5b544',
            }))}
            centerLabel="deployments"
            centerValue={stats.data?.total ?? 0}
          />
        </div>
      </Card>

      <Card
        title="All deployments"
        action={
          <div className="filters">
            <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value || 'Any status'}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {list.loading && !list.data ? (
          <Spinner />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : !list.data?.length ? (
          <EmptyState icon="🚀" title="No deployments match this filter" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Deployment</th>
                  <th>Status</th>
                  <th>Replicas</th>
                  <th>Resource</th>
                  <th>Deployed by</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>{list.data.map(deployRow)}</tbody>
            </table>
          </div>
        )}

        <Pagination pagination={list.pagination} onPage={list.setPage} label="deployments" />
      </Card>

      {mutation.error && <div className="alert-banner error">{mutation.error}</div>}

      {scaleTarget && (
        <div className="modal-backdrop" onClick={() => setScaleTarget(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Scale {scaleTarget.name}</h2>
              <button className="btn ghost sm" onClick={() => setScaleTarget(null)}>
                ✕
              </button>
            </div>
            <div className="stack">
              <p className="small muted">
                Currently running {scaleTarget.replicas} replica(s) of {scaleTarget.image}:{scaleTarget.tag}.
              </p>
              <Field label="Replicas" hint="1–100">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={100}
                  value={replicas}
                  onChange={(event) => setReplicas(Number(event.target.value))}
                />
              </Field>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn primary"
                  disabled={mutation.running}
                  onClick={() =>
                    void mutation
                      .run(() =>
                        request(`/api/deployments/${scaleTarget.id}/scale`, {
                          method: 'POST',
                          body: { replicas },
                        })
                      )
                      .then((result) => {
                        if (result !== undefined) setScaleTarget(null);
                      })
                  }
                >
                  {mutation.running ? 'Scaling…' : 'Scale'}
                </button>
                <button className="btn ghost" onClick={() => setScaleTarget(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {logTarget && (
        <div className="modal-backdrop" onClick={() => setLogTarget(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Logs · {logTarget.name}</h2>
              <button className="btn ghost sm" onClick={() => setLogTarget(null)}>
                ✕
              </button>
            </div>
            {logs.loading ? (
              <Spinner />
            ) : logs.error ? (
              <ErrorState message={logs.error} onRetry={logs.reload} />
            ) : (
              <pre
                className="mono"
                style={{
                  maxHeight: 400,
                  overflow: 'auto',
                  background: 'var(--bg-elevated)',
                  padding: 12,
                  borderRadius: 8,
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                }}
              >
                {logs.data || '(no output)'}
              </pre>
            )}
            <div className="small faint" style={{ marginTop: 8 }}>
              Last updated {timeAgo(new Date().toISOString())}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
