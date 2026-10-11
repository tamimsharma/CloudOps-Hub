// Deterministic metric simulation.
// Used as a fallback whenever Prometheus is not configured or unreachable, so the
// platform still shows realistic, stable time series in demo environments.

export interface MetricPoint {
  timestamp: number;
  value: number;
}

export type MetricKey =
  | 'cpu'
  | 'memory'
  | 'disk'
  | 'network_in'
  | 'network_out'
  | 'requests'
  | 'errors'
  | 'latency';

export interface MetricProfile {
  base: number;
  variance: number;
  unit: string;
  min: number;
  max: number;
  integer?: boolean;
}

export const METRIC_PROFILES: Record<MetricKey, MetricProfile> = {
  cpu: { base: 42, variance: 28, unit: 'percent', min: 2, max: 99 },
  memory: { base: 58, variance: 20, unit: 'percent', min: 10, max: 97 },
  disk: { base: 61, variance: 6, unit: 'percent', min: 5, max: 98 },
  network_in: { base: 4.2, variance: 3.5, unit: 'MB/s', min: 0.05, max: 100 },
  network_out: { base: 2.8, variance: 2.4, unit: 'MB/s', min: 0.02, max: 100 },
  requests: { base: 420, variance: 320, unit: 'req/s', min: 5, max: 5000, integer: true },
  errors: { base: 6, variance: 10, unit: 'err/min', min: 0, max: 400, integer: true },
  latency: { base: 145, variance: 110, unit: 'ms', min: 8, max: 3000 },
};

/** Range presets accepted by the metrics API. */
export const RANGE_MS: Record<string, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export const RANGE_POINTS: Record<string, number> = {
  '15m': 45,
  '1h': 60,
  '6h': 72,
  '24h': 96,
  '7d': 84,
  '30d': 90,
};

/** FNV-1a string hash -> unsigned 32 bit integer. */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic pseudo random value in [0, 1) for a seed/bucket pair. */
function noise(seed: number, bucket: number): number {
  let h = (seed ^ Math.imul(bucket, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, integer?: boolean): number {
  if (integer) return Math.round(value);
  return Math.round(value * 100) / 100;
}

/**
 * Generates a deterministic time series. The same inputs always produce the same
 * output, which keeps dashboards stable between page refreshes.
 */
export function generateSeries(options: {
  metric: MetricKey;
  resourceId?: string;
  from?: number;
  to?: number;
  points?: number;
}): MetricPoint[] {
  const profile = METRIC_PROFILES[options.metric];
  const to = options.to ?? Date.now();
  const from = options.from ?? to - RANGE_MS['1h'];
  const count = options.points ?? RANGE_POINTS['1h'];
  const step = Math.max(1000, Math.floor((to - from) / Math.max(1, count - 1)));
  const seed = hashString(`${options.metric}:${options.resourceId ?? 'global'}`);
  const phase = (seed % 360) * (Math.PI / 180);

  const points: MetricPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const timestamp = from + i * step;

    // Daily business-hours pattern.
    const day = new Date(timestamp);
    const hour = day.getUTCHours() + day.getUTCMinutes() / 60;
    const daily = Math.sin(((hour - 8) / 24) * Math.PI * 2) * 0.5 + 0.5;

    // Medium cadence oscillation.
    const wave = Math.sin(timestamp / 420000 + phase) * 0.5 + 0.5;
    const fast = Math.sin(timestamp / 61000 + phase * 2) * 0.5 + 0.5;

    // Bucketed noise (one value per minute) for texture.
    const bucket = Math.floor(timestamp / 60000);
    const jitter = noise(seed, bucket);

    const blend = 0.45 * daily + 0.25 * wave + 0.15 * fast + 0.15 * jitter;
    const raw = profile.base + profile.variance * (blend - 0.5) * 2;
    const value = clamp(raw, profile.min, profile.max);

    points.push({ timestamp, value: round(value, profile.integer) });
  }

  return points;
}

/** Latest simulated value for a metric. */
export function currentMetric(metric: MetricKey, resourceId?: string): number {
  const series = generateSeries({ metric, resourceId, points: 2 });
  return series[series.length - 1].value;
}

export function metricUnit(metric: MetricKey): string {
  return METRIC_PROFILES[metric].unit;
}
