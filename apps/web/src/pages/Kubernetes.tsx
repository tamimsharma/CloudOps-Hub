// Kubernetes: clusters and their workloads with scale/restart/log actions.
import { useState } from 'react';
import { useList, useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { K8sCluster, K8sWorkload } from '../types';
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
import { BarChart, DonutChart } from '../charts/charts';
import { formatNumber, healthTone, titleCase } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

interface K8sStats {
  totalClusters: number;
  clustersByStatus: Record<string, number>;
  totalWorkloads: number;
  workloadsByStatus: Record<string, number>;
}

interface WorkloadDetail extends K8sWorkload {
  cluster: K8sCluster;
  annotations?: Record<string, string>;
}

export default function Kubernetes() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'ENGINEER');

  const [namespace, setNamespace] = useState('');
  const [workloadStatus, setWorkloadStatus] = useState('');
  const [detail, setDetail] = useState<WorkloadDetail | null>(null);
  const [tab, setTab] = useState<'overview' | 'logs' | 'events'>('overview');

  const stats = useQuery<K8sStats>('/api/kubernetes/stats');
  const clusters = useList<K8sCluster>('/api/kubernetes/clusters', { limit: 10 });
  const workloads = useList<K8sWorkload>('/api/kubernetes/workloads', {
    namespace,
    status: workloadStatus,
    limit: 15,
  });

  const workloadLogs = useQuery<string>(
    detail && tab === 'logs' ? `/api/kubernetes/workloads/${detail.id}/logs?lines=120` : null,
    { enabled: Boolean(detail && tab === 'logs') }
  );
  const workloadEvents = useQuery<Array<{ type: string; reason: string; message: string; timestamp: string }>>(
    detail && tab === 'events' ? `/api/kubernetes/workloads/${detail.id}/events` : null,
    { enabled: Boolean(detail && tab === 'events') }
  );

  const mutation = useMutation(() => {
    workloads.reload();
    stats.reload();
    clusters.reload();
  });

  const namespaces = Array.from(new Set((workloads.data ?? []).map((row) => row.namespace))).sort();
  const statuses = Array.from(new Set((workloads.data ?? []).map((row) => row.status))).sort();

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Kubernetes"
        description="Clusters, workloads and replica health across the fleet."
        actions={
          <button
            className="btn sm"
            onClick={() => {
              workloads.reload();
              clusters.reload();
              stats.reload();
            }}
          >
            Refresh
          </button>
        }
      />

      <div className="grid grid-4">
        <StatCard label="Clusters" value={stats.data?.totalClusters ?? '—'} />
        <StatCard
          label="Running clusters"
          value={stats.data?.clustersByStatus.RUNNING ?? 0}
          tone="success"
        />
        <StatCard label="Workloads" value={stats.data?.totalWorkloads ?? '—'} />
        <StatCard
          label="Workloads in error"
          value={stats.data?.workloadsByStatus.ERROR ?? 0}
          tone={(stats.data?.workloadsByStatus.ERROR ?? 0) > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="grid grid-2">
        <Card title="Workloads by status">
          <div style={{ marginTop: 10 }}>
            <BarChart
              data={Object.entries(stats.data?.workloadsByStatus ?? {}).map(([label, value]) => ({
                label: titleCase(label),
                value,
                color: label === 'ERROR' ? '#ff5d73' : label === 'RUNNING' ? '#2ecc8f' : '#f5b544',
              }))}
            />
          </div>
        </Card>
        <Card title="Replica readiness">
          <div style={{ marginTop: 10 }}>
            <DonutChart
              data={[
                {
                  label: 'Ready',
                  value: (workloads.data ?? []).reduce((sum, row) => sum + row.readyReplicas, 0),
                  color: '#2ecc8f',
                },
                {
                  label: 'Desired but not ready',
                  value: (workloads.data ?? []).reduce(
                    (sum, row) => sum + Math.max(0, row.desiredReplicas - row.readyReplicas),
                    0
                  ),
                  color: '#ff5d73',
                },
              ]}
              centerLabel="replicas"
              centerValue={(workloads.data ?? []).reduce((sum, row) => sum + row.desiredReplicas, 0)}
            />
          </div>
        </Card>
      </div>

      <Card title="Clusters">
        {clusters.loading && !clusters.data ? (
          <Spinner />
        ) : clusters.error ? (
          <ErrorState message={clusters.error} onRetry={clusters.reload} />
        ) : !clusters.data?.length ? (
          <EmptyState icon="⎈" title="No clusters registered" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cluster</th>
                  <th>Provider</th>
                  <th>Version</th>
                  <th>Nodes</th>
                  <th>Workloads</th>
                  <th>CPU / Memory capacity</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clusters.data.map((cluster) => (
                  <tr key={cluster.id}>
                    <td>
                      <div className="cell-title">{cluster.name}</div>
                      <div className="cell-sub">{cluster.region}</div>
                    </td>
                    <td className="small muted">{cluster.provider}</td>
                    <td className="small mono muted">{cluster.version}</td>
                    <td className="small">{cluster.nodeCount}</td>
                    <td className="small">{cluster._count?.workloads ?? 0}</td>
                    <td className="small mono muted">
                      {cluster.cpuCapacity} vCPU · {formatNumber(cluster.memoryCapacity)} MiB
                    </td>
                    <td>
                      <Badge tone={healthTone(cluster.status) as 'success'}>{cluster.status}</Badge>{' '}
                      <Badge tone={healthTone(cluster.health) as 'success'}>{cluster.health}</Badge>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        {canEdit && (
                          <button
                            className="btn sm"
                            disabled={mutation.running}
                            onClick={() =>
                              void mutation.run(() =>
                                request(`/api/kubernetes/clusters/${cluster.id}/sync`, { method: 'POST' })
                              )
                            }
                          >
                            Sync
                          </button>
                        )}
                        {canEdit && (
                          <button
                            className="btn sm danger"
                            disabled={mutation.running}
                            onClick={() => {
                              if (!window.confirm(`Delete cluster ${cluster.name}?`)) return;
                              void mutation.run(() =>
                                request(`/api/kubernetes/clusters/${cluster.id}`, { method: 'DELETE' })
                              );
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Workloads"
        action={
          <div className="filters">
            <select
              className="select"
              value={namespace}
              onChange={(event) => setNamespace(event.target.value)}
            >
              <option value="">All namespaces</option>
              {namespaces.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={workloadStatus}
              onChange={(event) => setWorkloadStatus(event.target.value)}
            >
              <option value="">Any status</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {workloads.loading && !workloads.data ? (
          <Spinner />
        ) : workloads.error ? (
          <ErrorState message={workloads.error} onRetry={workloads.reload} />
        ) : !workloads.data?.length ? (
          <EmptyState icon="⎈" title="No workloads match this filter" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workload</th>
                  <th>Kind</th>
                  <th>Ready</th>
                  <th>Restarts</th>
                  <th>CPU</th>
                  <th>Memory</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {workloads.data.map((workload) => (
                  <tr key={workload.id}>
                    <td>
                      <div className="cell-title">{workload.name}</div>
                      <div className="cell-sub">
                        {workload.namespace} · {workload.cluster?.name ?? workload.clusterId}
                      </div>
                    </td>
                    <td className="small muted">{workload.kind}</td>
                    <td style={{ minWidth: 100 }}>
                      <div className="small mono">
                        {workload.readyReplicas}/{workload.desiredReplicas}
                      </div>
                      <ProgressBar
                        value={workload.readyReplicas}
                        max={Math.max(1, workload.desiredReplicas)}
                      />
                    </td>
                    <td className="small mono">{workload.restartCount}</td>
                    <td className="small mono">{workload.cpuUsage ?? 0}%</td>
                    <td className="small mono">{workload.memoryUsage ?? 0}%</td>
                    <td>
                      <Badge tone={healthTone(workload.status) as 'success'}>{workload.status}</Badge>{' '}
                      <Badge tone={healthTone(workload.health) as 'success'}>{workload.health}</Badge>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          className="btn sm ghost"
                          onClick={() => {
                            setDetail(workload as WorkloadDetail);
                            setTab('overview');
                          }}
                        >
                          View
                        </button>
                        {canEdit && (
                          <>
                            <button
                              className="btn sm"
                              disabled={mutation.running}
                              onClick={() =>
                                void mutation.run(() =>
                                  request(`/api/kubernetes/workloads/${workload.id}/restart`, {
                                    method: 'POST',
                                  })
                                )
                              }
                            >
                              Restart
                            </button>
                            <button
                              className="btn sm"
                              disabled={mutation.running}
                              onClick={() => {
                                const input = window.prompt(
                                  `Replicas for ${workload.name}`,
                                  String(workload.desiredReplicas)
                                );
                                if (!input) return;
                                const next = Number(input);
                                if (!Number.isFinite(next) || next < 1) return;
                                void mutation.run(() =>
                                  request(`/api/kubernetes/workloads/${workload.id}/scale`, {
                                    method: 'POST',
                                    body: { replicas: next },
                                  })
                                );
                              }}
                            >
                              Scale
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination pagination={workloads.pagination} onPage={workloads.setPage} label="workloads" />
      </Card>

      {mutation.error && <div className="alert-banner error">{mutation.error}</div>}

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{detail.name}</h2>
              <button className="btn ghost sm" onClick={() => setDetail(null)}>
                ✕
              </button>
            </div>

            <div className="tabs" style={{ marginBottom: 12 }}>
              {(['overview', 'logs', 'events'] as const).map((id) => (
                <button
                  key={id}
                  className={`tab ${tab === id ? 'active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  {titleCase(id)}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="stack">
                <div className="row" style={{ gap: 8 }}>
                  <Badge tone="neutral">{detail.kind}</Badge>
                  <Badge tone={healthTone(detail.status) as 'success'}>{detail.status}</Badge>
                  <Badge tone={healthTone(detail.health) as 'success'}>{detail.health}</Badge>
                </div>
                <dl className="kv-list">
                  <div className="kv">
                    <dt>Namespace</dt>
                    <dd>{detail.namespace}</dd>
                  </div>
                  <div className="kv">
                    <dt>Cluster</dt>
                    <dd>{detail.cluster?.name ?? detail.clusterId}</dd>
                  </div>
                  <div className="kv">
                    <dt>Replicas</dt>
                    <dd>
                      {detail.readyReplicas} ready / {detail.availableReplicas} available /{' '}
                      {detail.desiredReplicas} desired
                    </dd>
                  </div>
                  <div className="kv">
                    <dt>Restarts</dt>
                    <dd>{detail.restartCount}</dd>
                  </div>
                  <div className="kv">
                    <dt>CPU / Memory</dt>
                    <dd>
                      {detail.cpuUsage ?? 0}% / {detail.memoryUsage ?? 0}%
                    </dd>
                  </div>
                  <div className="kv">
                    <dt>Labels</dt>
                    <dd className="mono">
                      {Object.entries(detail.labels ?? {})
                        .map(([key, value]) => `${key}=${value}`)
                        .join(', ') || '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {tab === 'logs' &&
              (workloadLogs.loading ? (
                <Spinner />
              ) : workloadLogs.error ? (
                <ErrorState message={workloadLogs.error} onRetry={workloadLogs.reload} />
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
                  {workloadLogs.data || '(no output)'}
                </pre>
              ))}

            {tab === 'events' &&
              (workloadEvents.loading ? (
                <Spinner />
              ) : workloadEvents.error ? (
                <ErrorState message={workloadEvents.error} onRetry={workloadEvents.reload} />
              ) : !workloadEvents.data?.length ? (
                <EmptyState icon="🗓" title="No events recorded" />
              ) : (
                <div className="timeline">
                  {workloadEvents.data.map((event, index) => (
                    <li key={`${event.reason}-${index}`}>
                      <span className="timeline-time">{event.timestamp}</span>
                      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                        <Badge tone={event.type === 'Warning' ? 'danger' : 'neutral'}>{event.reason}</Badge>
                        <span className="small">{event.message}</span>
                      </div>
                    </li>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
