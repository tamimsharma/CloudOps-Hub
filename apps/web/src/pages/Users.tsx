// User administration: accounts, roles and access status (ADMIN).
import { useState } from 'react';
import { useList, useMutation, useQuery } from '../api/hooks';
import { request } from '../api/client';
import { Role, User } from '../types';
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
import { formatDateTime, titleCase } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

const ROLES: Role[] = ['ADMIN', 'ENGINEER', 'VIEWER'];

interface UserStats {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<string, number>;
}

const EMPTY_FORM = { email: '', name: '', password: '', role: 'VIEWER' as Role };

export default function Users() {
  const { user: currentUser, hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');

  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ name: '', role: 'VIEWER' as Role, isActive: true });

  const list = useList<User>('/api/users', { role, search, limit: 10 });
  const stats = useQuery<UserStats>(isAdmin ? '/api/users/stats' : null, { enabled: isAdmin });

  const reload = () => {
    list.reload();
    stats.reload();
  };

  const mutation = useMutation(reload);

  const submitCreate = () => {
    if (!form.email.trim() || !form.name.trim() || form.password.length < 8) return;
    void mutation
      .run(() =>
        request('/api/users', {
          method: 'POST',
          body: {
            email: form.email.trim(),
            name: form.name.trim(),
            password: form.password,
            role: form.role,
          },
        })
      )
      .then((result) => {
        if (result !== undefined) {
          setCreating(false);
          setForm(EMPTY_FORM);
        }
      });
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setEditForm({ name: user.name, role: user.role, isActive: user.isActive ?? true });
  };

  const submitEdit = () => {
    if (!editing) return;
    void mutation
      .run(() =>
        request(`/api/users/${editing.id}`, {
          method: 'PATCH',
          body: { name: editForm.name.trim(), role: editForm.role, isActive: editForm.isActive },
        })
      )
      .then((result) => {
        if (result !== undefined) setEditing(null);
      });
  };

  const remove = (user: User) => {
    if (!window.confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    void mutation
      .run(() => request(`/api/users/${user.id}`, { method: 'DELETE' }))
      .then((result) => {
        if (result !== undefined) reload();
      });
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Users"
        description="Manage accounts and role-based access control for the platform."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={reload}>
              Refresh
            </button>
            {isAdmin && (
              <button className="btn sm primary" onClick={() => setCreating(true)}>
                Invite user
              </button>
            )}
          </div>
        }
      />

      {!isAdmin && (
        <div className="alert-banner info">
          You are signed in as {currentUser?.role}. Only administrators can create, modify or delete users.
        </div>
      )}

      {isAdmin && (
        <div className="grid grid-4">
          <StatCard label="Total users" value={stats.data?.total ?? '—'} />
          <StatCard label="Active" value={stats.data?.active ?? '—'} tone="success" />
          <StatCard label="Inactive" value={stats.data?.inactive ?? 0} tone="warning" />
          <StatCard label="Administrators" value={stats.data?.byRole.ADMIN ?? 0} tone="danger" />
        </div>
      )}

      {isAdmin && (
        <div className="grid grid-2">
          <Card title="By role">
            <div style={{ marginTop: 10 }}>
              <BarChart
                data={Object.entries(stats.data?.byRole ?? {}).map(([label, value]) => ({
                  label: titleCase(label),
                  value,
                }))}
              />
            </div>
          </Card>
          <Card title="Access model" subtitle="How roles map to permissions">
            <dl className="kv-list" style={{ marginTop: 10 }}>
              <div className="kv">
                <dt>ADMIN</dt>
                <dd className="small">Full control: users, destructive actions, configuration.</dd>
              </div>
              <div className="kv">
                <dt>ENGINEER</dt>
                <dd className="small">Operate the platform: deployments, incidents, alerts, syncs.</dd>
              </div>
              <div className="kv">
                <dt>VIEWER</dt>
                <dd className="small">Read-only access to dashboards, inventory and reports.</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      <Card
        title="Accounts"
        action={
          <div className="filters">
            <input
              className="input"
              placeholder="Search name or email…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="select" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">All roles</option>
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {option}
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
          <EmptyState icon="👥" title="No users match these filters" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="cell-title">{user.name}</div>
                      <div className="cell-sub">{user.email}</div>
                    </td>
                    <td>
                      <Badge tone={user.role === 'ADMIN' ? 'danger' : user.role === 'ENGINEER' ? 'info' : 'neutral'}>
                        {user.role}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={user.isActive === false ? 'neutral' : 'success'}>
                        {user.isActive === false ? 'Inactive' : 'Active'}
                      </Badge>
                    </td>
                    <td className="small muted">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</td>
                    <td className="small muted">{formatDateTime(user.createdAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        {isAdmin ? (
                          <>
                            <button className="btn sm ghost" onClick={() => openEdit(user)}>
                              Edit
                            </button>
                            {user.id !== currentUser?.id && (
                              <button className="btn sm danger" onClick={() => remove(user)}>
                                Delete
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="small faint">Read-only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination pagination={list.pagination} onPage={list.setPage} label="users" />
      </Card>

      {creating && (
        <Modal title="Invite user" onClose={() => setCreating(false)}>
          <div className="stack">
            <Field label="Name">
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Ada Lovelace"
              />
            </Field>
            <Field label="Email">
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="ada@cloudops.local"
              />
            </Field>
            <Field label="Password" hint="At least 8 characters. Never reuse an existing password.">
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Role">
              <select
                className="select"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
              >
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
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
                disabled={
                  mutation.running ||
                  !form.email.trim() ||
                  !form.name.trim() ||
                  form.password.length < 8
                }
                onClick={submitCreate}
              >
                Create
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="stack">
            <Field label="Name">
              <input
                className="input"
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              />
            </Field>
            <Field label="Role">
              <select
                className="select"
                value={editForm.role}
                onChange={(event) => setEditForm({ ...editForm, role: event.target.value as Role })}
              >
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(event) => setEditForm({ ...editForm, isActive: event.target.checked })}
              />
              Account active (inactive users cannot sign in)
            </label>

            {mutation.error && <div className="alert-banner error">{mutation.error}</div>}

            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={mutation.running || !editForm.name.trim()}
                onClick={submitEdit}
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
