import { describe, it, expect, beforeEach } from 'vitest';
import { recordMetric, resetMetrics, summarizeMetrics } from '../src/metrics';

beforeEach(() => {
  resetMetrics();
});

describe('summarizeMetrics', () => {
  it('starts empty', () => {
    const summary = summarizeMetrics();
    expect(summary.total).toBe(0);
    expect(summary.kinds).toEqual({});
    expect(summary.recentErrors).toEqual([]);
    expect(typeof summary.startedAt).toBe('string');
  });

  it('aggregates counts, success, and average latency per kind', () => {
    recordMetric('chat', 100, { engine: 'ollama', success: true });
    recordMetric('chat', 300, { engine: 'ollama', success: false, detail: 'boom' });
    recordMetric('tool', 50, { success: true });
    const summary = summarizeMetrics();
    expect(summary.total).toBe(3);
    expect(summary.kinds.chat).toMatchObject({ count: 2, success: 1, failures: 1, avgMs: 200 });
    expect(summary.kinds.tool).toMatchObject({ count: 1, success: 1, failures: 0, avgMs: 50 });
    expect(summary.engines).toEqual({ ollama: 2 });
    expect(summary.recentErrors).toHaveLength(1);
    expect(summary.recentErrors[0]).toMatchObject({ kind: 'chat', detail: 'boom' });
  });

  it('bounds the buffer at 2000 events', () => {
    for (let i = 0; i < 2100; i++) recordMetric('tool', 1);
    expect(summarizeMetrics().total).toBe(2000);
  });
});
