import { api } from './api.js';
import { showToast } from './toast.js';
import { el, $ } from './utils.js';
import { updateModelInfo } from './models.js';

export async function loadSettings() {
  try {
    const s = await api('/api/settings');
    $('temperature').value = s.temperature;
    $('temperatureVal').textContent = s.temperature;
    $('topP').value = s.topP;
    $('topPVal').textContent = s.topP;
    $('topK').value = s.topK;
    $('topKVal').textContent = s.topK;
    $('maxTokens').value = s.maxTokens;
    $('contextSize').value = s.contextSize;
    $('gpuLayers').value = s.gpuLayers;
    $('threads').value = s.threads;
    $('repeatPenalty').value = s.repeatPenalty;
    $('repeatPenaltyVal').textContent = s.repeatPenalty;
    el.systemPrompt.value = s.systemPrompt;
    updateModelInfo();
  } catch (e) {}
}

export function collectSettings() {
  const s = {
    temperature: parseFloat($('temperature').value),
    topP: parseFloat($('topP').value),
    topK: parseInt($('topK').value),
    maxTokens: parseInt($('maxTokens').value),
    contextSize: parseInt($('contextSize').value),
    gpuLayers: parseInt($('gpuLayers').value),
    threads: parseInt($('threads').value),
    repeatPenalty: parseFloat($('repeatPenalty').value),
    systemPrompt: el.systemPrompt.value
  };
  if ([s.temperature, s.topP, s.topK, s.maxTokens, s.contextSize, s.gpuLayers, s.threads, s.repeatPenalty].some(v => Number.isNaN(v))) {
    showToast('Please enter valid numbers in all parameters', 'error');
    return null;
  }
  if (s.contextSize < s.maxTokens) {
    showToast('Context Size should be >= Max Tokens', 'error');
    return null;
  }
  return s;
}

export async function applySettings() {
  const s = collectSettings();
  if (!s) return;
  const btn = $('applySettings');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Saving...';
  try {
    const res = await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    if (res.error) throw new Error(res.error);
    updateModelInfo();
    showToast('Settings saved. Restart server for context/gpu/thread changes.', 'success');
  } catch (e) { showToast(e.message || 'Failed to save settings', 'error'); }
  finally { btn.disabled = false; btn.textContent = original; }
}

export function renderPresets() {
  const presets = JSON.parse(localStorage.getItem('presets') || '{}');
  const sel = $('presetSelect');
  sel.innerHTML = '<option value="">Load preset...</option>';
  Object.keys(presets).forEach(name => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });
}

export function applyPreset(name) {
  const presets = JSON.parse(localStorage.getItem('presets') || '{}');
  const p = presets[name];
  if (!p) return;
  $('temperature').value = p.temperature;
  $('temperatureVal').textContent = p.temperature;
  $('topP').value = p.topP;
  $('topPVal').textContent = p.topP;
  $('topK').value = p.topK;
  $('topKVal').textContent = p.topK;
  $('maxTokens').value = p.maxTokens;
  $('contextSize').value = p.contextSize;
  $('gpuLayers').value = p.gpuLayers;
  $('threads').value = p.threads;
  $('repeatPenalty').value = p.repeatPenalty;
  $('repeatPenaltyVal').textContent = p.repeatPenalty;
  el.systemPrompt.value = p.systemPrompt || '';
  showToast('Preset "' + name + '" applied', 'success');
}

export function savePreset() {
  const name = prompt('Preset name:');
  if (!name) return;
  const presets = JSON.parse(localStorage.getItem('presets') || '{}');
  presets[name] = {
    temperature: $('temperature').value,
    topP: $('topP').value,
    topK: $('topK').value,
    maxTokens: $('maxTokens').value,
    contextSize: $('contextSize').value,
    gpuLayers: $('gpuLayers').value,
    threads: $('threads').value,
    repeatPenalty: $('repeatPenalty').value,
    systemPrompt: el.systemPrompt.value
  };
  localStorage.setItem('presets', JSON.stringify(presets));
  renderPresets();
  showToast('Preset "' + name + '" saved', 'success');
}

export function deletePreset() {
  const sel = $('presetSelect');
  const name = sel.value;
  if (!name) return;
  if (!confirm('Delete preset "' + name + '"?')) return;
  const presets = JSON.parse(localStorage.getItem('presets') || '{}');
  delete presets[name];
  localStorage.setItem('presets', JSON.stringify(presets));
  renderPresets();
  showToast('Preset "' + name + '" deleted');
}
