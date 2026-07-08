export const $ = (id) => document.getElementById(id);

export const el = {
  modelSelect: $('modelSelect'), modelInfo: $('modelInfo'), modelBadge: $('modelBadge'),
  startBtn: $('startBtn'), stopBtn: $('stopBtn'),
  statusIndicator: $('statusIndicator'),
  welcomeScreen: $('welcomeScreen'), userInput: $('userInput'),
  sendBtn: $('sendBtn'), stopGenerateBtn: $('stopGenerateBtn'),
  tokenCount: $('tokenCount'), latency: $('latency'),
  shortcutsModal: $('shortcutsModal'),
  toastContainer: $('toastContainer'),
  systemPrompt: $('systemPrompt'), chatContainer: $('chatContainer'),
  sidebar: $('sidebar'), sidebarOverlay: $('sidebarOverlay'),
  sidebarList: $('conversationList'), sidebarSearch: $('convSearch'),
  newChatBtn: $('newChatBtn'), exportBtn: $('exportBtn'),
  refreshModelsBtn: $('refreshModelsBtn'), settingsBtn: $('settingsBtn'),
  applySettings: $('applySettings'), collapseBtn: $('collapseBtn'),
  sidebarExpandBtn: $('sidebarExpandBtn'), scrollBottomBtn: $('scrollBottomBtn'),
  menuBtn: $('menuBtn'), settingsModal: $('settingsModal'),
  presetSelect: $('presetSelect'), savePresetBtn: $('savePresetBtn'),
  deletePresetBtn: $('deletePresetBtn'),
  chatMessages: $('messages'),
  chatTitle: $('chatTitle'),
  restartBtn: $('restartBtn'),
  attachmentPreview: $('attachmentPreview'),
  previewImage: $('previewImage'),
  attachmentName: $('attachmentName'),
  attachBtn: $('attachBtn'),
  removeAttachBtn: $('removeAttachBtn'),
  fileInput: $('fileInput')
};

export function esc(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

export function hideWelcome() {
  el.welcomeScreen.style.display = 'none';
  if (el.chatTitle) el.chatTitle.closest('.chat-header')?.classList.add('visible');
}

export function showWelcome() {
  el.welcomeScreen.style.display = 'flex';
  el.chatMessages.innerHTML = '';
  if (el.chatTitle) el.chatTitle.closest('.chat-header')?.classList.remove('visible');
}

export function showShortcuts() { el.shortcutsModal.classList.add('active'); }

export function closeSidebar() {
  el.sidebar.classList.remove('open');
  if (el.sidebarOverlay) el.sidebarOverlay.classList.remove('open');
}

export function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
