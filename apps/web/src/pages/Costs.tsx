// Cost estimation: totals, breakdowns, per-resource estimates and forecast.
import { useState } from 'react';
import { useList, useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { CostEstimate, CostForecast, CostSummary } from '../types';
import {
  Card,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
} from '../components/ui';
import { BarChart, LineChart } from '../charts/charts';
import { formatCurrency, formatDateTime, titleCase } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

export default function Costs() {
  const { hasRole } = useAuth();
  const canEstimate = hasRole('ADMIN', 'ENGINEER');

  const [provider, setProvider] = useState('');
  const [service, setService] = useState('');
  const [selected, setSelected] = useState<CostEstimate | null>(null);
  const [months, setMonths] = useState(6);

  const summary = useQuery<CostSummary>('/api/costs/summary');
  const forecast = useQuery<CostForecast>(`/api/costs/forecast?months=${months}`);
  const list = useList<CostEstimate>('/api/costs', { provider, service, limit: 10 });

  const reload = () => {
    summary.reload();
    list.reload();
    forecast.reload();
  };

  const mutation = useMutation(reload);

  const estimateAll = () => {
    void mutation.run(() => request('/api/costs/estimate', { method: 'POST', body: {} }));
  };

  const currency = summary.data?.currency ?? 'USD';
  const trend = summary.data?.trend ?? [];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Cost Estimation"
        description="Modelled spend per resource and service, with a rolling forecast. Figures are estimates, not invoices."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={reload}>
              Refresh
            </button>
            {canEstimate && (
              <button className="btn sm primary" disabled={mutation.running} onClick={estimateAll}>
                {mutation.running ? 'Estimating…' : 'Re-estimate all'}
              </button>
            )}
          </div>
        }
      />

      {mutation.error && <div className="alert-banner error">{mutation.error}</div>}

      <div className="grid grid-4">
        <StatCard
          label="Monthly total"
          value={formatCurrency(summary.data?.totalMonthly, currency)}
          tone="danger"
          meta={`${summary.data?.resourceCount ?? 0} costed resources`}
        />
        <StatCard label="Daily total" value={formatCurrency(summary.data?.totalDaily, currency)} meta="run rate" />
        <StatCard
          label="Top provider"
          value={
            Object.entries(summary.data?.byProvider ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
          }
          tone="info"
          meta="by monthly cost"
        />
        <StatCard
          label="Forecast"
          value={formatCurrency(forecast.data?.months[months - 1]?.projected, forecast.data?.currency ?? currency)}
          tone="warning"
          meta={`${months} months out · +${((forecast.data?.growthRate ?? 0) * 100).toFixed(0)}%/mo growth`}
        />
      </div>

      <div className="grid grid-2">
        <Card title="Spend trend" subtitle="Modelled daily totals">
          <div style={{ marginTop: 10 }}>
            <LineChart
              unit={` ${currency}`}
              series={[
                {
                  label: 'Daily cost',
                  points: trend.map((point) => ({
                    timestamp: Date.parse(point.date),
                    value: point.value,
                  })),
                },
              ]}
            />
          </div>
        </Card>
        <Card
          title="Forecast"
          subtitle={`Next ${months} months`}
          action={
            <select
              className="select"
              value={months}
              onChange={(event) => setMonths(Number(event.target.value))}
            >
              {[3, 6, 9, 12].map((option) => (
                <option key={option} value={option}>
                  {option} months
                </option>
              ))}
            </select>
          }
        >
          <div style={{ marginTop: 10 }}>
            <LineChart
              unit={` ${currency}`}
              showArea={false}
              series={[
                {
                  label: 'Projected',
                  points: (forecast.data?.months ?? []).map((month) => ({
                    timestamp: Date.parse(`${month.month}-01`),
                    value: month.projected,
                  })),
                },
                {
                  label: 'Optimistic',
                  color: '#2ecc8f',
                  points: (forecast.data?.months ?? []).map((month) => ({
                    timestamp: Date.parse(`${month.month}-01`),
                    value: month.low,
                  })),
                },
                {
                  label: 'Pessimistic',
                  color: '#ff5d73',
                  points: (forecast.data?.months ?? []).map((month) => ({
                    timestamp: Date.parse(`${month.month}-01`),
                    value: month.high,
                  })),
                },
              ]}
            />
          </div>
        </Card>
      </div>

      <div className="grid grid-3">
        <Card title="By provider">
          <div style={{ marginTop: 10 }}>
            <BarChart
              unit={` ${currency}`}
              data={Object.entries(summary.data?.byProvider ?? {}).map(([label, value]) => ({
                label,
                value,
              }))}
            />
          </div>
        </Card>
        <Card title="By service">
          <div style={{ marginTop: 10 }}>
            <BarChart
              unit={` ${currency}`}
              data={Object.entries(summary.data?.byService ?? {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([label, value]) => ({ label: titleCase(label), value }))}
            />
          </div>
        </Card>
        <Card title="By environment">
          <div style={{ marginTop: 10 }}>
            <BarChart
              unit={` ${currency}`}
              data={Object.entries(summary.data?.byEnvironment ?? {}).map(([label, value]) => ({
                label: titleCase(label),
                value,
              }))}
            />
          </div>
        </Card>
      </div>

      <Card title="Most expensive resources" subtitle="Top contributors to the monthly total">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Resource</th>
                <th>Type</th>
                <th>Environment</th>
                <th>Daily</th>
                <th>Monthly</th>
              </tr>
            </thead>
            <tbody>
              {(summary.data?.topResources ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="cell-title">{row.name}</td>
                  <td className="small muted">{titleCase(row.type)}</td>
                  <td className="small muted">{row.environment ?? '—'}</td>
                  <td className="mono small">{formatCurrency(row.dailyCost, currency)}</td>
                  <td className="mono">{formatCurrency(row.monthlyCost, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Resource estimates"
        action={
          <div className="filters">
            <select className="select" value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="">All providers</option>
              {Object.keys(summary.data?.byProvider ?? {}).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select className="select" value={service} onChange={(event) => setService(event.target.value)}>
              <option value="">All services</option>
              {Object.keys(summary.data?.byService ?? {}).map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
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
          <EmptyState icon="💰" title="No cost estimates yet" message="Run an estimate to populate this table." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Provider</th>
                  <th>Service</th>
                  <th>Daily</th>
                  <th>Monthly</th>
                  <th>Estimated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.map((estimate) => (
                  <tr key={estimate.id}>
                    <td className="cell-title">{estimate.resource?.name ?? estimate.resourceId}</td>
                    <td className="small muted">{estimate.provider}</td>
                    <td className="small muted">{titleCase(estimate.service)}</td>
                    <td className="mono small">{formatCurrency(estimate.dailyCost, estimate.currency)}</td>
                    <td className="mono">{formatCurrency(estimate.monthlyCost, estimate.currency)}</td>
                    <td className="small muted">{formatDateTime(estimate.estimatedAt)}</td>
                    <td>
                      <button className="btn sm ghost" onClick={() => setSelected(estimate)}>
                        Breakdown
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination pagination={list.pagination} onPage={list.setPage} label="estimates" />
      </Card>

      <Card title="Modelling assumptions" subtitle="How these numbers are produced">
        <ul className="small muted" style={{ paddingLeft: 18, marginTop: 8 }}>
          {(summary.data?.assumptions ?? []).map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </Card>

      {selected && (
        <Modal title={`Cost breakdown — ${selected.resource?.name ?? selected.resourceId}`} onClose={() => setSelected(null)}>
          <div className="stack">
            <div className="grid grid-3">
              <StatCard label="Daily" value={formatCurrency(selected.dailyCost, selected.currency)} />
              <StatCard label="Monthly" value={formatCurrency(selected.monthlyCost, selected.currency)} tone="danger" />
              <StatCard label="Service" value={titleCase(selected.service)} tone="info" />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Line item</th>
                    <th>Quantity</th>
                    <th>Unit price</th>
                    <th>Daily</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.breakdown.map((line, index) => (
                    <tr key={`${line.category}-${index}`}>
                      <td className="small">{titleCase(line.category)}</td>
                      <td className="mono small">
                        {line.quantity} {line.unit}
                      </td>
                      <td className="mono small">{formatCurrency(line.unitPrice, selected.currency)}</td>
                      <td className="mono small">{formatCurrency(line.dailyCost, selected.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="small faint" style={{ marginBottom: 6 }}>
                Assumptions
              </div>
              <ul className="small muted" style={{ paddingLeft: 18 }}>
                {selected.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
