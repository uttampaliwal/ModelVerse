export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

interface Els {
  modelSelect: HTMLSelectElement;
  modelInfo: HTMLElement;
  modelBadge: HTMLElement;
  stopBtn: HTMLButtonElement;
  statusIndicator: HTMLElement;
  welcomeScreen: HTMLElement;
  userInput: HTMLTextAreaElement;
  sendBtn: HTMLButtonElement;
  stopGenerateBtn: HTMLButtonElement;
  tokenCount: HTMLElement;
  latency: HTMLElement;
  shortcutsModal: HTMLElement;
  toastContainer: HTMLElement;
  systemPrompt: HTMLTextAreaElement;
  chatContainer: HTMLElement;
  sidebar: HTMLElement;
  sidebarOverlay: HTMLElement;
  sidebarList: HTMLElement;
  sidebarSearch: HTMLInputElement;
  newChatBtn: HTMLButtonElement;
  exportBtn: HTMLButtonElement;
  refreshModelsBtn: HTMLButtonElement;
  settingsBtn: HTMLButtonElement;
  applySettings: HTMLButtonElement;
  collapseBtn: HTMLButtonElement;
  sidebarExpandBtn: HTMLButtonElement;
  scrollBottomBtn: HTMLButtonElement;
  menuBtn: HTMLButtonElement;
  settingsModal: HTMLElement;
  presetSelect: HTMLSelectElement;
  savePresetBtn: HTMLButtonElement;
  deletePresetBtn: HTMLButtonElement;
  chatMessages: HTMLElement;
  chatTitle: HTMLElement;
  restartBtn: HTMLButtonElement;
  attachmentPreview: HTMLElement;
  attachmentList: HTMLElement;
  attachBtn: HTMLButtonElement;
  fileInput: HTMLInputElement;
}

export const el: Els = {
  modelSelect: $('modelSelect'),
  modelInfo: $('modelInfo'),
  modelBadge: $('modelBadge'),
  stopBtn: $('stopBtn'),
  statusIndicator: $('statusIndicator'),
  welcomeScreen: $('welcomeScreen'),
  userInput: $('userInput'),
  sendBtn: $('sendBtn'),
  stopGenerateBtn: $('stopGenerateBtn'),
  tokenCount: $('tokenCount'),
  latency: $('latency'),
  shortcutsModal: $('shortcutsModal'),
  toastContainer: $('toastContainer'),
  systemPrompt: $('systemPrompt'),
  chatContainer: $('chatContainer'),
  sidebar: $('sidebar'),
  sidebarOverlay: $('sidebarOverlay'),
  sidebarList: $('conversationList'),
  sidebarSearch: $('convSearch'),
  newChatBtn: $('newChatBtn'),
  exportBtn: $('exportBtn'),
  refreshModelsBtn: $('refreshModelsBtn'),
  settingsBtn: $('settingsBtn'),
  applySettings: $('applySettings'),
  collapseBtn: $('collapseBtn'),
  sidebarExpandBtn: $('sidebarExpandBtn'),
  scrollBottomBtn: $('scrollBottomBtn'),
  menuBtn: $('menuBtn'),
  settingsModal: $('settingsModal'),
  presetSelect: $('presetSelect'),
  savePresetBtn: $('savePresetBtn'),
  deletePresetBtn: $('deletePresetBtn'),
  chatMessages: $('messages'),
  chatTitle: $('chatTitle'),
  restartBtn: $('restartBtn'),
  attachmentPreview: $('attachmentPreview'),
  attachmentList: $('attachmentList'),
  attachBtn: $('attachBtn'),
  fileInput: $('fileInput'),
};

export function esc(t: string): string {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

export function hideWelcome(): void {
  el.welcomeScreen.style.display = 'none';
  if (el.chatTitle) el.chatTitle.closest('.chat-header')?.classList.add('visible');
}

export function showWelcome(): void {
  el.welcomeScreen.style.display = 'flex';
  if (el.chatTitle) el.chatTitle.closest('.chat-header')?.classList.remove('visible');
}

export function showShortcuts(): void {
  el.shortcutsModal.classList.add('active');
}

export function closeSidebar(): void {
  el.sidebar.classList.remove('open');
  if (el.sidebarOverlay) el.sidebarOverlay.classList.remove('open');
}

export function downloadFile(content: string, filename: string, mime: string): void {
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
