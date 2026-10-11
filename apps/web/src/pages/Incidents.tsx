// Incident management: declare, triage, investigate and resolve incidents.
import { useState } from 'react';
import { useList, useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { Incident, IncidentStats, Resource, User } from '../types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
} from '../components/ui';
import { BarChart } from '../charts/charts';
import { formatDateTime, severityTone, timeAgo, titleCase } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

const SEVERITIES = ['', 'SEV1', 'SEV2', 'SEV3', 'SEV4'];
const STATUSES = ['', 'OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'CLOSED'];

// Full incident payload returned by `GET /api/incidents/:id` (includes relations).
type IncidentDetail = Incident;

export default function Incidents() {
  const { hasRole } = useAuth();
  const canAct = hasRole('ADMIN', 'ENGINEER');

  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    severity: 'SEV3',
    affectedResourceId: '',
    assignedTo: '',
  });

  const list = useList<Incident>('/api/incidents', { severity, status, search, limit: 12 });
  const stats = useQuery<IncidentStats>('/api/incidents/stats');
  const detail = useQuery<IncidentDetail>(selectedId ? `/api/incidents/${selectedId}` : null, {
    enabled: Boolean(selectedId),
  });
  const resources = useList<Resource>('/api/resources', { limit: 100 }, { enabled: creating });
  const users = useList<User>('/api/users', { limit: 100 }, { enabled: creating });

  const reload = () => {
    list.reload();
    stats.reload();
    detail.reload();
  };

  const mutation = useMutation(reload);

  const act = (action: string, body?: unknown) => {
    if (!selectedId) return;
    void mutation.run(() =>
      request(`/api/incidents/${selectedId}/${action}`, {
        method: 'POST',
        body: body ?? {},
      })
    );
  };

  const submitCreate = () => {
    if (!form.title.trim() || !form.description.trim()) return;
    void mutation
      .run(() =>
        request<Incident>('/api/incidents', {
          method: 'POST',
          body: {
            title: form.title.trim(),
            description: form.description.trim(),
            severity: form.severity,
            ...(form.affectedResourceId ? { affectedResourceId: form.affectedResourceId } : {}),
            ...(form.assignedTo ? { assignedTo: form.assignedTo } : {}),
          },
        })
      )
      .then((created) => {
        if (created) {
          setCreating(false);
          setForm({ title: '', description: '', severity: 'SEV3', affectedResourceId: '', assignedTo: '' });
          setSelectedId(created.id);
        }
      });
  };

  const addNote = () => {
    if (!note.trim()) return;
    void mutation.run(() =>
      request(`/api/incidents/${selectedId}/notes`, { method: 'POST', body: { content: note.trim() } })
    ).then((result) => {
      if (result !== undefined) setNote('');
    });
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Incidents"
        description="Track operational incidents from declaration through resolution and post-mortem."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={reload}>
              Refresh
            </button>
            {canAct && (
              <button className="btn sm primary" onClick={() => setCreating(true)}>
                Declare incident
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-4">
        <StatCard label="Total" value={stats.data?.total ?? '—'} />
        <StatCard
          label="Open"
          value={stats.data?.open ?? '—'}
          tone={(stats.data?.open ?? 0) > 0 ? 'danger' : 'success'}
          meta="open + acknowledged + investigating"
        />
        <StatCard label="MTTR" value={`${stats.data?.mttrMinutes ?? 0}m`} tone="info" meta="last 30 days" />
        <StatCard label="SEV1" value={stats.data?.bySeverity.SEV1 ?? 0} tone="danger" meta="highest severity" />
      </div>

      <div className="grid grid-2">
        <Card title="By status">
          <div style={{ marginTop: 10 }}>
            <BarChart
              data={Object.entries(stats.data?.byStatus ?? {}).map(([label, value]) => ({
                label: titleCase(label),
                value,
              }))}
            />
          </div>
        </Card>
        <Card title="By severity">
          <div style={{ marginTop: 10 }}>
            <BarChart
              data={Object.entries(stats.data?.bySeverity ?? {}).map(([label, value]) => ({
                label,
                value,
                color: label === 'SEV1' ? '#ff5d73' : label === 'SEV2' ? '#f5b544' : undefined,
              }))}
            />
          </div>
        </Card>
      </div>

      <Card
        title="Incident queue"
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
          <EmptyState icon="🚨" title="No incidents match these filters" message="Declare one to get started." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Resource</th>
                  <th>Assignee</th>
                  <th>Opened</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <div className="cell-title">{incident.title}</div>
                      <div className="cell-sub">{incident.description}</div>
                    </td>
                    <td>
                      <Badge tone={severityTone(incident.severity) as 'danger'}>{incident.severity}</Badge>
                    </td>
                    <td>
                      <Badge
                        tone={
                          incident.status === 'RESOLVED' || incident.status === 'CLOSED'
                            ? 'success'
                            : incident.status === 'OPEN'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {incident.status}
                      </Badge>
                    </td>
                    <td className="small muted">{incident.affectedResource?.name ?? '—'}</td>
                    <td className="small muted">{incident.assignedToUser?.name ?? '—'}</td>
                    <td className="small muted">{timeAgo(incident.createdAt)}</td>
                    <td>
                      <button className="btn sm ghost" onClick={() => setSelectedId(incident.id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination pagination={list.pagination} onPage={list.setPage} label="incidents" />
      </Card>

      {selectedId && (
        <Modal title={detail.data?.title ?? 'Incident'} onClose={() => setSelectedId(null)}>
          {detail.loading ? (
            <Spinner />
          ) : detail.error ? (
            <ErrorState message={detail.error} onRetry={detail.reload} />
          ) : detail.data ? (
            <div className="stack">
              <div className="row" style={{ gap: 8 }}>
                <Badge tone={severityTone(detail.data.severity) as 'danger'}>{detail.data.severity}</Badge>
                <Badge
                  tone={
                    detail.data.status === 'RESOLVED' || detail.data.status === 'CLOSED'
                      ? 'success'
                      : detail.data.status === 'OPEN'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {detail.data.status}
                </Badge>
                <Badge tone="neutral">{timeAgo(detail.data.createdAt)}</Badge>
              </div>

              <p className="small">{detail.data.description}</p>

              <dl className="kv-list">
                <div className="kv">
                  <dt>Resource</dt>
                  <dd>{detail.data.affectedResource?.name ?? '—'}</dd>
                </div>
                <div className="kv">
                  <dt>Assignee</dt>
                  <dd>{detail.data.assignedToUser?.name ?? 'Unassigned'}</dd>
                </div>
                <div className="kv">
                  <dt>Created</dt>
                  <dd>{formatDateTime(detail.data.createdAt)}</dd>
                </div>
                <div className="kv">
                  <dt>Resolved</dt>
                  <dd>{detail.data.resolvedAt ? formatDateTime(detail.data.resolvedAt) : '—'}</dd>
                </div>
                <div className="kv">
                  <dt>Root cause</dt>
                  <dd>{detail.data.rootCause ?? '—'}</dd>
                </div>
                <div className="kv">
                  <dt>Resolution</dt>
                  <dd>{detail.data.resolution ?? '—'}</dd>
                </div>
              </dl>

              {canAct && (
                <div className="row wrap" style={{ gap: 8 }}>
                  {detail.data.status === 'OPEN' && (
                    <button className="btn sm" disabled={mutation.running} onClick={() => act('acknowledge')}>
                      Acknowledge
                    </button>
                  )}
                  {detail.data.status === 'ACKNOWLEDGED' && (
                    <button className="btn sm" disabled={mutation.running} onClick={() => act('investigate')}>
                      Start investigation
                    </button>
                  )}
                  {(detail.data.status === 'OPEN' ||
                    detail.data.status === 'ACKNOWLEDGED' ||
                    detail.data.status === 'INVESTIGATING') && (
                    <button className="btn sm primary" disabled={mutation.running} onClick={() => act('resolve')}>
                      Resolve
                    </button>
                  )}
                  {detail.data.status === 'RESOLVED' && (
                    <button className="btn sm" disabled={mutation.running} onClick={() => act('close')}>
                      Close
                    </button>
                  )}
                </div>
              )}

              <div>
                <div className="small faint" style={{ marginBottom: 8 }}>
                  Timeline
                </div>
                {(detail.data.timeline ?? []).length === 0 ? (
                  <div className="small faint">No events recorded yet.</div>
                ) : (
                  <ul className="timeline">
                    {(detail.data.timeline ?? []).map((event) => (
                      <li key={event.id}>
                        <span className="timeline-time">{formatDateTime(event.createdAt)}</span>
                        <div>
                          <strong className="small">{titleCase(event.type)}</strong>
                          <div className="small muted">{event.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="small faint" style={{ marginBottom: 8 }}>
                  Notes
                </div>
                {(detail.data.notes ?? []).length === 0 ? (
                  <div className="small faint">No notes yet.</div>
                ) : (
                  <div className="stack" style={{ gap: 8 }}>
                    {(detail.data.notes ?? []).map((entry) => (
                      <div key={entry.id} className="card" style={{ padding: 10 }}>
                        <div className="row between small">
                          <strong>{entry.user?.name ?? 'Operator'}</strong>
                          <span className="faint">{timeAgo(entry.createdAt)}</span>
                        </div>
                        <div className="small">{entry.content}</div>
                      </div>
                    ))}
                  </div>
                )}

                {canAct && (
                  <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                    <Field label="Add a note">
                      <textarea
                        className="textarea"
                        rows={2}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="What did you find?"
                      />
                    </Field>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn sm" disabled={mutation.running || !note.trim()} onClick={addNote}>
                        Add note
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {mutation.error && <div className="alert-banner error">{mutation.error}</div>}
            </div>
          ) : null}
        </Modal>
      )}

      {creating && (
        <Modal title="Declare incident" onClose={() => setCreating(false)}>
          <div className="stack">
            <Field label="Title">
              <input
                className="input"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="API latency spike in production"
              />
            </Field>
            <Field label="Description">
              <textarea
                className="textarea"
                rows={3}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="What is happening and how was it detected?"
              />
            </Field>
            <Field label="Severity">
              <select
                className="select"
                value={form.severity}
                onChange={(event) => setForm({ ...form, severity: event.target.value })}
              >
                {SEVERITIES.filter(Boolean).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Affected resource">
              <select
                className="select"
                value={form.affectedResourceId}
                onChange={(event) => setForm({ ...form, affectedResourceId: event.target.value })}
              >
                <option value="">None</option>
                {(resources.data ?? []).map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assign to">
              <select
                className="select"
                value={form.assignedTo}
                onChange={(event) => setForm({ ...form, assignedTo: event.target.value })}
              >
                <option value="">Unassigned</option>
                {(users.data ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </Field>

            {mutation.error && <div className="alert-banner error">{mutation.error}</div>}

            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={mutation.running || !form.title.trim() || !form.description.trim()}
                onClick={submitCreate}
              >
                Declare
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
