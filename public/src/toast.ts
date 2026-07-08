import { el } from './utils.js';

interface ToastOptions {
  duration?: number;
  closable?: boolean;
}

const ICONS: Record<string, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

export function showToast(
  msg: string,
  type: 'info' | 'success' | 'error' = 'info',
  options: ToastOptions = {},
): void {
  const { duration = 4000, closable = true } = options;

  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.setAttribute('role', 'alert');
  t.setAttribute('aria-live', 'polite');

  // Icon
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = ICONS[type] || ICONS.info;
  icon.setAttribute('aria-hidden', 'true');

  // Content
  const content = document.createElement('div');
  content.className = 'toast-content';

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = msg;

  content.appendChild(icon);
  content.appendChild(text);

  // Close button
  if (closable) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.addEventListener('click', () => removeToast(t));
    t.appendChild(closeBtn);
  }

  // Progress bar
  const progress = document.createElement('div');
  progress.className = 'toast-progress';
  progress.style.animationDuration = `${duration}ms`;

  t.appendChild(content);
  t.appendChild(progress);

  el.toastContainer.appendChild(t);

  // Auto-remove after duration
  const timer = setTimeout(() => removeToast(t), duration);

  // Pause on hover
  t.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    progress.style.animationPlayState = 'paused';
  });

  t.addEventListener('mouseleave', () => {
    progress.style.animationPlayState = 'running';
    setTimeout(() => removeToast(t), 2000);
  });
}

function removeToast(t: HTMLElement): void {
  if (t.classList.contains('removing')) return;
  t.classList.add('removing');
  setTimeout(() => t.remove(), 300);
}
