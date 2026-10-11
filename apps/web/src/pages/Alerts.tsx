// Alert centre: filter, acknowledge and resolve firing alerts.
import { useState } from 'react';
import { useList, useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { Alert, AlertStats } from '../types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
} from '../components/ui';
import { BarChart } from '../charts/charts';
import { formatDateTime, severityTone, titleCase, timeAgo } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

const SEVERITIES = ['', 'CRITICAL', 'WARNING', 'INFO'];
const STATUSES = ['', 'FIRING', 'ACKNOWLEDGED', 'RESOLVED'];
const RANGES = ['1h', '24h', '7d', '30d'];

export default function Alerts() {
  const { hasRole } = useAuth();
  const canAct = hasRole('ADMIN', 'ENGINEER');

  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('FIRING');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState('24h');
  const [selected, setSelected] = useState<Alert | null>(null);

  const list = useList<Alert>('/api/alerts', { severity, status, search, limit: 15 });
  const stats = useQuery<AlertStats>(`/api/alerts/stats?range=${range}`);

  const mutation = useMutation(() => {
    list.reload();
    stats.reload();
    setSelected(null);
  });

  const act = (action: 'acknowledge' | 'resolve') => {
    if (!selected) return;
    void mutation.run(() => request(`/api/alerts/${selected.id}/${action}`, { method: 'POST' }));
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Alerts"
        description="Threshold and anomaly detections from Prometheus, deployments and Kubernetes."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <select className="select" value={range} onChange={(event) => setRange(event.target.value)}>
              {RANGES.map((option) => (
                <option key={option} value={option}>
                  Last {option}
                </option>
              ))}
            </select>
            {canAct && (
              <button
                className="btn sm"
                onClick={() => void mutation.run(() => request('/api/alerts/evaluate', { method: 'POST' }))}
              >
                Run detection rules
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-4">
        <StatCard label="Total" value={stats.data?.total ?? '—'} meta={`last ${range}`} />
        <StatCard
          label="Open"
          value={stats.data?.open ?? '—'}
          tone={(stats.data?.open ?? 0) > 0 ? 'warning' : 'success'}
          meta="firing + acknowledged"
        />
        <StatCard label="Critical" value={stats.data?.bySeverity.CRITICAL ?? 0} tone="danger" />
        <StatCard label="Resolved" value={stats.data?.byStatus.RESOLVED ?? 0} tone="success" />
      </div>

      <div className="grid grid-2">
        <Card title="By severity">
          <div style={{ marginTop: 10 }}>
            <BarChart
              data={Object.entries(stats.data?.bySeverity ?? {}).map(([label, value]) => ({
                label: titleCase(label),
                value,
              }))}
            />
          </div>
        </Card>
        <Card title="By source">
          <div style={{ marginTop: 10 }}>
            <BarChart
              data={(stats.data?.bySource ?? []).map((row) => ({
                label: titleCase(row.source),
                value: row.count,
              }))}
            />
          </div>
        </Card>
      </div>

      <Card
        title="Alert queue"
        action={
          <div className="filters">
            <input
              className="input"
              placeholder="Search title or description…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="select" value={severity} onChange={(event) => setSeverity(event.target.value)}>
              {SEVERITIES.map((option) => (
                <option key={option} value={option}>
                  {option || 'All severities'}
                </option>
              ))}
            </select>
            <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option || 'All statuses'}
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
          <EmptyState icon="✅" title="No alerts match these filters" message="Try widening the status filter." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Resource</th>
                  <th>Raised</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <div className="cell-title">{alert.title}</div>
                      <div className="cell-sub">{alert.description}</div>
                    </td>
                    <td>
                      <Badge tone={severityTone(alert.severity) as 'danger'}>{alert.severity}</Badge>
                    </td>
                    <td>
                      <Badge tone={alert.status === 'RESOLVED' ? 'success' : alert.status === 'FIRING' ? 'danger' : 'warning'}>
                        {alert.status}
                      </Badge>
                    </td>
                    <td className="small muted">{titleCase(alert.source)}</td>
                    <td className="small muted">{alert.resource?.name ?? '—'}</td>
                    <td className="small muted">{timeAgo(alert.createdAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn sm ghost" onClick={() => setSelected(alert)}>
                          View
                        </button>
                        {canAct && alert.status === 'FIRING' && (
                          <button className="btn sm" onClick={() => {
                            setSelected(alert);
                            void mutation.run(() => request(`/api/alerts/${alert.id}/acknowledge`, { method: 'POST' }));
                          }}>
                            Ack
                          </button>
                        )}
                        {canAct && alert.status !== 'RESOLVED' && (
                          <button className="btn sm" onClick={() => {
                            setSelected(alert);
                            void mutation.run(() => request(`/api/alerts/${alert.id}/resolve`, { method: 'POST' }));
                          }}>
                            Resolve
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

        <Pagination pagination={list.pagination} onPage={list.setPage} label="alerts" />
      </Card>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{selected.title}</h2>
              <button className="btn ghost sm" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
            <div className="stack">
              <div className="row" style={{ gap: 8 }}>
                <Badge tone={severityTone(selected.severity) as 'danger'}>{selected.severity}</Badge>
                <Badge tone={selected.status === 'RESOLVED' ? 'success' : 'warning'}>{selected.status}</Badge>
                <Badge tone="neutral">{titleCase(selected.source)}</Badge>
              </div>
              <p className="small">{selected.description}</p>
              <dl className="kv-list">
                <div className="kv">
                  <dt>Raised</dt>
                  <dd>{formatDateTime(selected.createdAt)}</dd>
                </div>
                <div className="kv">
                  <dt>Resource</dt>
                  <dd>{selected.resource?.name ?? 'Unassigned'}</dd>
                </div>
                <div className="kv">
                  <dt>Acknowledged by</dt>
                  <dd>{selected.acknowledgedByUser?.name ?? '—'}</dd>
                </div>
                <div className="kv">
                  <dt>Resolved at</dt>
                  <dd>{selected.resolvedAt ? formatDateTime(selected.resolvedAt) : '—'}</dd>
                </div>
              </dl>
              {mutation.error && <div className="alert-banner error">{mutation.error}</div>}
              {canAct && (
                <div className="row" style={{ gap: 8 }}>
                  {selected.status === 'FIRING' && (
                    <button className="btn" disabled={mutation.running} onClick={() => act('acknowledge')}>
                      Acknowledge
                    </button>
                  )}
                  {selected.status !== 'RESOLVED' && (
                    <button className="btn primary" disabled={mutation.running} onClick={() => act('resolve')}>
                      Resolve
                    </button>
                  )}
                </div>
              )}
              {!canAct && <div className="small faint">Viewer role: read-only access.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
