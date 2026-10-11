// Shared UI primitives used across every page.
import { ReactNode } from 'react';
import { Pagination as PaginationType } from '../api/client';

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-header">
          <div>
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  meta,
  tone,
  foot,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  tone?: 'success' | 'warning' | 'danger' | 'info';
  foot?: ReactNode;
}) {
  return (
    <div className={`stat-card ${tone ? `tone-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span
        className="stat-value"
        style={{
          color:
            tone === 'success'
              ? 'var(--success)'
              : tone === 'warning'
                ? 'var(--warning)'
                : tone === 'danger'
                  ? 'var(--danger)'
                  : tone === 'info'
                    ? 'var(--info)'
                    : undefined,
        }}
      >
        {value}
      </span>
      {(meta || foot) && <span className="stat-meta">{meta ?? foot}</span>}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
  plain = false,
}: {
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  children: ReactNode;
  plain?: boolean;
}) {
  return <span className={`badge ${tone} ${plain ? 'plain' : ''}`}>{children}</span>;
}

export function Spinner() {
  return (
    <div className="loading-block">
      <div className="spinner" />
      <span className="small muted">Loading…</span>
    </div>
  );
}

export function EmptyState({
  icon = '📭',
  title,
  message,
  action,
}: {
  icon?: string;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="icon">{icon}</div>
      <strong>{title}</strong>
      {message && <span className="small">{message}</span>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state">
      <div className="icon">⚠️</div>
      <strong>Something went wrong</strong>
      <span className="small">{message}</span>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="faint"> ({tab.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Pagination({
  pagination,
  onPage,
  label = 'results',
}: {
  pagination?: PaginationType;
  onPage: (page: number) => void;
  label?: string;
}) {
  if (!pagination) return null;
  const { page, totalPages, total, hasNext, hasPrev } = pagination;

  return (
    <div className="pagination">
      <span>
        {total.toLocaleString()} {label} · page {page} of {Math.max(1, totalPages)}
      </span>
      <div className="row">
        <button className="btn sm" disabled={!hasPrev} onClick={() => onPage(page - 1)}>
          ← Prev
        </button>
        <button className="btn sm" disabled={!hasNext} onClick={() => onPage(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  const tone = percent >= 85 ? 'danger' : percent >= 70 ? 'warning' : 'success';
  return (
    <div className={`progress ${tone}`}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="faint small">{hint}</span>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
