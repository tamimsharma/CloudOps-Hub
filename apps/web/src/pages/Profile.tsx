// Account profile: session details and password change for the signed-in user.
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { request } from '../api/client';
import { useQuery } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { Badge, Card, ErrorState, PageHeader, Spinner } from '../components/ui';
import { User } from '../types';
import { formatDateTime } from '../utils/format';

const RULES: Array<{ label: string; test: (value: string) => boolean }> = [
  { label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
  { label: 'One number', test: (value) => /[0-9]/.test(value) },
  { label: 'One special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export default function Profile() {
  const { user, logout } = useAuth();
  const me = useQuery<User>('/api/auth/me', { intervalMs: 60_000 });

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signOutIn, setSignOutIn] = useState(0);

  const checks = useMemo(
    () => RULES.map((rule) => ({ label: rule.label, ok: rule.test(next) })),
    [next]
  );
  const passwordOk = checks.every((check) => check.ok);

  // Counts down after a successful change, then signs the user back in again.
  useEffect(() => {
    if (signOutIn <= 0) return;
    if (signOutIn === 1) {
      const timer = window.setTimeout(() => void logout(), 900);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setSignOutIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [signOutIn, logout]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!passwordOk) {
      setError('New password does not meet all requirements.');
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (next === current) {
      setError('New password must be different from the current one.');
      return;
    }

    setBusy(true);
    try {
      await request('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      setNotice('Password saved. All existing sessions were signed out.');
      setSignOutIn(5);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Password change failed');
    } finally {
      setBusy(false);
    }
  };

  if (me.loading && !me.data) return <Spinner />;
  if (me.error && !me.data) {
    return <ErrorState message={me.error} onRetry={() => me.reload()} />;
  }

  const account = me.data ?? user;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Profile"
        description="Your account, role and password. Passwords are stored as bcrypt hashes and never in plain text."
      />

      <div className="grid-2">
        <Card title="Account" subtitle="Details from the API session">
          <dl className="kv-list" style={{ marginTop: 12 }}>
            <div className="kv">
              <dt>Name</dt>
              <dd>{account?.name ?? '—'}</dd>
            </div>
            <div className="kv">
              <dt>Email</dt>
              <dd>{account?.email ?? '—'}</dd>
            </div>
            <div className="kv">
              <dt>Role</dt>
              <dd>
                <Badge tone={account?.role === 'ADMIN' ? 'info' : 'neutral'}>
                  {account?.role ?? '—'}
                </Badge>
              </dd>
            </div>
            <div className="kv">
              <dt>Status</dt>
              <dd>
                <Badge tone={account?.isActive === false ? 'danger' : 'success'}>
                  {account?.isActive === false ? 'Inactive' : 'Active'}
                </Badge>
              </dd>
            </div>
            <div className="kv">
              <dt>Last sign-in</dt>
              <dd>{account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : '—'}</dd>
            </div>
            <div className="kv">
              <dt>Member since</dt>
              <dd>{account?.createdAt ? formatDateTime(account.createdAt) : '—'}</dd>
            </div>
          </dl>
          <p className="small faint" style={{ marginTop: 14, marginBottom: 0 }}>
            Roles are assigned by an administrator on the Users page. Ask an ADMIN if you need
            write access.
          </p>
        </Card>

        <Card title="Change password" subtitle="Requires your current password">
          <form className="stack" onSubmit={submit} style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                className="input"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-new-password">Confirm new password</label>
              <input
                id="confirm-new-password"
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </div>

            <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              {checks.map((check) => (
                <li
                  key={check.label}
                  className={check.ok ? '' : 'faint'}
                  style={check.ok ? { color: 'var(--success, #2e7d32)' } : undefined}
                >
                  {check.ok ? '✓ ' : '○ '}
                  {check.label}
                </li>
              ))}
            </ul>

            {error && <div className="alert-banner error">{error}</div>}
            {notice && (
              <div className="alert-banner success">
                {notice}
                {signOutIn > 0 && ` Signing you out in ${signOutIn}s…`}
              </div>
            )}

            <button className="btn primary" type="submit" disabled={busy || !current || !next}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
