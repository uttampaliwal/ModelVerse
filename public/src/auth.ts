import { api } from './api.js';
import { logError } from './logger.js';
import { showToast } from './toast.js';

const TOKEN_KEY = 'modelverse_token';
const USER_KEY = 'modelverse_user';

export interface SessionUser {
  username: string;
  admin: boolean;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function currentUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as SessionUser;
    if (typeof user.username !== 'string') return null;
    return { username: user.username, admin: user.admin === true };
  } catch {
    return null;
  }
}

function setSession(token: string, user: SessionUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {
    logError('auth:persist', e);
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

async function postAuth(
  path: string,
  username: string,
  password: string,
): Promise<{ token?: string; username?: string; admin?: boolean; error?: string }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json()) as {
    token?: string;
    username?: string;
    admin?: boolean;
    error?: string;
  };
  if (!res.ok) return { error: body.error || `Request failed (${res.status})` };
  return body;
}

/** Validate the stored token against the server. */
export async function fetchMe(): Promise<SessionUser> {
  const user = await api<SessionUser>('/api/auth/me');
  if (!user || typeof user.username !== 'string') throw new Error('Invalid session');
  return user;
}

function showError(message: string): void {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = message;
  el.style.display = '';
}

function hideError(): void {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

export function showAuthOverlay(registerMode = false): void {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.style.display = '';
  const subtitle = document.getElementById('authSubtitle');
  if (subtitle) {
    subtitle.textContent = registerMode
      ? 'Create the first (admin) account'
      : 'Sign in to continue';
  }
  hideError();
  const userInput = document.getElementById('authUsername') as HTMLInputElement | null;
  userInput?.focus();
  updateLogoutVisibility();
}

export function hideAuthOverlay(): void {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.style.display = 'none';
  updateLogoutVisibility();
}

export function updateLogoutVisibility(): void {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.style.display = getToken() ? '' : 'none';
}

async function handleSubmit(): Promise<void> {
  const usernameEl = document.getElementById('authUsername') as HTMLInputElement | null;
  const passwordEl = document.getElementById('authPassword') as HTMLInputElement | null;
  const submitBtn = document.getElementById('authSubmitBtn') as HTMLButtonElement | null;
  const username = usernameEl?.value.trim() ?? '';
  const password = passwordEl?.value ?? '';
  if (!username || !password) {
    showError('Enter a username and password.');
    return;
  }
  if (submitBtn) submitBtn.disabled = true;
  hideError();
  try {
    // First try login; if the server has no users yet, register instead.
    let result = await postAuth('/api/auth/login', username, password);
    if (result.error && result.error.includes('Invalid username')) {
      const status = await api<{ enabled: boolean }>('/api/auth/status');
      if (!status.enabled) {
        result = await postAuth('/api/auth/register', username, password);
        if (!result.error) {
          const loginResult = await postAuth('/api/auth/login', username, password);
          if (!loginResult.error && loginResult.token && loginResult.username) {
            result = loginResult;
          }
        }
      }
    }
    if (result.error || !result.token || !result.username) {
      showError(result.error || 'Sign in failed.');
      return;
    }
    setSession(result.token, { username: result.username, admin: result.admin === true });
    hideAuthOverlay();
    showToast(`Signed in as ${result.username}`, 'success');
    window.location.reload();
  } catch (e) {
    logError('auth:submit', e);
    showError('Could not reach the server.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

export function logout(): void {
  clearSession();
  window.location.reload();
}

/** Check server auth state on boot; show the overlay when a session is required. */
export async function checkAuthState(): Promise<void> {
  const status = await api<{ enabled: boolean }>('/api/auth/status').catch(() => null);
  if (!status) return; // server unreachable: chat UI already reports connection errors
  updateLogoutVisibility();
  if (!status.enabled) return;
  const token = getToken();
  if (token) {
    try {
      const me = await fetchMe();
      setSession(token, me);
      hideAuthOverlay();
      return;
    } catch {
      clearSession();
    }
  }
  showAuthOverlay();
}

/** Wire overlay buttons + global 401 handling. Call once during init. */
export function initAuthUI(): void {
  document.getElementById('authSubmitBtn')?.addEventListener('click', () => void handleSubmit());
  document.getElementById('authPassword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void handleSubmit();
  });
  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());
  window.addEventListener('modelverse:unauthorized', () => showAuthOverlay());
  updateLogoutVisibility();
}
