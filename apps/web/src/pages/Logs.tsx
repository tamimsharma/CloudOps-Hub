// Centralised log explorer: search, filter and inspect aggregated log entries.
import { useState } from 'react';
import { useList, useQuery } from '../api/hooks';
import { LogEntry, LogStats } from '../types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
} from '../components/ui';
import { BarChart, DonutChart, LineChart } from '../charts/charts';
import { formatDateTime, titleCase } from '../utils/format';

const RANGES = ['15m', '1h', '6h', '24h', '7d', '30d'];
const SEVERITIES = ['', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

const SEVERITY_COLORS: Record<string, string> = {
  DEBUG: '#58c4dd',
  INFO: '#4f8cff',
  WARN: '#f5b544',
  ERROR: '#ff5d73',
  FATAL: '#7a5cff',
};

export default function Logs() {
  const [range, setRange] = useState('24h');
  const [severity, setSeverity] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LogEntry | null>(null);

  const stats = useQuery<LogStats>(`/api/logs/stats?range=${range}&source=${source}`);
  const sources = useQuery<string[]>('/api/logs/sources');
  const list = useList<LogEntry>('/api/logs', { range, severity, source, search, limit: 25 });

  const timeline = stats.data?.timeline ?? [];
  const errorRate = stats.data?.errorRate ?? 0;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Logs"
        description="Aggregated application and infrastructure logs (PostgreSQL locally, OpenSearch when enabled)."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <select className="select" value={range} onChange={(event) => setRange(event.target.value)}>
              {RANGES.map((option) => (
                <option key={option} value={option}>
                  Last {option}
                </option>
              ))}
            </select>
            <button className="btn sm" onClick={() => { stats.reload(); list.reload(); }}>
              Refresh
            </button>
          </div>
        }
      />

      <div className="grid grid-4">
        <StatCard label="Entries" value={stats.data?.total ?? '—'} meta={`last ${range}`} />
        <StatCard label="Errors" value={(stats.data?.bySeverity.ERROR ?? 0) + (stats.data?.bySeverity.FATAL ?? 0)} tone="danger" />
        <StatCard label="Warnings" value={stats.data?.bySeverity.WARN ?? 0} tone="warning" />
        <StatCard
          label="Error rate"
          value={`${errorRate.toFixed(1)}%`}
          tone={errorRate > 5 ? 'danger' : errorRate > 1 ? 'warning' : 'success'}
          meta={`source: ${titleCase(stats.data?.source ?? 'unknown')}`}
        />
      </div>

      <div className="grid grid-2">
        <Card title="Log volume" subtitle={`Buckets across the last ${range}`}>
          {stats.loading && !stats.data ? (
            <Spinner />
          ) : (
            <div style={{ marginTop: 10 }}>
              <LineChart
                height={200}
                series={[
                  {
                    label: 'Entries',
                    points: timeline.map((bucket) => ({
                      timestamp: Date.parse(bucket.timestamp),
                      value: bucket.count,
                    })),
                  },
                  {
                    label: 'Errors',
                    color: '#ff5d73',
                    points: timeline.map((bucket) => ({
                      timestamp: Date.parse(bucket.timestamp),
                      value: bucket.errors,
                    })),
                  },
                ]}
              />
            </div>
          )}
        </Card>

        <Card title="By severity">
          <div style={{ marginTop: 10 }}>
            <DonutChart
              data={Object.entries(stats.data?.bySeverity ?? {})
                .filter(([, value]) => value > 0)
                .map(([label, value]) => ({
                  label,
                  value,
                  color: SEVERITY_COLORS[label] ?? '#4f8cff',
                }))}
              centerLabel="entries"
              centerValue={stats.data?.total ?? 0}
            />
          </div>
        </Card>
      </div>

      <Card title="By source" subtitle="Where the traffic is coming from">
        <div style={{ marginTop: 10 }}>
          <BarChart
            data={(stats.data?.bySource ?? []).map((row) => ({
              label: row.source,
              value: row.count,
            }))}
          />
        </div>
      </Card>

      <Card
        title="Log stream"
        action={
          <div className="filters">
            <input
              className="input"
              placeholder="Search message text…"
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
            <select className="select" value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">All sources</option>
              {(sources.data ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
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
            icon="📄"
            title="No log entries match these filters"
            message="Widen the time range or clear the search."
          />
        ) : (
          <div className="log-list">
            {list.data.map((entry) => (
              <div
                className="log-row"
                key={entry.id}
                onClick={() => setSelected(entry)}
                style={{ cursor: 'pointer' }}
              >
                <span className="log-time">{formatDateTime(entry.timestamp)}</span>
                <span className={`log-sev ${entry.severity}`}>{entry.severity}</span>
                <span className="log-source">{entry.source}</span>
                <span className="log-message">{entry.message}</span>
              </div>
            ))}
          </div>
        )}

        <Pagination pagination={list.pagination} onPage={list.setPage} label="log entries" />
      </Card>

      {selected && (
        <Modal title="Log entry" onClose={() => setSelected(null)}>
          <div className="stack">
            <div className="row" style={{ gap: 8 }}>
              <Badge tone={selected.severity === 'ERROR' || selected.severity === 'FATAL' ? 'danger' : selected.severity === 'WARN' ? 'warning' : 'info'}>
                {selected.severity}
              </Badge>
              <Badge tone="neutral">{selected.source}</Badge>
            </div>
            <p className="small mono" style={{ whiteSpace: 'pre-wrap' }}>
              {selected.message}
            </p>
            <dl className="kv-list">
              <div className="kv">
                <dt>Timestamp</dt>
                <dd>{formatDateTime(selected.timestamp)}</dd>
              </div>
              <div className="kv">
                <dt>Trace ID</dt>
                <dd className="mono">{selected.traceId ?? '—'}</dd>
              </div>
              <div className="kv">
                <dt>Resource</dt>
                <dd className="mono">{selected.resourceId ?? '—'}</dd>
              </div>
            </dl>
            {selected.fields && Object.keys(selected.fields).length > 0 && (
              <div>
                <div className="small faint" style={{ marginBottom: 6 }}>
                  Structured fields
                </div>
                <dl className="kv-list">
                  {Object.entries(selected.fields).map(([key, value]) => (
                    <div className="kv" key={key}>
                      <dt>{key}</dt>
                      <dd className="mono">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
