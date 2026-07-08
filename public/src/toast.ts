import { el } from './utils.js';

export function showToast(msg: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  el.toastContainer.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 200);
  }, 4000);
}
