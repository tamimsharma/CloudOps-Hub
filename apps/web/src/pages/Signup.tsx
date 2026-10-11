// Registration screen: creates a real account (email + password, bcrypt-hashed by the API).
import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const RULES: Array<{ label: string; test: (value: string) => boolean }> = [
  { label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
  { label: 'One number', test: (value) => /[0-9]/.test(value) },
  { label: 'One special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checks = useMemo(
    () => RULES.map((rule) => ({ label: rule.label, ok: rule.test(password) })),
    [password]
  );
  const passwordOk = checks.every((check) => check.ok);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (!passwordOk) {
      setError('Password does not meet all requirements.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: '0 0 18px' }}>
          <div className="brand-mark">CH</div>
          <div>
            <div className="brand-title">Create your account</div>
            <div className="brand-subtitle">Real credentials, stored as a bcrypt hash</div>
          </div>
        </div>

        <div className="stack">
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              className="input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
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
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
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
                style={{ color: check.ok ? 'var(--success, #2e7d32)' : undefined }}
                className={check.ok ? '' : 'faint'}
              >
                {check.ok ? '✓ ' : '○ '}
                {check.label}
              </li>
            ))}
            {confirm.length > 0 && confirm !== password && (
              <li className="faint">○ Passwords match</li>
            )}
            {confirm.length > 0 && confirm === password && (
              <li style={{ color: 'var(--success, #2e7d32)' }}>✓ Passwords match</li>
            )}
          </ul>

          <div className="small faint">
            The first account registered becomes <strong>ADMIN</strong>; every account after that
            starts as <strong>VIEWER</strong> until an administrator promotes it.
          </div>

          {error && <div className="alert-banner error">{error}</div>}

          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>

          <div className="small faint" style={{ textAlign: 'center' }}>
            Already registered? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
