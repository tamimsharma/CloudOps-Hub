// Unit tests for the deterministic metrics simulator.
import { describe, expect, it } from 'vitest';
import {
  METRIC_PROFILES,
  RANGE_MS,
  RANGE_POINTS,
  currentMetric,
  generateSeries,
  metricUnit,
} from '../metricsSimulator';

const FROM = Date.UTC(2026, 0, 1, 0, 0, 0);
const TO = FROM + RANGE_MS['1h'];

describe('generateSeries', () => {
  it('returns the requested number of points', () => {
    for (const metric of Object.keys(METRIC_PROFILES) as Array<keyof typeof METRIC_PROFILES>) {
      const points = generateSeries({ metric, from: FROM, to: TO, points: 24 });
      expect(points, metric).toHaveLength(24);
    }
  });

  it('is deterministic for identical inputs', () => {
    const a = generateSeries({ metric: 'cpu', from: FROM, to: TO, points: 40 });
    const b = generateSeries({ metric: 'cpu', from: FROM, to: TO, points: 40 });
    expect(a).toEqual(b);
  });

  it('varies by resource so series do not overlap', () => {
    const a = generateSeries({ metric: 'cpu', resourceId: 'res-1', from: FROM, to: TO, points: 40 });
    const b = generateSeries({ metric: 'cpu', resourceId: 'res-2', from: FROM, to: TO, points: 40 });
    expect(a).not.toEqual(b);
  });

  it('keeps values inside the profile bounds', () => {
    (Object.keys(METRIC_PROFILES) as Array<keyof typeof METRIC_PROFILES>).forEach((metric) => {
      const profile = METRIC_PROFILES[metric];
      const points = generateSeries({ metric, from: FROM, to: TO, points: 200 });
      for (const point of points) {
        expect(point.value, metric).toBeGreaterThanOrEqual(profile.min);
        expect(point.value, metric).toBeLessThanOrEqual(profile.max);
      }
    });
  });

  it('emits monotonic timestamps on a fixed step', () => {
    const points = generateSeries({ metric: 'memory', from: FROM, to: TO, points: 10 });
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].timestamp).toBeGreaterThan(points[i - 1].timestamp);
    }
    expect(points[0].timestamp).toBe(FROM);
  });

  it('rounds integer metrics to whole numbers', () => {
    const points = generateSeries({ metric: 'requests', from: FROM, to: TO, points: 50 });
    for (const point of points) {
      expect(Number.isInteger(point.value)).toBe(true);
    }
  });

  it('clamps to at least the minimum when asked for one point', () => {
    const points = generateSeries({ metric: 'errors', from: FROM, to: TO, points: 1 });
    expect(points).toHaveLength(1);
    expect(points[0].value).toBeGreaterThanOrEqual(METRIC_PROFILES.errors.min);
  });
});

describe('currentMetric', () => {
  it('is stable for the same inputs', () => {
    expect(currentMetric('disk', 'res-1')).toBe(currentMetric('disk', 'res-1'));
  });

  it('stays within the profile bounds', () => {
    const value = currentMetric('latency');
    expect(value).toBeGreaterThanOrEqual(METRIC_PROFILES.latency.min);
    expect(value).toBeLessThanOrEqual(METRIC_PROFILES.latency.max);
  });
});

describe('range presets', () => {
  it('exposes the ranges accepted by the API', () => {
    expect(Object.keys(RANGE_MS)).toEqual(['15m', '1h', '6h', '24h', '7d', '30d']);
    expect(RANGE_MS['1h']).toBe(3_600_000);
    expect(RANGE_MS['7d']).toBe(RANGE_MS['24h'] * 7);
  });

  it('has a matching point budget for every range', () => {
    for (const key of Object.keys(RANGE_MS)) {
      expect(RANGE_POINTS[key], key).toBeGreaterThan(1);
    }
  });
});

describe('metricUnit', () => {
  it('returns the declared unit', () => {
    expect(metricUnit('cpu')).toBe('percent');
    expect(metricUnit('requests')).toBe('req/s');
    expect(metricUnit('latency')).toBe('ms');
  });
});
