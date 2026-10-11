// Operational reports: generate, download and manage Markdown reports.
import { useState } from 'react';
import { useList, useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { Report } from '../types';
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
} from '../components/ui';
import { formatDateTime, titleCase } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

interface ReportTypeMeta {
  value: string;
  label: string;
  description: string;
}

const STATUSES = ['', 'PENDING', 'GENERATING', 'COMPLETED', 'FAILED'];

function statusTone(status: Report['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'GENERATING' || status === 'PENDING') return 'warning';
  return 'neutral';
}

export default function Reports() {
  const { hasRole } = useAuth();
  const canCreate = hasRole('ADMIN', 'ENGINEER');
  const isAdmin = hasRole('ADMIN');

  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: 'INVENTORY', name: '' });
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);

  const types = useQuery<ReportTypeMeta[]>('/api/reports/types');
  const list = useList<Report>('/api/reports', { status, type, limit: 10 });

  const reload = () => list.reload();
  const mutation = useMutation(reload);

  const submit = () => {
    void mutation
      .run(() =>
        request<Report>('/api/reports', {
          method: 'POST',
          body: {
            type: form.type,
            ...(form.name.trim() ? { name: form.name.trim() } : {}),
          },
        })
      )
      .then((created) => {
        if (created) {
          setCreating(false);
          setForm({ type: 'INVENTORY', name: '' });
          window.setTimeout(reload, 1200);
        }
      });
  };

  const download = (report: Report) => {
    void mutation.run(async () => {
      const content = await request<string>(`/api/reports/${report.id}/download`, { raw: true });
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${report.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return content;
    });
  };

  const previewReport = (report: Report) => {
    void mutation.run(async () => {
      const content = await request<string>(`/api/reports/${report.id}/download`, { raw: true });
      setPreview({ title: report.name, content });
      return content;
    });
  };

  const remove = (report: Report) => {
    if (!window.confirm(`Delete report "${report.name}"?`)) return;
    void mutation.run(() => request(`/api/reports/${report.id}`, { method: 'DELETE' }));
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Reports"
        description="Generated operational reports: inventory, cost analysis, incidents, deployments, health and compliance."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={reload}>
              Refresh
            </button>
            {canCreate && (
              <button className="btn sm primary" onClick={() => setCreating(true)}>
                Generate report
              </button>
            )}
          </div>
        }
      />

      {mutation.error && <div className="alert-banner error">{mutation.error}</div>}

      <Card title="Report types" subtitle="Pick a template when generating">
        <div className="grid grid-3" style={{ marginTop: 12 }}>
          {(types.data ?? []).map((meta) => (
            <div className="card" key={meta.value} style={{ padding: 12 }}>
              <div className="cell-title">{meta.label}</div>
              <div className="small muted">{meta.description}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Generated reports"
        action={
          <div className="filters">
            <select className="select" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">All types</option>
              {(types.data ?? []).map((meta) => (
                <option key={meta.value} value={meta.value}>
                  {meta.label}
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
          <EmptyState
            icon="📊"
            title="No reports yet"
            message="Generate one from a template above."
            action={
              canCreate ? (
                <button className="btn sm primary" onClick={() => setCreating(true)}>
                  Generate report
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Requested by</th>
                  <th>Created</th>
                  <th>Completed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <div className="cell-title">{report.name}</div>
                      {report.errorMessage && <div className="cell-sub">{report.errorMessage}</div>}
                    </td>
                    <td className="small muted">{titleCase(report.type)}</td>
                    <td>
                      <Badge tone={statusTone(report.status)}>{report.status}</Badge>
                    </td>
                    <td className="small muted">{report.generatedByUser?.name ?? '—'}</td>
                    <td className="small muted">{formatDateTime(report.createdAt)}</td>
                    <td className="small muted">{formatDateTime(report.completedAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        {report.status === 'COMPLETED' && (
                          <>
                            <button className="btn sm ghost" disabled={mutation.running} onClick={() => previewReport(report)}>
                              Preview
                            </button>
                            <button className="btn sm" disabled={mutation.running} onClick={() => download(report)}>
                              Download
                            </button>
                          </>
                        )}
                        {isAdmin && (
                          <button className="btn sm danger" disabled={mutation.running} onClick={() => remove(report)}>
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

        <Pagination pagination={list.pagination} onPage={list.setPage} label="reports" />
      </Card>

      {creating && (
        <Modal title="Generate report" onClose={() => setCreating(false)}>
          <div className="stack">
            <Field label="Report type">
              <select
                className="select"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value })}
              >
                {(types.data ?? []).map((meta) => (
                  <option key={meta.value} value={meta.value}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name" hint="Optional — defaults to the type plus today's date.">
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Weekly operations review"
              />
            </Field>

            <div className="small faint">
              The file is built in the background; refresh after a second to download it.
            </div>

            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="btn primary" disabled={mutation.running} onClick={submit}>
                {mutation.running ? 'Queuing…' : 'Generate'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {preview && (
        <Modal title={preview.title} onClose={() => setPreview(null)}>
          <div className="stack">
            <pre
              className="small mono"
              style={{
                whiteSpace: 'pre-wrap',
                maxHeight: '55vh',
                overflowY: 'auto',
                background: 'rgba(0,0,0,0.25)',
                padding: 12,
                borderRadius: 8,
              }}
            >
              {preview.content}
            </pre>
            <div className="small faint">Markdown source — use Download to save it locally.</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
