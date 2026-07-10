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
  if (lower === 'reasoning') return 'cap-reasoning';
  if (lower === 'code') return 'cap-code';
  if (lower === 'functioncalling') return 'cap-fncall';
  return 'cap-text';
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function providerLabel(provider?: string): string {
  switch (provider) {
    case 'llamacpp':
      return 'llama.cpp';
    case 'ollama':
      return 'Ollama';
    case 'vllm':
      return 'vLLM';
    case 'lmstudio':
      return 'LM Studio';
    case 'koboldcpp':
      return 'KoboldCpp';
    case 'openai':
      return 'OpenAI';
    case 'transformers':
      return 'Transformers';
    default:
      return provider || 'Local';
  }
}

export async function loadModels(): Promise<void> {
  const list = $('modelList');
  if (!list) return;
  list.innerHTML =
    '<div class="model-loading"><span class="loading-dots"><span></span><span></span><span></span></span></div>';

  try {
    const data = await api<{ models: ModelInfo[] }>('/api/models');
    const models = data.models || [];
    AppState.models = {};
    el.modelSelect.innerHTML = '';

    const groups = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const folder = providerLabel(m.provider) || m.folder || 'Available Models';
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
        const caps =
          m.capabilities && m.capabilities.length
            ? m.capabilities
                .map((c) => `<span class="model-cap-badge ${capClass(c)}">${esc(c)}</span>`)
                .join('')
            : '';

        const providerBadge = m.provider
          ? `<span class="model-card-provider">${esc(providerLabel(m.provider))}</span>`
          : '';

        const ctxLen = m.contextLength ? esc(String(m.contextLength)) : '';
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
            ${providerBadge}
            <span class="model-card-size">${esc(m.sizeFormatted)}</span>
            ${ctxLen ? `<span class="model-card-ctx">${ctxLen} ctx</span>` : ''}
            ${caps ? `<span class="model-card-caps">${caps}</span>` : ''}
          </div>`;

        card.addEventListener('click', () => void selectModel(m.id || m.path || m.name));
        card.addEventListener('keydown', (e: Event) => {
          if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
            e.preventDefault();
            void selectModel(m.id || m.path || m.name);
          }
        });

        groupEl.appendChild(card);
      }
      list.appendChild(groupEl);
    }

    if (models.length === 0) {
      list.innerHTML =
        '<div class="model-empty">No models found. Check your engine settings.</div>';
    }
  } catch (e) {
    logError('loadModels', e);
    list.innerHTML = '<div class="model-empty">Failed to load models</div>';
  }
}

export async function selectModel(modelId: string): Promise<void> {
  el.modelSelect.value = modelId;

  const list = $('modelList');
  if (list) {
    list.querySelectorAll('.model-card').forEach((card) => {
      const c = card as HTMLElement;
      c.classList.toggle('selected', c.dataset.path === modelId);
    });
  }

  updateModelInfo();

  const m = AppState.models[modelId];
  const provider = m?.provider;

  try {
    const { ensureServerRunning } = await import('./connection.js');
    await ensureServerRunning(modelId, provider);
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
  el.modelInfo.textContent = `${m.name} · ${m.sizeFormatted} · ${providerLabel(m.provider)}`;
  el.modelBadge.textContent = `${m.name} · ${caps}`;

  void import('./status.js').then((mod) => mod.setModelInfo(m.name, 0));
}
