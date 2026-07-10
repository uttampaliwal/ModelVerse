import { api } from './api.js';
import { el, $ } from './utils.js';
import { showToast } from './toast.js';
import type { ModelInfo } from './types.js';
import { AppState } from './state.js';
import { logError } from './logger.js';

function capClass(cap: string): string {
  const lower = cap.toLowerCase();
  if (lower === 'vision') return 'cap-vision';
  if (lower === 'tools') return 'cap-tools';
  if (lower === 'embedding') return 'cap-embed';
  return 'cap-text';
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export async function loadModels(): Promise<void> {
  const list = $('modelList') as HTMLElement;
  if (!list) return;
  list.innerHTML = '<div class="model-loading"><span class="loading-dots"><span></span><span></span><span></span></span></div>';

  try {
    const data = await api<{ models: ModelInfo[] }>('/api/models');
    const models = data.models || [];
    AppState.models = {};
    el.modelSelect.innerHTML = '';

    const groups = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const folder = m.folder || m.provider || 'Available Models';
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder)!.push(m);
      AppState.models[m.id || m.path || m.name] = m;

      const opt = document.createElement('option');
      opt.value = m.id || m.path || m.name;
      opt.textContent = m.name;
      el.modelSelect.appendChild(opt);
    }

    list.innerHTML = '';
    for (const [folder, items] of groups) {
      const groupEl = document.createElement('div');
      groupEl.className = 'model-group';
      groupEl.innerHTML = `<div class="model-group-title">${esc(folder)}</div>`;

      for (const m of items) {
        const caps = m.capabilities && m.capabilities.length
          ? m.capabilities.map((c) => `<span class="model-cap-badge ${capClass(c)}">${esc(c)}</span>`).join('') : '';

        const card = document.createElement('div');
        card.className = 'model-card';
        card.dataset.path = m.id || m.path || m.name;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Load ${m.name}`);
        card.innerHTML = `
          <div class="model-card-header">
            <span class="model-card-name">${esc(m.name)}</span>
          </div>
          <div class="model-card-meta">
            <span class="model-card-size">${esc(m.sizeFormatted)}</span>
            ${caps ? `<span class="model-card-caps">${caps}</span>` : ''}
          </div>`;

        card.addEventListener('click', () => selectModel(m.id || m.path || m.name));
        card.addEventListener('keydown', (e: Event) => {
          if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
            e.preventDefault();
            selectModel(m.id || m.path || m.name);
          }
        });

        groupEl.appendChild(card);
      }
      list.appendChild(groupEl);
    }

    if (models.length === 0) {
      list.innerHTML = '<div class="model-empty">No models found. Check your engine settings.</div>';
    }
  } catch (e) {
    logError('loadModels', e);
    list.innerHTML = '<div class="model-empty">Failed to load models</div>';
  }
}

async function selectModel(modelId: string): Promise<void> {
  el.modelSelect.value = modelId;

  const list = $('modelList') as HTMLElement;
  if (list) {
    list.querySelectorAll('.model-card').forEach((card) => {
      const c = card as HTMLElement;
      c.classList.toggle('selected', c.dataset.path === modelId);
    });
  }

  updateModelInfo();

  try {
    const { ensureServerRunning } = await import('./server.js');
    await ensureServerRunning(modelId);
  } catch (e) {
    showToast('Failed to load model: ' + (e as Error).message, 'error');
  }
}

export function updateModelInfo(): void {
  const modelId = el.modelSelect.value;
  const m = AppState.models[modelId];
  if (!m) {
    el.modelInfo.textContent = '';
    el.modelBadge.textContent = '';
    return;
  }
  const caps = m.capabilities && m.capabilities.length ? m.capabilities.join(', ') : 'text';
  el.modelInfo.textContent = `${m.name} · ${m.sizeFormatted} · ${m.provider || 'local'}`;
  el.modelBadge.textContent = `${m.name} · ${caps}`;

  import('./status.js').then(mod => mod.setModelInfo(m.name, 0));
}
