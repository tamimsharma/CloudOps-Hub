// Monitoring: fleet-wide metric overview, time series and scrape targets.
import { useState } from 'react';
import { useQuery } from '../api/hooks';
import { MetricsOverview, MetricSeries } from '../types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Spinner,
  StatCard,
} from '../components/ui';
import { LineChart } from '../charts/charts';
import { formatDuration, formatNumber, titleCase } from '../utils/format';

const RANGES = ['15m', '1h', '6h', '24h', '7d', '30d'];

interface MetricTarget {
  scrapePool?: string;
  scrapeUrl?: string;
  job?: string;
  instance?: string;
  health: string;
  lastScrape?: string;
  lastError?: string;
}

interface TargetsResponse {
  source: string;
  targets: MetricTarget[];
}

interface MultiSeriesResponse {
  range: string;
  series: MetricSeries[];
}

interface SnapshotRow {
  id: string;
  metricType: string;
  value: number;
  unit: string;
  timestamp: string;
  resourceType: string;
}

function targetName(target: MetricTarget): string {
  return target.scrapePool ?? target.job ?? target.instance ?? 'unknown';
}

function targetUrl(target: MetricTarget): string {
  return target.scrapeUrl ?? target.instance ?? '—';
}

export default function Monitoring() {
  const [range, setRange] = useState('1h');

  const overview = useQuery<MetricsOverview>('/api/metrics/overview', { intervalMs: 20_000 });
  const utilisation = useQuery<MultiSeriesResponse>(
    `/api/metrics/multi?metrics=cpu,memory,disk&range=${range}`
  );
  const traffic = useQuery<MultiSeriesResponse>(
    `/api/metrics/multi?metrics=requests,errors,latency&range=${range}`
  );
  const targets = useQuery<TargetsResponse>('/api/metrics/targets');
  const snapshots = useQuery<SnapshotRow[]>('/api/metrics/snapshots?limit=12');

  const reloadAll = () => {
    overview.reload();
    utilisation.reload();
    traffic.reload();
    targets.reload();
    snapshots.reload();
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Monitoring"
        description={
          overview.data
            ? `Metrics source: ${titleCase(overview.data.source)} · updated ${new Date(
                overview.data.updatedAt
              ).toLocaleTimeString()}`
            : 'CPU, memory, disk, network and application metrics across the fleet.'
        }
        actions={
          <div className="row" style={{ gap: 8 }}>
            <select className="select" value={range} onChange={(event) => setRange(event.target.value)}>
              {RANGES.map((option) => (
                <option key={option} value={option}>
                  Last {option}
                </option>
              ))}
            </select>
            <button className="btn sm" onClick={reloadAll}>
              Refresh
            </button>
          </div>
        }
      />

      {overview.error ? (
        <ErrorState message={overview.error} onRetry={overview.reload} />
      ) : !overview.data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-4">
            <StatCard
              label="CPU usage"
              value={`${formatNumber(overview.data.cpu.value, 1)}%`}
              tone={overview.data.cpu.value > 85 ? 'danger' : overview.data.cpu.value > 70 ? 'warning' : 'success'}
              meta={`${overview.data.resources} resources sampled`}
            />
            <StatCard
              label="Memory usage"
              value={`${formatNumber(overview.data.memory.value, 1)}%`}
              tone={overview.data.memory.value > 85 ? 'danger' : overview.data.memory.value > 70 ? 'warning' : 'success'}
              meta="fleet average"
            />
            <StatCard
              label="Disk usage"
              value={`${formatNumber(overview.data.disk.value, 1)}%`}
              tone={overview.data.disk.value > 85 ? 'danger' : overview.data.disk.value > 70 ? 'warning' : 'info'}
              meta="fleet average"
            />
            <StatCard
              label="Uptime"
              value={formatDuration(overview.data.uptimeSeconds)}
              tone="success"
              meta="since API start"
            />
          </div>

          <div className="grid grid-4">
            <StatCard
              label="Requests"
              value={formatNumber(overview.data.requests.value)}
              tone="info"
              meta={`${overview.data.requests.unit} · ${titleCase(overview.data.source)}`}
            />
            <StatCard
              label="Errors"
              value={formatNumber(overview.data.errors.value)}
              tone={(overview.data.errors.value ?? 0) > 0 ? 'warning' : 'success'}
              meta={overview.data.errors.unit}
            />
            <StatCard
              label="p95 latency"
              value={formatNumber(overview.data.latency.value, 0)}
              tone="info"
              meta={overview.data.latency.unit}
            />
            <StatCard
              label="Network in / out"
              value={`${formatNumber(overview.data.networkIn.value, 1)} / ${formatNumber(
                overview.data.networkOut.value,
                1
              )}`}
              meta={`${overview.data.networkIn.unit} · ${overview.data.networkOut.unit}`}
            />
          </div>

          <div className="grid grid-3">
            <div className="card">
              <div className="card-header">
                <div className="card-title">CPU</div>
              </div>
              <ProgressBar value={overview.data.cpu.value} />
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Memory</div>
              </div>
              <ProgressBar value={overview.data.memory.value} />
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Disk</div>
              </div>
              <ProgressBar value={overview.data.disk.value} />
            </div>
          </div>
        </>
      )}

      <div className="grid grid-2">
        <Card
          title="Utilisation trend"
          subtitle={`cpu · memory · disk over the last ${range}`}
          action={<span className="small faint">{utilisation.data?.series[0]?.source ?? ''}</span>}
        >
          {utilisation.loading && !utilisation.data ? (
            <Spinner />
          ) : utilisation.error ? (
            <ErrorState message={utilisation.error} onRetry={utilisation.reload} />
          ) : (
            <div style={{ marginTop: 10 }}>
              <LineChart unit="%" series={(utilisation.data?.series ?? []).map((entry) => ({ label: titleCase(entry.metric), points: entry.points }))} />
            </div>
          )}
        </Card>

        <Card
          title="Traffic trend"
          subtitle={`requests · errors · latency over the last ${range}`}
        >
          {traffic.loading && !traffic.data ? (
            <Spinner />
          ) : traffic.error ? (
            <ErrorState message={traffic.error} onRetry={traffic.reload} />
          ) : (
            <div style={{ marginTop: 10 }}>
              <LineChart showArea={false} series={(traffic.data?.series ?? []).map((entry) => ({ label: titleCase(entry.metric), points: entry.points }))} />
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Scrape targets"
        subtitle={`Source: ${titleCase(targets.data?.source ?? 'unknown')}`}
        action={
          <Badge tone={(targets.data?.targets ?? []).some((target) => target.health !== 'up') ? 'warning' : 'success'}>
            {(targets.data?.targets ?? []).filter((target) => target.health === 'up').length}/
            {(targets.data?.targets ?? []).length} up
          </Badge>
        }
      >
        {targets.loading && !targets.data ? (
          <Spinner />
        ) : targets.error ? (
          <ErrorState message={targets.error} onRetry={targets.reload} />
        ) : !(targets.data?.targets ?? []).length ? (
          <EmptyState icon="📡" title="No scrape targets reported" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Endpoint</th>
                  <th>Health</th>
                  <th>Last scrape</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {(targets.data?.targets ?? []).map((target, index) => (
                  <tr key={`${targetName(target)}-${index}`}>
                    <td>
                      <div className="cell-title">{targetName(target)}</div>
                    </td>
                    <td className="small mono muted">{targetUrl(target)}</td>
                    <td>
                      <Badge tone={target.health === 'up' ? 'success' : 'danger'}>{target.health}</Badge>
                    </td>
                    <td className="small muted">
                      {target.lastScrape ? new Date(target.lastScrape).toLocaleString() : '—'}
                    </td>
                    <td className="small muted">{target.lastError || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Latest readings" subtitle="Most recent metric snapshots collected by the scheduler">
        {snapshots.loading && !snapshots.data ? (
          <Spinner />
        ) : snapshots.error ? (
          <ErrorState message={snapshots.error} onRetry={snapshots.reload} />
        ) : !snapshots.data?.length ? (
          <EmptyState icon="📈" title="No metric snapshots yet" message="The collector writes a snapshot every minute." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Resource type</th>
                  <th>Value</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.data.map((row) => (
                  <tr key={row.id}>
                    <td className="small">{titleCase(row.metricType)}</td>
                    <td className="small muted">{titleCase(row.resourceType)}</td>
                    <td className="mono small">
                      {formatNumber(row.value, row.value < 10 ? 2 : 1)} {row.unit}
                    </td>
                    <td className="small muted">{new Date(row.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
