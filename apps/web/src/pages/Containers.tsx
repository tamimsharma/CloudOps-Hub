// Containers: list Docker containers and drive their lifecycle.
import { useState } from 'react';
import { useList, useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { Container } from '../types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  ProgressBar,
  Spinner,
  StatCard,
} from '../components/ui';
import { timeAgo } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

interface ContainerHealth {
  status: string;
  message: string;
}

export default function Containers() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'ENGINEER');

  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [logTarget, setLogTarget] = useState<Container | null>(null);

  // The list endpoint may return a bare array or an envelope; normalise either way.
  const list = useList<Container>('/api/containers', { name, status, limit: 12 });
  const health = useQuery<ContainerHealth>('/api/containers/health');
  const logs = useQuery<string>(logTarget ? `/api/containers/${logTarget.id}/logs?lines=120` : null, {
    enabled: Boolean(logTarget),
  });

  const mutation = useMutation(() => list.reload());

  const act = (action: 'start' | 'stop' | 'restart') => {
    if (!logTarget) return;
    void mutation.run(() => request(`/api/containers/${logTarget.id}/${action}`, { method: 'POST' }));
  };

  const rows = list.data ?? [];
  const running = rows.filter((row) => row.state?.Running || row.status === 'running').length;
  const demoMode = health.data?.status === 'DEMO';

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Containers"
        description="Docker containers managed through the Docker daemon."
        actions={
          <button className="btn sm" onClick={list.reload}>
            Refresh
          </button>
        }
      />

      <div
        className={`alert-banner ${demoMode ? 'info' : 'success'}`}
      >
        <strong>{health.data?.status ?? '…'}</strong> — {health.data?.message ?? 'Checking Docker daemon…'}
        {demoMode && ' Set ENABLE_DOCKER_INTEGRATION=true in apps/api/.env to manage real containers.'}
      </div>

      <div className="grid grid-4">
        <StatCard label="Containers" value={rows.length} />
        <StatCard label="Running" value={running} tone="success" />
        <StatCard
          label="Stopped"
          value={rows.length - running}
          tone={rows.length - running > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Images"
          value={new Set(rows.map((row) => row.image)).size}
          meta="distinct images"
        />
      </div>

      <Card
        title="Container list"
        action={
          <div className="filters">
            <input
              className="input"
              placeholder="Filter by name…"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Any status</option>
              <option value="running">running</option>
              <option value="exited">exited</option>
              <option value="paused">paused</option>
            </select>
          </div>
        }
      >
        {list.loading && !list.data ? (
          <Spinner />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="📦"
            title={demoMode ? 'Docker integration is disabled' : 'No containers found'}
            message={
              demoMode
                ? 'Containers appear here once the Docker daemon is reachable and the integration flag is on.'
                : 'No containers match the current filter.'
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Container</th>
                  <th>Image</th>
                  <th>Status</th>
                  <th>Ports</th>
                  <th>CPU</th>
                  <th>Memory</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((container) => {
                  const isRunning = container.state?.Running || container.status === 'running';
                  return (
                    <tr key={container.id}>
                      <td>
                        <div className="cell-title">{container.name}</div>
                        <div className="cell-sub mono">{container.id}</div>
                      </td>
                      <td className="small mono muted">{container.image}</td>
                      <td>
                        <Badge tone={isRunning ? 'success' : 'neutral'}>{container.status}</Badge>
                      </td>
                      <td className="small mono muted">
                        {container.ports?.length
                          ? container.ports
                              .map((port) =>
                                port.publicPort ? `${port.publicPort}→${port.privatePort}` : String(port.privatePort)
                              )
                              .join(', ')
                          : '—'}
                      </td>
                      <td style={{ minWidth: 80 }}>
                        <ProgressBar value={container.cpuUsage ?? 0} />
                        <span className="small faint">{container.cpuUsage ?? 0}%</span>
                      </td>
                      <td style={{ minWidth: 80 }}>
                        <ProgressBar value={container.memoryUsage ?? 0} />
                        <span className="small faint">{container.memoryUsage ?? 0}%</span>
                      </td>
                      <td className="small muted">{timeAgo(container.created)}</td>
                      <td>
                        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn sm ghost" onClick={() => setLogTarget(container)}>
                            Logs
                          </button>
                          {canEdit && (
                            <>
                              <button
                                className="btn sm"
                                disabled={mutation.running || isRunning}
                                onClick={() => {
                                  setLogTarget(container);
                                  void mutation.run(() =>
                                    request(`/api/containers/${container.id}/start`, { method: 'POST' })
                                  );
                                }}
                              >
                                Start
                              </button>
                              <button
                                className="btn sm"
                                disabled={mutation.running || !isRunning}
                                onClick={() => {
                                  setLogTarget(container);
                                  void mutation.run(() =>
                                    request(`/api/containers/${container.id}/stop`, { method: 'POST' })
                                  );
                                }}
                              >
                                Stop
                              </button>
                              <button
                                className="btn sm"
                                disabled={mutation.running}
                                onClick={() => {
                                  setLogTarget(container);
                                  void mutation.run(() =>
                                    request(`/api/containers/${container.id}/restart`, { method: 'POST' })
                                  );
                                }}
                              >
                                Restart
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination pagination={list.pagination} onPage={list.setPage} label="containers" />
      </Card>

      {mutation.error && <div className="alert-banner error">{mutation.error}</div>}

      {logTarget && (
        <div className="modal-backdrop" onClick={() => setLogTarget(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>
                Logs · {logTarget.name}
              </h2>
              <button className="btn ghost sm" onClick={() => setLogTarget(null)}>
                ✕
              </button>
            </div>
            {canEdit && (
              <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                <button className="btn sm" disabled={mutation.running} onClick={() => act('restart')}>
                  Restart
                </button>
                <button className="btn sm" disabled={mutation.running} onClick={() => act('stop')}>
                  Stop
                </button>
                <button className="btn sm" disabled={mutation.running} onClick={() => act('start')}>
                  Start
                </button>
              </div>
            )}
            {logs.loading ? (
              <Spinner />
            ) : logs.error ? (
              <ErrorState message={logs.error} onRetry={logs.reload} />
            ) : (
              <pre
                className="mono"
                style={{
                  maxHeight: 380,
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
          </div>
        </div>
      )}
    </div>
  );
}
