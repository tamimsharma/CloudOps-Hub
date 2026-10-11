// Sign-in screen: one-click role cards for the demo accounts, plus a normal
// email + password form for any account registered through the app.
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface RoleAccount {
  role: 'ADMIN' | 'ENGINEER' | 'VIEWER';
  email: string;
  password: string;
  title: string;
  blurb: string;
}

// Demo accounts restored by `npm run db:seed` (see prisma/seed.ts).
const ROLE_ACCOUNTS: RoleAccount[] = [
  {
    role: 'ADMIN',
    email: 'admin@cloudops.local',
    password: 'Admin!2345',
    title: 'Administrator',
    blurb: 'Full control: users, settings, destructive actions',
  },
  {
    role: 'ENGINEER',
    email: 'engineer@cloudops.local',
    password: 'Engineer!2345',
    title: 'Engineer',
    blurb: 'Operate: deployments, incidents, alerts, syncs',
  },
  {
    role: 'VIEWER',
    email: 'viewer@cloudops.local',
    password: 'Viewer!2345',
    title: 'Viewer',
    blurb: 'Read-only: dashboards, inventory, reports',
  },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeRole, setActiveRole] = useState<string | null>(null);

  const signIn = async (credentials: { email: string; password: string }, roleTitle?: string) => {
    setBusy(true);
    setError(null);
    setActiveRole(roleTitle ?? null);
    try {
      await login(credentials.email, credentials.password, rememberMe);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Sign in failed';
      setError(roleTitle ? `Could not sign in as ${roleTitle} — ${message}` : message);
    } finally {
      setBusy(false);
      setActiveRole(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await signIn({ email: email.trim(), password });
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: '0 0 18px' }}>
          <div className="brand-mark">CH</div>
          <div>
            <div className="brand-title">CloudOps Hub</div>
            <div className="brand-subtitle">Intelligent cloud operations</div>
          </div>
        </div>

        <div className="stack">
          <div>
            <span className="login-section-label">Sign in as</span>
            <div className="role-grid">
              {ROLE_ACCOUNTS.map((account) => {
                const active = activeRole === account.title;
                return (
                  <button
                    key={account.role}
                    type="button"
                    className="role-card"
                    disabled={busy}
                    onClick={() => signIn(account, account.title)}
                  >
                    <span className="role-tag">{account.role}</span>
                    <span className="role-name">{account.title}</span>
                    <span className="role-blurb">{account.blurb}</span>
                    <span className="role-status">
                      {active ? 'Signing in…' : `Demo account · ${account.email.split('@')[0]}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="login-divider">or use your own account</div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span className="small muted">Keep me signed in</span>
          </label>

          {error && <div className="alert-banner error">{error}</div>}

          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="small faint" style={{ textAlign: 'center' }}>
            No account yet? <Link to="/signup">Create one</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
