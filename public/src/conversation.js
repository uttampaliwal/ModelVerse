import { el, showWelcome, downloadFile } from './utils.js';
import { showToast } from './toast.js';
import { buildMessageHtml, extractThinking, formatMd } from './markdown.js';
import { renderMath, highlightCodeBlocks } from './latex.js';

let conversations = (() => {
  try {
    const raw = localStorage.getItem('conversations');
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v;
    // Migrate from old object format { id: conv, ... } to array
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const arr = Object.values(v);
      localStorage.setItem('conversations', JSON.stringify(arr));
      return arr;
    }
    return [];
  } catch (e) { return []; }
})();
let currentConversationId = localStorage.getItem('currentConversationId') || null;

export function getCurrentConv() {
  if (!Array.isArray(conversations)) return null;
  return conversations.find(c => c.id === currentConversationId) || null;
}

export function setCurrentConvId(id) {
  currentConversationId = id;
  if (id) localStorage.setItem('currentConversationId', id);
  else localStorage.removeItem('currentConversationId');
}

export function saveConversations() {
  localStorage.setItem('conversations', JSON.stringify(conversations));
}

export function getConversations() {
  return Array.isArray(conversations) ? conversations : [];
}

export function setConversations(c) {
  conversations = c;
}

export function newConversation() {
  const conv = {
    id: Date.now().toString(),
    title: 'New Conversation',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  conversations.unshift(conv);
  currentConversationId = conv.id;
  saveConversations();
  el.chatMessages.innerHTML = '';
  el.chatTitle.textContent = 'New Conversation';
  el.sendBtn.classList.remove('regenerate-mode');
  el.sendBtn.querySelector('.btn-icon').textContent = '➤';
  el.sendBtn.querySelector('.btn-label').textContent = 'Send';
  el.userInput.value = '';
  el.restartBtn.classList.add('hidden');
  return conv;
}

export function selectConversation(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  currentConversationId = id;
  el.sendBtn.classList.remove('regenerate-mode');
  el.sendBtn.querySelector('.btn-icon').textContent = '➤';
  el.sendBtn.querySelector('.btn-label').textContent = 'Send';
  el.restartBtn.classList.add('hidden');
  saveConversations();
  renderConversation(conv);
}

export function renderConversation(conv) {
  el.chatMessages.innerHTML = '';
  el.chatTitle.textContent = conv.title;
  conv.messages.forEach(msg => renderMessage(msg, false));
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

export function renderMessage(msg, scroll = true, streaming = false) {
  const div = document.createElement('div');
  div.className = `message ${msg.role}`;
  div.dataset.messageId = msg.id;
  const thinking = msg.thinking || '';

  if (msg.role === 'user') {
    div.innerHTML = `<div class="message-content">${msg.content}</div><div class="message-actions"><span class="edit-message-btn" title="Edit">✏️</span><span class="delete-message-btn" title="Delete">🗑️</span></div>`;
  } else if (streaming && !msg.content) {
    div.innerHTML = `<div class="message-content"><div class="thinking-container" style="display:none"><details class="thinking-block"><summary>Thinking...</summary><div class="thinking-content"></div></details></div><div class="response-container"></div></div><div class="message-actions"><span class="copy-message-btn" title="Copy">📋</span><span class="regenerate-btn" title="Regenerate">🔄</span><span class="delete-message-btn" title="Delete">🗑️</span></div>`;
  } else {
    const { thinking: t, content: c } = extractThinking(msg.content);
    const th = t || thinking;
    div.innerHTML = `<div class="message-content">${buildMessageHtml(th, c || msg.content, msg.createdAt)}</div><div class="message-actions"><span class="copy-message-btn" title="Copy">📋</span><span class="regenerate-btn" title="Regenerate">🔄</span><span class="delete-message-btn" title="Delete">🗑️</span></div>`;
  }
  el.chatMessages.appendChild(div);
  requestAnimationFrame(() => {
    const contentDiv = div.querySelector('.message-content');
    if (contentDiv) {
      renderMath(contentDiv);
      highlightCodeBlocks();
    }
  });
  if (scroll) el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

export function updateStreamingContent(msgId, fullContent, thinkingText, responseText) {
  const msgEl = el.chatMessages.querySelector(`.message[data-message-id="${msgId}"]`);
  if (!msgEl) return;
  const thinkingContainer = msgEl.querySelector('.thinking-container');
  const responseContainer = msgEl.querySelector('.response-container');
  if (!thinkingContainer && !responseContainer) {
    updateMessageContent(msgId, fullContent);
    return;
  }
  if (thinkingText && thinkingContainer) {
    thinkingContainer.style.display = '';
    const tc = thinkingContainer.querySelector('.thinking-content');
    if (tc) tc.textContent = thinkingText;
  }
  if (responseContainer && responseText) {
    responseContainer.innerHTML = formatMd(responseText);
  }
}

export function updateMessageContent(msgId, content) {
  const msgEl = el.chatMessages.querySelector(`.message[data-message-id="${msgId}"]`);
  if (!msgEl) return;
  const contentDiv = msgEl.querySelector('.message-content');
  if (contentDiv) {
    const msg = conversations.flatMap(c => c.messages).find(m => m.id === msgId);
    const thinking = msg ? msg.thinking : '';
    const { thinking: t, content: c } = extractThinking(content);
    const th = t || thinking;
    contentDiv.innerHTML = buildMessageHtml(th, c || content, msg?.createdAt);
    renderMath(contentDiv);
    highlightCodeBlocks();
  }
}

export function generateTitle(conv) {
  const firstMsg = conv.messages.find(m => m.role === 'user');
  if (!firstMsg) return 'New Conversation';
  const txt = firstMsg.content.replace(/<[^>]*>/g, '').trim();
  return txt.length > 40 ? txt.substring(0, 40) + '...' : txt;
}

export function renameConversation(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  const newTitle = prompt('Conversation name:', conv.title);
  if (newTitle && newTitle.trim()) {
    conv.title = newTitle.trim();
    conv.updatedAt = new Date().toISOString();
    saveConversations();
    import('./sidebar.js').then(m => m.renderSidebar());
    if (currentConversationId === id) el.chatTitle.textContent = conv.title;
  }
}

export function deleteConversation(id) {
  if (!confirm('Delete this conversation?')) return;
  conversations = conversations.filter(c => c.id !== id);
  if (currentConversationId === id) {
    currentConversationId = null;
    localStorage.removeItem('currentConversationId');
    el.chatMessages.innerHTML = '';
    showWelcome();
    el.restartBtn.classList.add('hidden');
  }
  saveConversations();
  import('./sidebar.js').then(m => m.renderSidebar());
}

export function exportConversation(format) {
  const conv = getCurrentConv();
  if (!conv) return showToast('No conversation to export', 'error');

  if (format === 'markdown') {
    let md = `# ${conv.title}\n\n`;
    conv.messages.forEach(m => {
      md += `### ${m.role === 'user' ? 'You' : 'Assistant'}\n\n`;
      const plain = m.content.replace(/<[^>]*>/g, '');
      md += plain + '\n\n';
    });
    downloadFile(md, `${conv.title.replace(/[^a-z0-9]/gi, '_')}.md`, 'text/markdown');
  } else if (format === 'json') {
    downloadFile(JSON.stringify(conv, null, 2), `${conv.title.replace(/[^a-z0-9]/gi, '_')}.json`, 'application/json');
  }
}
