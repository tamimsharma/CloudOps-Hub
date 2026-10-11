// Formatting helpers shared across the UI.

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatCurrency(value: number | null | undefined, currency = 'USD'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${Math.floor(seconds % 60)}s`;
}

export function timeAgo(input: string | number | Date | null | undefined): string {
  if (!input) return '—';
  const date = new Date(input);
  const diff = Date.now() - date.getTime();
  const seconds = Math.round(diff / 1000);
  if (Number.isNaN(seconds)) return '—';

  const abs = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return formatter.format(-seconds, 'second');
  if (abs < 3600) return formatter.format(-Math.round(seconds / 60), 'minute');
  if (abs < 86400) return formatter.format(-Math.round(seconds / 3600), 'hour');
  if (abs < 2592000) return formatter.format(-Math.round(seconds / 86400), 'day');
  return date.toLocaleDateString();
}

export function formatDateTime(input: string | number | Date | null | undefined): string {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function shortId(value: string | null | undefined, length = 8): string {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export function healthTone(status: string | null | undefined): string {
  switch (status) {
    case 'HEALTHY':
    case 'RUNNING':
    case 'SUCCESS':
    case 'RESOLVED':
    case 'CONNECTED':
      return 'success';
    case 'WARNING':
    case 'ACKNOWLEDGED':
    case 'DEGRADED':
    case 'PENDING':
    case 'BUILDING':
    case 'DEPLOYING':
      return 'warning';
    case 'CRITICAL':
    case 'ERROR':
    case 'FAILED':
    case 'FIRING':
    case 'SEV1':
      return 'danger';
    case 'STOPPED':
    case 'CLOSED':
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'info';
  }
}

export function severityTone(severity: string | null | undefined): string {
  switch (severity) {
    case 'CRITICAL':
    case 'FATAL':
    case 'SEV1':
      return 'danger';
    case 'WARNING':
    case 'ERROR':
    case 'SEV2':
      return 'warning';
    case 'INFO':
    case 'WARN':
    case 'SEV3':
      return 'info';
    default:
      return 'neutral';
  }
}
