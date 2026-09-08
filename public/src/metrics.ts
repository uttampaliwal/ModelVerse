import { api } from './api.js';
import { escapeHtml } from './markdown.js';
import { logError } from './logger.js';

interface KindSummary {
  count: number;
  success: number;
  failures: number;
  avgMs: number;
}

interface MetricsSummary {
  startedAt: string;
  uptimeMs: number;
  total: number;
  kinds: Record<string, KindSummary>;
  engines: Record<string, number>;
  recentErrors: Array<{ ts: string; kind: string; detail: string }>;
}

function uptimeText(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

export async function openMetrics(): Promise<void> {
  const modal = document.getElementById('metricsModal');
  const body = document.getElementById('metricsBody');
  if (!modal || !body) return;
  modal.classList.add('active');
  body.innerHTML = '<div class="welcome-empty-text">Loading…</div>';
  try {
    const summary = await api<MetricsSummary>('/api/metrics');
    const kindRows = Object.entries(summary.kinds)
      .sort((a, b) => b[1].count - a[1].count)
      .map(
        ([kind, k]) =>
          `<tr><td>${escapeHtml(kind)}</td><td>${k.count}</td><td>${k.success}</td><td>${k.failures}</td><td>${k.avgMs}ms</td></tr>`,
      )
      .join('');
    const engineRows = Object.entries(summary.engines)
      .sort((a, b) => b[1] - a[1])
      .map(([engine, count]) => `<tr><td>${escapeHtml(engine)}</td><td>${count}</td></tr>`)
      .join('');
    const errorRows =
      summary.recentErrors.length > 0
        ? summary.recentErrors
            .map(
              (e) =>
                `<tr><td>${escapeHtml(e.ts.slice(11, 19))}</td><td>${escapeHtml(e.kind)}</td><td>${escapeHtml(e.detail)}</td></tr>`,
            )
            .join('')
        : '<tr><td colspan="3">No failures recorded</td></tr>';
    body.innerHTML = `
      <div class="settings-about">
        <div class="settings-about-item"><span class="settings-about-label">Uptime</span><span class="settings-about-value">${escapeHtml(uptimeText(summary.uptimeMs))}</span></div>
        <div class="settings-about-item"><span class="settings-about-label">Events</span><span class="settings-about-value">${summary.total}</span></div>
      </div>
      <h4 class="settings-category-title">By operation</h4>
      <table class="metrics-table"><thead><tr><th>Kind</th><th>Count</th><th>OK</th><th>Fail</th><th>Avg</th></tr></thead><tbody>${kindRows || '<tr><td colspan="5">No activity yet</td></tr>'}</tbody></table>
      <h4 class="settings-category-title">By engine</h4>
      <table class="metrics-table"><thead><tr><th>Engine</th><th>Requests</th></tr></thead><tbody>${engineRows || '<tr><td colspan="2">No activity yet</td></tr>'}</tbody></table>
      <h4 class="settings-category-title">Recent failures</h4>
      <table class="metrics-table"><thead><tr><th>Time</th><th>Kind</th><th>Detail</th></tr></thead><tbody>${errorRows}</tbody></table>`;
  } catch (e) {
    logError('openMetrics', e);
    body.innerHTML = '<div class="welcome-empty-text">Could not load metrics.</div>';
  }
}
