import { el, esc, closeSidebar } from './utils.js';
import { getConversations, setCurrentConvId, selectConversation, renameConversation, deleteConversation, newConversation } from './conversation.js';
import { showToast } from './toast.js';

let searchTimeout = null;

export function renderSidebar() {
  el.sidebarList.innerHTML = '';
  const convs = getConversations();
  const searchTerm = (el.sidebarSearch?.value || '').toLowerCase().trim();

  let filtered = convs;
  if (searchTerm) {
    filtered = convs.filter(c => c.title.toLowerCase().includes(searchTerm));
  }

  filtered.forEach(conv => {
    const div = document.createElement('div');
    div.className = 'conversation-item';
    const date = new Date(conv.updatedAt || conv.createdAt);
    const dateStr = date.toLocaleDateString();
    div.innerHTML = `
      <div class="conv-title" title="${esc(conv.title)}">${esc(conv.title)}</div>
      <div class="conv-meta">
        <span class="conv-date">${dateStr}</span>
        <span class="conv-msg-count">${conv.messages.length} msgs</span>
      </div>
      <div class="conv-actions">
        <span class="conv-action rename-action" title="Rename">✏️</span>
        <span class="conv-action delete-action" title="Delete">🗑️</span>
      </div>
    `;
    div.querySelector('.conv-title').addEventListener('click', () => {
      setCurrentConvId(conv.id);
      selectConversation(conv.id);
      closeSidebar();
    });
    div.querySelector('.rename-action').addEventListener('click', (e) => {
      e.stopPropagation();
      renameConversation(conv.id);
    });
    div.querySelector('.delete-action').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(conv.id);
    });
    el.sidebarList.appendChild(div);
  });
}

export function setupSidebarListeners() {
  el.sidebarSearch?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderSidebar, 150);
  });

  el.newChatBtn.addEventListener('click', () => {
    newConversation();
    closeSidebar();
  });
}


