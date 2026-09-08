/**
 * Operational metrics: in-memory ring buffer of request outcomes.
 *
 * This is observability, not analytics: counts, success rates, and latencies
 * per operation kind so operators can see what a local server actually does.
 * The buffer is bounded and resets on restart (documented, not persisted).
 */

export type MetricKind = 'chat' | 'agent' | 'rag-chat' | 'tool' | 'download' | 'login' | 'eval-ab';

export interface MetricEvent {
  ts: number;
  kind: MetricKind;
  engine?: string;
  durationMs: number;
  success: boolean;
  detail?: string;
}

export interface KindSummary {
  count: number;
  success: number;
  failures: number;
  avgMs: number;
}

export interface MetricsSummary {
  startedAt: string;
  uptimeMs: number;
  total: number;
  kinds: Record<string, KindSummary>;
  engines: Record<string, number>;
  recentErrors: Array<{ ts: string; kind: MetricKind; detail: string }>;
}

const MAX_EVENTS = 2000;
const MAX_ERRORS = 20;

const startedAt = Date.now();
let events: MetricEvent[] = [];

export function recordMetric(
  kind: MetricKind,
  durationMs: number,
  opts: { engine?: string; success?: boolean; detail?: string } = {},
): void {
  events.push({
    ts: Date.now(),
    kind,
    engine: opts.engine,
    durationMs: Math.max(0, Math.round(durationMs)),
    success: opts.success ?? true,
    detail: opts.detail,
  });
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }
}

export function summarizeMetrics(): MetricsSummary {
  const kinds: Record<string, KindSummary> = {};
  const engines: Record<string, number> = {};
  const recentErrors: MetricsSummary['recentErrors'] = [];

  for (const e of events) {
    const summary = kinds[e.kind] ?? { count: 0, success: 0, failures: 0, avgMs: 0 };
    summary.count++;
    if (e.success) summary.success++;
    else summary.failures++;
    summary.avgMs += e.durationMs;
    kinds[e.kind] = summary;
    if (e.engine) engines[e.engine] = (engines[e.engine] ?? 0) + 1;
  }
  for (const summary of Object.values(kinds)) {
    summary.avgMs = summary.count > 0 ? Math.round(summary.avgMs / summary.count) : 0;
  }
  for (let i = events.length - 1; i >= 0 && recentErrors.length < MAX_ERRORS; i--) {
    const e = events[i];
    if (!e.success) {
      recentErrors.push({
        ts: new Date(e.ts).toISOString(),
        kind: e.kind,
        detail: (e.detail ?? 'failed').slice(0, 200),
      });
    }
  }

  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeMs: Date.now() - startedAt,
    total: events.length,
    kinds,
    engines,
    recentErrors,
  };
}

/** Test hook: clear all recorded events. */
export function resetMetrics(): void {
  events = [];
}
