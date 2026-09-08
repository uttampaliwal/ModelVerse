function authToken(): string | null {
  try {
    return localStorage.getItem('modelverse_token');
  } catch {
    return null;
  }
}

export async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const headers = new Headers(opts?.headers);
  if (!headers.has('Content-Type') && opts?.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = authToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new CustomEvent('modelverse:unauthorized'));
  }
  return (await res.json()) as T;
}
