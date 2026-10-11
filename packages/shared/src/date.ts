// Date utilities
export function toISOString(date: Date | string | number): string {
  return new Date(date).toISOString();
}

export function fromISOString(isoString: string): Date {
  return new Date(isoString);
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

export function formatDateTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options,
  });
}

export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

export function parseTimeRange(range: string): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;

  switch (range) {
    case '15m':
      start = new Date(now.getTime() - 15 * 60 * 1000);
      break;
    case '1h':
      start = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '6h':
      start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      break;
    case '24h':
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(now.getTime() - 60 * 60 * 1000); // default 1h
  }

  return { start, end: now };
}

export function getTimeRangeLabels(range: string): string {
  switch (range) {
    case '15m': return 'Last 15 minutes';
    case '1h': return 'Last hour';
    case '6h': return 'Last 6 hours';
    case '24h': return 'Last 24 hours';
    case '7d': return 'Last 7 days';
    case '30d': return 'Last 30 days';
    default: return 'Custom range';
  }
}

export function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && dateString === date.toISOString();
}