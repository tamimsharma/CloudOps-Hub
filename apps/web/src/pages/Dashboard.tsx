// Operations overview: health score, capacity, live charts and recent activity.
import { Link } from 'react-router-dom';
import { useQuery } from '../api/hooks';
import { DashboardSummary } from '../types';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner, StatCard } from '../components/ui';
import { BarChart, DonutChart, Gauge, LineChart, Sparkline } from '../charts/charts';
import { formatCurrency, formatPercent, healthTone, severityTone, timeAgo, titleCase } from '../utils/format';

function entriesToData(record: Record<string, number> | undefined, colors?: string[]) {
  return Object.entries(record ?? {}).map(([label, value], index) => ({
    label: titleCase(label),
    value,
    color: colors?.[index % colors.length],
  }));
}

const HEALTH_COLORS = ['#2ecc8f', '#f5b544', '#ff5d73', '#58c4dd', '#67758f'];

export default function Dashboard() {
  const { data, loading, error, reload } = useQuery<DashboardSummary>('/api/dashboard/summary', {
    intervalMs: 15_000,
  });

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState title="No dashboard data" message="Run the database seed first." />;

  const cpu = data.series.find((entry) => entry.metric === 'cpu');
  const memory = data.series.find((entry) => entry.metric === 'memory');
  const requests = data.series.find((entry) => entry.metric === 'requests');
  const errors = data.series.find((entry) => entry.metric === 'errors');
  const uptimeHours = Math.floor(data.uptimeSeconds / 3600);
  const uptimeMinutes = Math.floor((data.uptimeSeconds % 3600) / 60);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Dashboard"
        description={`Live operations overview · metrics source: ${data.metricsSource} · updated ${timeAgo(data.generatedAt)}`}
        actions={
          <button className="btn sm" onClick={reload}>
            Refresh
          </button>
        }
      />

      <div className="grid grid-4">
        <StatCard
          label="Health score"
          value={<Gauge value={data.healthScore} label="overall health" size={150} />}
          meta=""
        />
        <StatCard
          label="Resources"
          value={data.resources.total}
          meta={`${data.resources.byStatus.RUNNING ?? 0} running · ${data.resources.byStatus.STOPPED ?? 0} stopped`}
        />
        <StatCard
          label="Open alerts"
          value={data.alerts.open}
          tone={data.alerts.critical > 0 ? 'danger' : data.alerts.open > 0 ? 'warning' : 'success'}
          meta={`${data.alerts.critical} critical`}
        />
        <StatCard
          label="Open incidents"
          value={data.incidents.open}
          tone={data.incidents.open > 0 ? 'warning' : 'success'}
          meta={`MTTR tracked on the incidents page`}
        />
      </div>

      <div className="grid grid-4">
        <StatCard
          label="Avg CPU"
          value={formatPercent(data.resources.avgCpu)}
          meta={cpu ? <Sparkline points={cpu.points} color="#4f8cff" /> : undefined}
        />
        <StatCard
          label="Avg memory"
          value={formatPercent(data.resources.avgMemory)}
          meta={memory ? <Sparkline points={memory.points} color="#7a5cff" /> : undefined}
        />
        <StatCard
          label="Monthly cost"
          value={formatCurrency(data.costs.totalMonthly, data.costs.currency)}
          tone="info"
          meta={`${formatCurrency(data.costs.totalDaily, data.costs.currency)} / day`}
        />
        <StatCard
          label="API uptime"
          value={`${uptimeHours}h ${uptimeMinutes}m`}
          meta={`${data.logs.total24h.toLocaleString()} log lines in 24h · ${formatPercent(data.logs.errorRate)} errors`}
        />
      </div>

      <div className="grid grid-2">
        <Card title="Infrastructure capacity" subtitle="CPU and memory across all tracked resources">
          <div className="grid grid-2" style={{ marginTop: 12 }}>
            <div>
              <div className="row between small">
                <span className="muted">CPU</span>
                <span className="mono">{formatPercent(data.resources.avgCpu)}</span>
              </div>
              <div className="progress" style={{ marginTop: 6 }}>
                <span style={{ width: `${Math.min(100, data.resources.avgCpu)}%` }} />
              </div>
            </div>
            <div>
              <div className="row between small">
                <span className="muted">Memory</span>
                <span className="mono">{formatPercent(data.resources.avgMemory)}</span>
              </div>
              <div className="progress" style={{ marginTop: 6 }}>
                <span style={{ width: `${Math.min(100, data.resources.avgMemory)}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-2" style={{ marginTop: 18 }}>
            <div>
              <div className="small faint" style={{ marginBottom: 8 }}>
                Resource health
              </div>
              <DonutChart
                data={entriesToData(data.resources.byHealth, HEALTH_COLORS)}
                centerLabel="resources"
                centerValue={data.resources.total}
                size={140}
              />
            </div>
            <div>
              <div className="small faint" style={{ marginBottom: 8 }}>
                Deployments by status
              </div>
              <DonutChart
                data={entriesToData(data.deployments.byStatus)}
                centerLabel="deployments"
                centerValue={data.deployments.total}
                size={140}
              />
            </div>
          </div>
        </Card>

        <Card
          title="Traffic & errors"
          subtitle="Rolling 24h window"
          action={<Link className="small" to="/monitoring">Open monitoring →</Link>}
        >
          <div className="stack" style={{ gap: 14, marginTop: 10 }}>
            <div>
              <div className="small faint">Requests per second</div>
              {requests && <LineChart series={[{ points: requests.points, label: 'req/s' }]} height={150} unit="/s" />}
            </div>
            <div>
              <div className="small faint">Errors per minute</div>
              {errors && (
                <LineChart
                  series={[{ points: errors.points, label: 'errors', color: '#ff5d73' }]}
                  height={150}
                  showArea
                />
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-3">
        <Card
          title="Recent alerts"
          action={<Link className="small" to="/alerts">All alerts →</Link>}
        >
          {data.alerts.recent.length === 0 ? (
            <EmptyState icon="✅" title="No recent alerts" />
          ) : (
            <div className="stack" style={{ gap: 8, marginTop: 10 }}>
              {data.alerts.recent.slice(0, 6).map((alert) => (
                <div key={alert.id} className="row between" style={{ gap: 8 }}>
                  <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {alert.title}
                  </span>
                  <Badge tone={severityTone(alert.severity) as 'danger'}>{alert.severity}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent deployments" action={<Link className="small" to="/deployments">All →</Link>}>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            {data.deployments.recent.slice(0, 6).map((deployment) => (
              <div key={deployment.id} className="row between" style={{ gap: 8 }}>
                <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {deployment.name}
                  <span className="faint mono"> {deployment.tag}</span>
                </span>
                <Badge tone={healthTone(deployment.status) as 'success'}>{deployment.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Cost trend" subtitle="Daily spend, last 14 days" action={<Link className="small" to="/costs">Details →</Link>}>
          <div style={{ marginTop: 10 }}>
            <LineChart
              series={[
                {
                  points: data.costs.trend.map((point) => ({
                    timestamp: new Date(point.date).getTime(),
                    value: point.value,
                  })),
                  label: 'daily cost',
                  color: '#2ecc8f',
                },
              ]}
              height={150}
              unit="$"
            />
          </div>
          <div className="small faint" style={{ marginTop: 6 }}>
            Projected monthly:{' '}
            <strong className="mono">{formatCurrency(data.costs.totalMonthly, data.costs.currency)}</strong>
          </div>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Kubernetes footprint">
          <div className="grid grid-3" style={{ marginTop: 10 }}>
            <StatCard label="Clusters" value={data.kubernetes.clusters} />
            <StatCard label="Workloads" value={data.kubernetes.workloads} />
            <StatCard
              label="Ready"
              value={data.kubernetes.ready}
              tone={data.kubernetes.ready === data.kubernetes.workloads ? 'success' : 'warning'}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <BarChart
              data={[
                { label: 'Ready replicas', value: data.kubernetes.ready, color: '#2ecc8f' },
                { label: 'Total workloads', value: data.kubernetes.workloads, color: '#4f8cff' },
              ]}
            />
          </div>
          <div className="small" style={{ marginTop: 12 }}>
            <Link to="/kubernetes">Open Kubernetes console →</Link>
          </div>
        </Card>

        <Card title="Activity feed" subtitle="Alerts, deployments and incidents">
          <div className="timeline" style={{ marginTop: 12 }}>
            {data.activity.slice(0, 8).map((entry, index) => (
              <li key={`${entry.type}-${index}`}>
                <span className="timeline-time">{timeAgo(entry.timestamp)}</span>
                <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                  <Badge tone={severityTone(entry.severity) as 'info'}>{titleCase(entry.type)}</Badge>
                  <span className="small">{entry.message}</span>
                </div>
              </li>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
