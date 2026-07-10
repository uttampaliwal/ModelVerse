import { $, el } from './utils.js';
import type { Theme } from './theme.js';

interface Command {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

let commands: Command[] = [];
let filtered: Command[] = [];
let selectedIndex = -1;
let initialized = false;

function init(): void {
  const dialog = $<HTMLElement>('commandPalette');
  const input = $<HTMLInputElement>('commandInput');
  const list = $<HTMLElement>('commandList');
  if (!dialog || !input || !list) return;

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closePalette();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.style.display !== 'none') {
      closePalette();
    }
  });

  input.addEventListener('input', () => filterCommands(input.value));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigate(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigate(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeSelected();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      closePalette();
    }
  });
}

function injectCSS(): void {
  if (document.querySelector('link[href*="command-palette.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/command-palette.css';
  document.head.appendChild(link);
}

function buildCommands(): void {
  commands = [
    {
      id: 'new-chat',
      label: 'New Chat',
      description: 'Start a fresh conversation',
      shortcut: 'Ctrl+Shift+N',
      category: 'chat',
      action: () =>
        void import('./conversation.js').then((m) => {
          m.newConversation();
          void import('./sidebar.js').then((s) => s.renderSidebar());
        }),
    },
    {
      id: 'search',
      label: 'Search Conversations',
      description: 'Find messages and conversations',
      shortcut: 'Ctrl+K',
      category: 'chat',
      action: () => void import('./search.js').then((m) => m.openSearch()),
    },
    {
      id: 'switch-model',
      label: 'Switch Model...',
      description: 'Change the active LLM model',
      category: 'model',
      action: () => {
        closePalette();
        el.modelSelect.focus();
      },
    },
    {
      id: 'refresh-models',
      label: 'Refresh Models',
      description: 'Rescan for available models',
      category: 'model',
      action: () => void import('./models.js').then((m) => m.loadModels()),
    },
    {
      id: 'settings',
      label: 'Open Settings',
      description: 'Configure engine, appearance, and profiles',
      shortcut: 'Ctrl+,',
      category: 'app',
      action: () => {
        el.settingsModal.classList.add('active');
      },
    },
    {
      id: 'plugins',
      label: 'Plugins',
      description: 'Manage installed plugins and tools',
      category: 'app',
      action: () => {
        el.settingsModal.classList.add('active');
        setTimeout(() => {
          document.querySelector<HTMLElement>('[data-tab="plugins"]')?.click();
        }, 50);
      },
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      description: 'Show or hide the conversation sidebar',
      shortcut: 'Ctrl+Shift+S',
      category: 'app',
      action: () => {
        el.sidebar.classList.toggle('open');
        el.sidebarOverlay?.classList.toggle('open');
      },
    },
    {
      id: 'toggle-theme',
      label: 'Toggle Theme',
      description: 'Cycle through available color themes',
      category: 'app',
      action: () =>
        void import('./theme.js').then((m) => {
          const themes = ['dark', 'light', 'oled', 'dracula', 'nord', 'catppuccin', 'gruvbox'];
          const current = m.getTheme();
          const next = themes[(themes.indexOf(current) + 1) % themes.length];
          m.applyTheme(next as Theme);
          void import('./toast.js').then((t) =>
            t.showToast(`Theme: ${next.charAt(0).toUpperCase() + next.slice(1)}`, 'success'),
          );
        }),
    },
    {
      id: 'stop-generation',
      label: 'Stop Generation',
      description: 'Cancel the current model response',
      category: 'chat',
      action: () => void import('./chat.js').then((m) => m.stopGeneration()),
    },
    {
      id: 'restart-chat',
      label: 'Restart Conversation',
      description: 'Clear all messages in the current chat',
      shortcut: 'Ctrl+Shift+C',
      category: 'chat',
      action: () => void import('./chat.js').then((m) => m.restartConversation()),
    },
    {
      id: 'export-markdown',
      label: 'Export as Markdown',
      description: 'Export conversation as a Markdown file',
      category: 'chat',
      action: () => void import('./conversation.js').then((m) => m.exportConversation('markdown')),
    },
    {
      id: 'export-json',
      label: 'Export as JSON',
      description: 'Export conversation as a JSON file',
      category: 'chat',
      action: () => void import('./conversation.js').then((m) => m.exportConversation('json')),
    },
    {
      id: 'shortcuts',
      label: 'Keyboard Shortcuts',
      description: 'Show all available keyboard shortcuts',
      category: 'app',
      action: () => void import('./utils.js').then((m) => m.showShortcuts()),
    },
  ];
}

function filterCommands(query: string): void {
  const q = query.toLowerCase().trim();
  if (!q) {
    filtered = [...commands];
  } else {
    filtered = commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }
  selectedIndex = filtered.length > 0 ? 0 : -1;
  render();
}

function render(): void {
  const list = $<HTMLElement>('commandList');
  if (!list) return;

  if (filtered.length === 0) {
    list.innerHTML = '<div class="command-empty">No matching commands</div>';
    return;
  }

  list.innerHTML = filtered
    .map(
      (c, i) => `
    <div class="command-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}">
      <div class="command-item-left">
        <span class="command-label">${esc(c.label)}</span>
        <span class="command-desc">${esc(c.description)}</span>
      </div>
      ${c.shortcut ? `<kbd class="command-shortcut">${esc(c.shortcut)}</kbd>` : ''}
    </div>
  `,
    )
    .join('');

  list.querySelectorAll('.command-item').forEach((item) => {
    item.addEventListener('click', () => {
      selectedIndex = parseInt((item as HTMLElement).dataset.index || '0');
      executeSelected();
    });
    item.addEventListener('mouseenter', () => {
      selectedIndex = parseInt((item as HTMLElement).dataset.index || '0');
      render();
    });
  });

  const selected = list.querySelector('.command-item.selected');
  if (selected) selected.scrollIntoView({ block: 'nearest' });
}

function navigate(direction: number): void {
  if (filtered.length === 0) return;
  selectedIndex += direction;
  if (selectedIndex < 0) selectedIndex = filtered.length - 1;
  if (selectedIndex >= filtered.length) selectedIndex = 0;
  render();
}

function executeSelected(): void {
  if (selectedIndex < 0 || selectedIndex >= filtered.length) return;
  closePalette();
  filtered[selectedIndex].action();
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function initPalette(): void {
  if (initialized) return;
  injectCSS();
  buildCommands();
  init();
  initialized = true;
}

export function openPalette(): void {
  initPalette();
  const dialog = $<HTMLElement>('commandPalette');
  const input = $<HTMLInputElement>('commandInput');
  if (!dialog || !input) return;

  filtered = [...commands];
  selectedIndex = 0;
  render();
  dialog.style.display = 'flex';
  input.value = '';
  input.focus();
}

export function closePalette(): void {
  const dialog = $<HTMLElement>('commandPalette');
  if (dialog) dialog.style.display = 'none';
}
