// Unit tests for the pure cost engine (price book + line calculation).
import { describe, expect, it } from 'vitest';
import {
  COST_ASSUMPTIONS,
  PRICE_BOOK,
  buildCostLines,
  roundCost,
  summarizeLines,
} from '../costEngine';

describe('roundCost', () => {
  it('rounds to two decimal places', () => {
    expect(roundCost(1.234)).toBe(1.23);
    expect(roundCost(1.235)).toBe(1.24);
    expect(roundCost(10)).toBe(10);
    expect(roundCost(0)).toBe(0);
  });
});

describe('buildCostLines', () => {
  it('prices an EC2 instance from the price book', () => {
    const lines = buildCostLines({
      type: 'EC2_INSTANCE',
      name: 'prod-worker-01',
      metadata: { instanceType: 't3.medium', diskGb: 30 },
    });

    const compute = lines.find((line) => line.category.startsWith('Compute'));
    expect(compute).toBeDefined();
    expect(compute!.unitPrice).toBe(PRICE_BOOK.instanceHourly['t3.medium']);
    expect(compute!.dailyCost).toBe(roundCost(PRICE_BOOK.instanceHourly['t3.medium'] * 24));
    expect(lines.some((line) => line.category.includes('EBS'))).toBe(true);
  });

  it('falls back to the default instance price for unknown types', () => {
    const lines = buildCostLines({
      type: 'EC2_INSTANCE',
      name: 'mystery',
      metadata: { instanceType: 'n3.nonexistent' },
    });
    const compute = lines.find((line) => line.category.startsWith('Compute'));
    expect(compute!.unitPrice).toBe(PRICE_BOOK.defaultInstanceHourly);
  });

  it('produces at least one line for every supported resource type', () => {
    const types = [
      'EC2_INSTANCE',
      'DATABASE',
      'S3_BUCKET',
      'LOAD_BALANCER',
      'KUBERNETES_CLUSTER',
      'DOCKER_CONTAINER',
      'KUBERNETES_POD',
      'APPLICATION',
      'SOMETHING_ELSE',
    ];
    for (const type of types) {
      const lines = buildCostLines({ type, name: 'x' });
      expect(lines.length, type).toBeGreaterThan(0);
    }
  });

  it('treats missing metadata as an empty object', () => {
    expect(() => buildCostLines({ type: 'DATABASE', name: 'db', metadata: undefined })).not.toThrow();
    expect(() => buildCostLines({ type: 'DATABASE', name: 'db', metadata: 'not-an-object' })).not.toThrow();
  });

  it('keeps monthly cost at ~30.4x the daily cost', () => {
    const lines = buildCostLines({ type: 'LOAD_BALANCER', name: 'alb' });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      // `dailyCost` is rounded to a cent before being multiplied by 30.4, and the
      // product is rounded again, so the drift is bounded by both roundings:
      // 0.005 * 30.4 + 0.005 = 0.157.
      expect(Math.abs(line.monthlyCost - line.dailyCost * 30.4)).toBeLessThanOrEqual(0.16);
      expect(line.monthlyCost).toBe(roundCost(line.monthlyCost));
    }
  });
});

describe('summarizeLines', () => {
  it('sums and rounds daily/monthly totals', () => {
    const lines = buildCostLines({ type: 'EC2_INSTANCE', name: 'a', metadata: { instanceType: 't3.micro' } });
    const summary = summarizeLines(lines);

    expect(summary.dailyCost).toBe(roundCost(lines.reduce((sum, line) => sum + line.dailyCost, 0)));
    expect(summary.monthlyCost).toBe(roundCost(lines.reduce((sum, line) => sum + line.monthlyCost, 0)));
    expect(Math.abs(summary.monthlyCost - summary.dailyCost * 30.4)).toBeLessThanOrEqual(0.1);
  });

  it('returns zero for no lines', () => {
    expect(summarizeLines([])).toEqual({ dailyCost: 0, monthlyCost: 0 });
  });
});

describe('COST_ASSUMPTIONS', () => {
  it('documents the pricing basis', () => {
    expect(COST_ASSUMPTIONS.length).toBeGreaterThan(0);
    expect(COST_ASSUMPTIONS.join(' ')).toMatch(/us-east-1/);
  });
});
