// Platform health: dependency checks, readiness and integration flags.
import { useQuery } from '../api/hooks';
import { SystemHealth } from '../types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  StatCard,
} from '../components/ui';
import { DonutChart } from '../charts/charts';
import { formatDateTime, healthTone, titleCase } from '../utils/format';

interface IntegrationInfo {
  enabled: boolean;
  url: string | null;
  region?: string;
}

interface Readiness {
  ready: boolean;
  checks: Record<string, { status: string }>;
}

const COMPONENT_LABELS: Record<string, string> = {
  database: 'PostgreSQL',
  redis: 'Redis',
  prometheus: 'Prometheus',
  grafana: 'Grafana',
  opensearch: 'OpenSearch',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  aws: 'AWS',
  github: 'GitHub',
};

export default function Health() {
  const health = useQuery<SystemHealth>('/api/health', { intervalMs: 20_000 });
  const readiness = useQuery<Readiness>('/api/health/ready');
  const integrations = useQuery<Record<string, IntegrationInfo>>('/api/health/integrations');

  const components =
    health.data
      ? (Object.entries(health.data) as Array<[string, { status: string; latencyMs?: number; message?: string; checkedAt?: string }]>).filter(
          ([key]) => key !== 'overall'
        )
      : [];

  const counts = components.reduce<Record<string, number>>((acc, [, check]) => {
    acc[check.status] = (acc[check.status] ?? 0) + 1;
    return acc;
  }, {});

  const healthy = counts.HEALTHY ?? 0;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="System Health"
        description="Live dependency checks for the database, cache, observability stack and cloud integrations."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Badge tone={readiness.data?.ready ? 'success' : 'danger'}>
              {readiness.data?.ready ? 'Ready' : 'Not ready'}
            </Badge>
            <button
              className="btn sm"
              onClick={() => {
                health.reload();
                readiness.reload();
                integrations.reload();
              }}
            >
              Re-run checks
            </button>
          </div>
        }
      />

      {health.error ? (
        <ErrorState message={health.error} onRetry={health.reload} />
      ) : !health.data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-4">
            <StatCard
              label="Overall"
              value={health.data.overall}
              tone={health.data.overall === 'HEALTHY' ? 'success' : health.data.overall === 'WARNING' ? 'warning' : 'danger'}
              meta={`${healthy}/${components.length} components healthy`}
            />
            <StatCard label="Healthy" value={healthy} tone="success" />
            <StatCard
              label="Degraded"
              value={(counts.WARNING ?? 0) + (counts.DEGRADED ?? 0)}
              tone="warning"
              meta="warning / degraded"
            />
            <StatCard
              label="Down"
              value={(counts.CRITICAL ?? 0) + (counts.UNKNOWN ?? 0)}
              tone="danger"
              meta="critical / unknown"
            />
          </div>

          <div className="grid grid-2">
            <Card title="Component status">
              <div style={{ marginTop: 10 }}>
                <DonutChart
                  data={[
                    { label: 'Healthy', value: healthy, color: '#2ecc8f' },
                    { label: 'Degraded', value: (counts.WARNING ?? 0) + (counts.DEGRADED ?? 0), color: '#f5b544' },
                    { label: 'Down', value: counts.CRITICAL ?? 0, color: '#ff5d73' },
                    { label: 'Unknown', value: counts.UNKNOWN ?? 0, color: '#58c4dd' },
                  ].filter((entry) => entry.value > 0)}
                  centerLabel="components"
                  centerValue={components.length}
                />
              </div>
            </Card>

            <Card title="Integration flags" subtitle="Feature switches read from the environment">
              {integrations.loading && !integrations.data ? (
                <Spinner />
              ) : integrations.error ? (
                <ErrorState message={integrations.error} onRetry={integrations.reload} />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Integration</th>
                        <th>State</th>
                        <th>Endpoint</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(integrations.data ?? {}).map(([key, info]) => (
                        <tr key={key}>
                          <td className="small">{COMPONENT_LABELS[key] ?? titleCase(key)}</td>
                          <td>
                            <Badge tone={info.enabled ? 'success' : 'neutral'}>
                              {info.enabled ? 'enabled' : 'disabled'}
                            </Badge>
                          </td>
                          <td className="small mono muted">
                            {info.url ?? (info.region ? `region ${info.region}` : '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card title="Dependency checks">
            {components.length === 0 ? (
              <EmptyState icon="🩺" title="No checks reported" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Message</th>
                      <th>Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map(([key, check]) => (
                      <tr key={key}>
                        <td className="cell-title">{COMPONENT_LABELS[key] ?? titleCase(key)}</td>
                        <td>
                          <Badge tone={healthTone(check.status) as 'success'}>{check.status}</Badge>
                        </td>
                        <td className="mono small">{check.latencyMs !== undefined ? `${check.latencyMs} ms` : '—'}</td>
                        <td className="small muted">{check.message ?? '—'}</td>
                        <td className="small muted">{formatDateTime(check.checkedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
