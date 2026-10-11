// AWS integration: account status, inventory, service coverage and cost roll-up.
import { useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { Resource } from '../types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  StatCard,
} from '../components/ui';
import { BarChart } from '../charts/charts';
import { formatCurrency, formatDateTime, healthTone, titleCase } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

interface AwsIdentity {
  account: string;
  arn: string;
  userId: string;
}

interface AwsStatus {
  enabled: boolean;
  region: string;
  cliAvailable: boolean;
  identity: AwsIdentity | null;
  health: { ok: boolean; latencyMs: number; message: string };
}

interface AwsInstance {
  instanceId: string;
  name: string;
  state: string;
  instanceType: string;
  publicIp?: string;
  privateIp?: string;
  launchTime?: string;
  availabilityZone?: string;
}

interface AwsBucket {
  name: string;
  region: string;
  creationDate?: string;
  sizeGb?: number;
}

interface AwsInventory {
  source: string;
  region: string;
  identity: AwsIdentity | null;
  collectedAt: string;
  instances: AwsInstance[];
  buckets: AwsBucket[];
  resources: Resource[];
}

interface AwsCosts {
  totals: { dailyCost: number; monthlyCost: number; currency: string; estimateCount: number };
  byService: Array<{ service: string; dailyCost: number; monthlyCost: number }>;
  topResources: Array<{
    resourceId: string;
    resourceName: string;
    resourceType: string;
    service: string;
    dailyCost: number;
    monthlyCost: number;
  }>;
}

interface AwsServiceRow {
  service: string;
  label: string;
  description: string;
  enabled: boolean;
  resourceCount: number;
  status: 'active' | 'not-tracked';
}

export default function Aws() {
  const { hasRole } = useAuth();
  const canSync = hasRole('ADMIN', 'ENGINEER');

  const status = useQuery<AwsStatus>('/api/aws/status');
  const inventory = useQuery<AwsInventory>('/api/aws/inventory');
  const costs = useQuery<AwsCosts>('/api/aws/costs');
  const services = useQuery<AwsServiceRow[]>('/api/aws/services');

  const reload = () => {
    status.reload();
    inventory.reload();
    costs.reload();
    services.reload();
  };

  const mutation = useMutation(reload);
  const sync = () => void mutation.run(() => request('/api/aws/sync', { method: 'POST' }));

  const currency = costs.data?.totals.currency ?? 'USD';

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="AWS"
        description="Account connectivity, EC2/S3 inventory and estimated AWS spend."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={reload}>
              Refresh
            </button>
            {canSync && (
              <button className="btn sm primary" disabled={mutation.running} onClick={sync}>
                {mutation.running ? 'Syncing…' : 'Sync inventory'}
              </button>
            )}
          </div>
        }
      />

      {mutation.error && <div className="alert-banner error">{mutation.error}</div>}
      {mutation.running && <div className="alert-banner info">Reconciling AWS inventory with the resource catalogue…</div>}

      {status.loading && !status.data ? (
        <Spinner />
      ) : status.error ? (
        <ErrorState message={status.error} onRetry={status.reload} />
      ) : status.data ? (
        <div className="grid grid-4">
          <StatCard
            label="Integration"
            value={status.data.enabled ? 'Enabled' : 'Disabled'}
            tone={status.data.enabled ? 'success' : 'warning'}
            meta={status.data.enabled ? 'live AWS calls allowed' : 'demo data in use'}
          />
          <StatCard label="Region" value={status.data.region} tone="info" meta={`CLI ${status.data.cliAvailable ? 'available' : 'not found'}`} />
          <StatCard
            label="Account"
            value={status.data.identity?.account ?? '—'}
            meta={status.data.identity ? status.data.identity.arn : 'no credentials resolved'}
          />
          <StatCard
            label="Connectivity"
            value={status.data.health.ok ? 'OK' : 'Unavailable'}
            tone={status.data.health.ok ? 'success' : 'danger'}
            meta={status.data.health.message}
          />
        </div>
      ) : null}

      <div className="grid grid-4">
        <StatCard label="Instances" value={inventory.data?.instances.length ?? '—'} meta={inventory.data?.source === 'demo' ? 'demo inventory' : 'live'} />
        <StatCard label="Buckets" value={inventory.data?.buckets.length ?? '—'} />
        <StatCard label="Tracked resources" value={inventory.data?.resources.length ?? '—'} tone="info" meta="AWS rows in the catalogue" />
        <StatCard
          label="Monthly spend"
          value={formatCurrency(costs.data?.totals.monthlyCost, currency)}
          tone="danger"
          meta={`${costs.data?.totals.estimateCount ?? 0} estimates`}
        />
      </div>

      <Card
        title="EC2 instances"
        subtitle={inventory.data ? `Collected ${formatDateTime(inventory.data.collectedAt)} · source: ${inventory.data.source}` : undefined}
      >
        {inventory.loading && !inventory.data ? (
          <Spinner />
        ) : inventory.error ? (
          <ErrorState message={inventory.error} onRetry={inventory.reload} />
        ) : !inventory.data?.instances.length ? (
          <EmptyState icon="🖥️" title="No instances discovered" message="Enable the AWS integration and sync." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Instance</th>
                  <th>Type</th>
                  <th>State</th>
                  <th>Zone</th>
                  <th>Public IP</th>
                  <th>Private IP</th>
                  <th>Launched</th>
                </tr>
              </thead>
              <tbody>
                {inventory.data.instances.map((instance) => (
                  <tr key={instance.instanceId}>
                    <td>
                      <div className="cell-title">{instance.name}</div>
                      <div className="cell-sub mono">{instance.instanceId}</div>
                    </td>
                    <td className="small muted">{instance.instanceType}</td>
                    <td>
                      <Badge
                        tone={
                          instance.state === 'running'
                            ? 'success'
                            : instance.state === 'stopped'
                              ? 'neutral'
                              : 'warning'
                        }
                      >
                        {instance.state}
                      </Badge>
                    </td>
                    <td className="small muted">{instance.availabilityZone ?? '—'}</td>
                    <td className="small mono muted">{instance.publicIp ?? '—'}</td>
                    <td className="small mono muted">{instance.privateIp ?? '—'}</td>
                    <td className="small muted">{formatDateTime(instance.launchTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-2">
        <Card title="S3 buckets">
          {inventory.loading && !inventory.data ? (
            <Spinner />
          ) : !inventory.data?.buckets.length ? (
            <EmptyState icon="🪣" title="No buckets discovered" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Region</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.data.buckets.map((bucket) => (
                    <tr key={bucket.name}>
                      <td className="cell-title">{bucket.name}</td>
                      <td className="small muted">{bucket.region}</td>
                      <td className="small muted">{formatDateTime(bucket.creationDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Spend by service" subtitle="Modelled from tracked resources">
          <div style={{ marginTop: 10 }}>
            <BarChart
              unit={` ${currency}`}
              data={(costs.data?.byService ?? []).map((row) => ({
                label: row.service,
                value: row.monthlyCost,
              }))}
            />
          </div>
        </Card>
      </div>

      <Card title="Most expensive AWS resources">
        {(costs.data?.topResources ?? []).length === 0 ? (
          <EmptyState icon="💸" title="No AWS cost estimates yet" message="Run a cost estimate from the Costs page." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Type</th>
                  <th>Service</th>
                  <th>Daily</th>
                  <th>Monthly</th>
                </tr>
              </thead>
              <tbody>
                {(costs.data?.topResources ?? []).map((row) => (
                  <tr key={row.resourceId}>
                    <td className="cell-title">{row.resourceName}</td>
                    <td className="small muted">{titleCase(row.resourceType)}</td>
                    <td className="small muted">{row.service}</td>
                    <td className="mono small">{formatCurrency(row.dailyCost, currency)}</td>
                    <td className="mono">{formatCurrency(row.monthlyCost, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Service coverage" subtitle="Which AWS services are represented in the resource catalogue">
        {services.loading && !services.data ? (
          <Spinner />
        ) : services.error ? (
          <ErrorState message={services.error} onRetry={services.reload} />
        ) : (
          <div className="grid grid-3" style={{ marginTop: 12 }}>
            {(services.data ?? []).map((service) => (
              <div className="card" key={service.service} style={{ padding: 12 }}>
                <div className="row between">
                  <strong className="small">{service.label}</strong>
                  <Badge tone={service.status === 'active' ? 'success' : healthTone(service.enabled ? 'PENDING' : 'STOPPED') as 'success'}>
                    {service.status === 'active' ? 'tracking' : 'not tracked'}
                  </Badge>
                </div>
                <div className="small muted">{service.description}</div>
                <div className="small faint" style={{ marginTop: 6 }}>
                  {service.resourceCount} resource{service.resourceCount === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
