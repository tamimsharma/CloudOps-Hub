// Background job scheduler (metrics collection, live log tail, alert rules).
import { collectMetricSnapshots } from './metricsCollector';
import { emitLogBatch } from './logStream';
import { evaluateAlerts } from './alertEngine';

const METRICS_INTERVAL_MS = 60_000;
const LOG_INTERVAL_MS = 15_000;
const ALERT_INTERVAL_MS = 90_000;

let started = false;
const timers: NodeJS.Timeout[] = [];

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function schedule(name: string, job: () => Promise<unknown>, intervalMs: number) {
  const run = async () => {
    try {
      await job();
    } catch (error) {
      console.error(`[scheduler] ${name} failed:`, error instanceof Error ? error.message : error);
    }
  };

  const timer = setInterval(run, intervalMs);
  timer.unref();
  timers.push(timer);
}

export function startBackgroundJobs(): void {
  if (started) return;
  if (!envFlag('ENABLE_BACKGROUND_JOBS', true)) {
    console.log('⏸  Background jobs disabled (ENABLE_BACKGROUND_JOBS=false)');
    return;
  }
  started = true;

  schedule('metrics-collector', collectMetricSnapshots, METRICS_INTERVAL_MS);
  schedule('log-stream', () => emitLogBatch(1 + Math.floor(Math.random() * 3)), LOG_INTERVAL_MS);
  schedule('alert-engine', evaluateAlerts, ALERT_INTERVAL_MS);

  console.log('⚙️   Background jobs started (metrics, logs, alert rules)');
}

export function stopBackgroundJobs(): void {
  timers.forEach((timer) => clearInterval(timer));
  timers.length = 0;
  started = false;
}
