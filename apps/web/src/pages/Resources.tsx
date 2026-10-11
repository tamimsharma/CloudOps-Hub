// Resource inventory: filter, inspect and manage every tracked resource.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useList, useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { Resource } from '../types';
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
import { formatDateTime, healthTone, titleCase } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

interface ResourceStats {
  total: number;
  byStatus: Record<string, number>;
  byHealth: Record<string, number>;
  byType: Record<string, number>;
  byProvider: Record<string, number>;
  byEnvironment: Record<string, number>;
}

interface ResourceDetail extends Resource {
  deployments: Array<{ id: string; name: string; status: string; createdAt: string }>;
  alerts: Array<{ id: string; title: string; severity: string; status: string; createdAt: string }>;
  incidents: Array<{ id: string; title: string; severity: string; status: string; createdAt: string }>;
  costEstimates: Array<{ id: string; monthlyCost: number; dailyCost: number; service: string }>;
}

const STATUSES = ['', 'RUNNING', 'STOPPED', 'PENDING', 'ERROR', 'UNKNOWN'];
const HEALTHS = ['', 'HEALTHY', 'WARNING', 'DEGRADED', 'CRITICAL', 'UNKNOWN'];

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export default function Resources() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'ENGINEER');

  const [params, setParams] = useSearchParams();
  const selectedId = params.get('id');

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [provider, setProvider] = useState('');
  const [environment, setEnvironment] = useState('');
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState('');

  const stats = useQuery<ResourceStats>('/api/resources/stats');
  const list = useList<Resource>('/api/resources', {
    search,
    type,
    provider,
    environment,
    status,
    health,
    limit: 12,
  });

  const detail = useQuery<ResourceDetail>(
    selectedId ? `/api/resources/${selectedId}` : null,
    { enabled: Boolean(selectedId) }
  );

  const mutation = useMutation(() => {
    list.reload();
    stats.reload();
    detail.reload();
  });

  const open = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('id', id);
    setParams(next, { replace: true });
  };

  const close = () => {
    const next = new URLSearchParams(params);
    next.delete('id');
    setParams(next, { replace: true });
  };

  const options = useMemo(() => {
    const rows = list.data ?? [];
    return {
      types: uniq([...Object.keys(stats.data?.byType ?? {}), ...rows.map((row) => row.type)]),
      providers: uniq([...Object.keys(stats.data?.byProvider ?? {}), ...rows.map((row) => row.provider)]),
      environments: uniq([
        ...Object.keys(stats.data?.byEnvironment ?? {}),
        ...rows.map((row) => row.environment),
      ]),
    };
  }, [list.data, stats.data]);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Resource Inventory"
        description={`${stats.data?.total ?? '—'} tracked resources across AWS and Docker.`}
        actions={
          <button className="btn sm" onClick={() => { list.reload(); stats.reload(); }}>
            Refresh
          </button>
        }
      />

      <div className="grid grid-4">
        <StatCard label="Total resources" value={stats.data?.total ?? '—'} />
        <StatCard
          label="Healthy"
          value={stats.data?.byHealth.HEALTHY ?? 0}
          tone="success"
          meta={`${stats.data?.byHealth.WARNING ?? 0} warning · ${stats.data?.byHealth.CRITICAL ?? 0} critical`}
        />
        <StatCard
          label="Running"
          value={stats.data?.byStatus.RUNNING ?? 0}
          meta={`${stats.data?.byStatus.STOPPED ?? 0} stopped`}
        />
        <StatCard
          label="Production"
          value={stats.data?.byEnvironment.production ?? 0}
          tone="info"
          meta={`${stats.data?.byEnvironment.staging ?? 0} staging · ${stats.data?.byEnvironment.development ?? 0} dev`}
        />
      </div>

      <div className="grid grid-2">
        <Card title="By type">
          <div style={{ marginTop: 10 }}>
            <BarChart
              data={Object.entries(stats.data?.byType ?? {}).map(([label, value]) => ({
                label: titleCase(label),
                value,
              }))}
            />
          </div>
        </Card>
        <Card title="Health distribution">
          <div style={{ marginTop: 10 }}>
            <DonutChart
              data={Object.entries(stats.data?.byHealth ?? {}).map(([label, value]) => ({
                label: titleCase(label),
                value,
                color:
                  label === 'HEALTHY'
                    ? '#2ecc8f'
                    : label === 'WARNING'
                      ? '#f5b544'
                      : label === 'CRITICAL'
                        ? '#ff5d73'
                        : '#58c4dd',
              }))}
              centerLabel="resources"
              centerValue={stats.data?.total ?? 0}
            />
          </div>
        </Card>
      </div>

      <Card
        title="All resources"
        action={
          <div className="filters">
            <input
              className="input"
              placeholder="Search name or provider…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="select" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">All types</option>
              {options.types.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
            <select className="select" value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="">All providers</option>
              {options.providers.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
            >
              <option value="">All environments</option>
              {options.environments.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value || 'Any status'}
                </option>
              ))}
            </select>
            <select className="select" value={health} onChange={(event) => setHealth(event.target.value)}>
              {HEALTHS.map((value) => (
                <option key={value} value={value}>
                  {value || 'Any health'}
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
          <EmptyState
            icon="🔍"
            title="No resources match these filters"
            action={
              <button
                className="btn sm"
                onClick={() => {
                  setSearch('');
                  setType('');
                  setProvider('');
                  setEnvironment('');
                  setStatus('');
                  setHealth('');
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Type</th>
                  <th>Environment</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Health</th>
                  <th>CPU</th>
                  <th>Memory</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((resource) => (
                  <tr key={resource.id} onClick={() => open(resource.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="cell-title">{resource.name}</div>
                      <div className="cell-sub">{resource.provider}</div>
                    </td>
                    <td className="small muted">{titleCase(resource.type)}</td>
                    <td className="small muted">{resource.environment}</td>
                    <td className="small muted">{resource.region}</td>
                    <td>
                      <Badge tone={healthTone(resource.status) as 'success'}>{resource.status}</Badge>
                    </td>
                    <td>
                      <Badge tone={healthTone(resource.health) as 'success'}>{resource.health}</Badge>
                    </td>
                    <td style={{ minWidth: 90 }}>
                      <ProgressBar value={resource.cpuUsage ?? 0} />
                      <span className="small faint">{resource.cpuUsage ?? 0}%</span>
                    </td>
                    <td style={{ minWidth: 90 }}>
                      <ProgressBar value={resource.memoryUsage ?? 0} />
                      <span className="small faint">{resource.memoryUsage ?? 0}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination pagination={list.pagination} onPage={list.setPage} label="resources" />
      </Card>

      {selectedId && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{detail.data?.name ?? 'Resource'}</h2>
              <button className="btn ghost sm" onClick={close}>
                ✕
              </button>
            </div>

            {detail.loading ? (
              <Spinner />
            ) : detail.error ? (
              <ErrorState message={detail.error} onRetry={detail.reload} />
            ) : detail.data ? (
              <div className="stack">
                <div className="row" style={{ gap: 8 }}>
                  <Badge tone={healthTone(detail.data.status) as 'success'}>{detail.data.status}</Badge>
                  <Badge tone={healthTone(detail.data.health) as 'success'}>{detail.data.health}</Badge>
                  <Badge tone="neutral">{titleCase(detail.data.type)}</Badge>
                  <Badge tone="neutral">{detail.data.environment}</Badge>
                </div>

                <dl className="kv-list">
                  <div className="kv">
                    <dt>Provider</dt>
                    <dd>{detail.data.provider}</dd>
                  </div>
                  <div className="kv">
                    <dt>Region</dt>
                    <dd>{detail.data.region}</dd>
                  </div>
                  <div className="kv">
                    <dt>CPU / Memory / Disk</dt>
                    <dd>
                      {detail.data.cpuUsage ?? 0}% / {detail.data.memoryUsage ?? 0}% /{' '}
                      {detail.data.diskUsage ?? 0}%
                    </dd>
                  </div>
                  <div className="kv">
                    <dt>Network in / out</dt>
                    <dd>
                      {detail.data.networkIn ?? 0} / {detail.data.networkOut ?? 0} MB/s
                    </dd>
                  </div>
                  <div className="kv">
                    <dt>Last health check</dt>
                    <dd>{formatDateTime(detail.data.lastHealthCheckAt)}</dd>
                  </div>
                  <div className="kv">
                    <dt>Tags</dt>
                    <dd className="mono">
                      {Object.entries(detail.data.tags ?? {})
                        .map(([key, value]) => `${key}=${value}`)
                        .join(', ') || '—'}
                    </dd>
                  </div>
                  <div className="kv">
                    <dt>Metadata</dt>
                    <dd className="mono">
                      {Object.entries(detail.data.metadata ?? {})
                        .map(([key, value]) => `${key}=${String(value)}`)
                        .join(', ') || '—'}
                    </dd>
                  </div>
                </dl>

                <div className="grid grid-3">
                  <StatCard label="Deployments" value={detail.data.deployments.length} />
                  <StatCard
                    label="Open alerts"
                    value={detail.data.alerts.filter((alert) => alert.status !== 'RESOLVED').length}
                    tone="warning"
                  />
                  <StatCard
                    label="Open incidents"
                    value={detail.data.incidents.filter((incident) => incident.status !== 'CLOSED' && incident.status !== 'RESOLVED').length}
                    tone="danger"
                  />
                </div>

                {detail.data.costEstimates[0] && (
                  <div className="small">
                    Latest estimate:{' '}
                    <strong className="mono">
                      ${detail.data.costEstimates[0].monthlyCost.toFixed(2)}/mo
                    </strong>{' '}
                    <span className="faint">({detail.data.costEstimates[0].service})</span>
                  </div>
                )}

                {canEdit && (
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      className="btn sm"
                      disabled={mutation.running}
                      onClick={() =>
                        void mutation.run(() =>
                          request(`/api/resources/${detail.data!.id}/health`, {
                            method: 'POST',
                            body: { health: 'HEALTHY' },
                          })
                        )
                      }
                    >
                      Re-run health check
                    </button>
                    <button
                      className="btn sm danger"
                      disabled={mutation.running}
                      onClick={() => {
                        if (!window.confirm(`Delete ${detail.data!.name}?`)) return;
                        void mutation.run(() =>
                          request(`/api/resources/${detail.data!.id}`, { method: 'DELETE' })
                        ).then((result) => {
                          if (result !== undefined) close();
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}

                {mutation.error && <div className="alert-banner error">{mutation.error}</div>}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="small faint">Select a row to inspect a resource, its alerts and its cost estimate.</div>
    </div>
  );
}
