import { api } from './api.js';
import { showToast } from './toast.js';
import { el, $ } from './utils.js';

export let modelMap = {};

export async function loadModels() {
  try {
    const { models } = await api('/api/models');
    modelMap = {};
    el.modelSelect.innerHTML = '<option value="">Select a model...</option>';
    models.forEach(m => {
      modelMap[m.path] = m;
      const o = document.createElement('option');
      o.value = m.path;
      const caps = m.capabilities && m.capabilities.length ? ` [${m.capabilities.join(', ')}]` : '';
      o.textContent = `${m.name} (${m.sizeFormatted})${caps}`;
      el.modelSelect.appendChild(o);
    });
  } catch (e) { showToast('Failed to load models', 'error'); }
}

export function updateModelInfo() {
  const path = el.modelSelect.value;
  const m = modelMap[path];
  if (!m) { el.modelInfo.textContent = ''; el.modelBadge.textContent = ''; return; }
  const ctx = parseInt($('contextSize').value) || '-';
  const gpu = parseInt($('gpuLayers').value) || '-';
  const thr = parseInt($('threads').value) || '-';
  const caps = m.capabilities && m.capabilities.length ? m.capabilities.join(', ') : 'text';
  el.modelInfo.textContent = `${m.name} · ${m.sizeFormatted} · ctx ${ctx} · GPU ${gpu} · ${thr}T`;
  el.modelBadge.textContent = `${m.name} · ${caps}`;
}
