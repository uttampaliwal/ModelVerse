import { logError } from './logger.js';
import { showToast } from './toast.js';

let initialized = false;

/**
 * Global error boundary: catches otherwise-unhandled script errors and
 * promise rejections, logs them, and surfaces a toast so failures are never
 * silent. Engine failures additionally flip the status indicator to error.
 */
export function initErrorBoundary(): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener('error', (event) => {
    logError('window.onerror', event.error ?? event.message);
    showToast('Something went wrong. Your chats are saved.', 'error', { duration: 6000 });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError('unhandledrejection', event.reason);
    showToast('An operation failed unexpectedly.', 'error', { duration: 6000 });
  });
}

/** Surface an engine/backend failure in the status indicator + a toast. */
export function reportEngineError(message: string): void {
  logError('engine', message);
  const indicator = document.querySelector('#statusIndicator');
  const dot = indicator?.querySelector('.status-dot');
  const txt = indicator?.querySelector('.status-text');
  if (dot) dot.className = 'status-dot error';
  if (txt) txt.textContent = 'Error';
  showToast(message, 'error', { duration: 8000 });
}
