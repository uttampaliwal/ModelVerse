import { test, expect } from '@playwright/test';

// Runs against the isolated auth project server (own port + store file),
// so creating users here never affects the main suite.
test.describe('auth', () => {
  test.beforeAll(async ({ request }) => {
    // Reset leftover state so reruns start with auth disabled.
    const login = await request.post('/api/auth/login', {
      data: { username: 'e2e-admin', password: 'password-123' },
    });
    if (!login.ok()) return;
    const { token } = await login.json();
    const headers = { Authorization: `Bearer ${token}` };
    const users = await request.get('/api/auth/users', { headers });
    if (!users.ok()) return;
    const list = ((await users.json()).users as Array<{ username: string; admin: boolean }>)
      .filter((u) => !u.admin)
      .map((u) => u.username);
    for (const username of [...list, 'e2e-admin']) {
      await request.delete(`/api/auth/users/${username}`, { headers });
    }
  });

  test('status starts disabled and locks after first registration', async ({ request }) => {
    const before = await request.get('/api/auth/status');
    expect(before.ok()).toBeTruthy();
    expect((await before.json()).enabled).toBe(false);

    const register = await request.post('/api/auth/register', {
      data: { username: 'e2e-admin', password: 'password-123' },
    });
    expect(register.status()).toBe(201);
    expect(await register.json()).toMatchObject({ username: 'e2e-admin', admin: true });

    const after = await request.get('/api/auth/status');
    expect((await after.json()).enabled).toBe(true);

    const locked = await request.get('/api/models');
    expect(locked.status()).toBe(401);
  });

  test('login issues a token that unlocks the api', async ({ request }) => {
    const bad = await request.post('/api/auth/login', {
      data: { username: 'e2e-admin', password: 'wrongpass1' },
    });
    expect(bad.status()).toBe(401);

    const login = await request.post('/api/auth/login', {
      data: { username: 'e2e-admin', password: 'password-123' },
    });
    expect(login.ok()).toBeTruthy();
    const { token, admin } = await login.json();
    expect(typeof token).toBe('string');
    expect(admin).toBe(true);

    const me = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(await me.json()).toMatchObject({ username: 'e2e-admin', admin: true });

    const models = await request.get('/api/models', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(models.ok()).toBeTruthy();

    const users = await request.get('/api/auth/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await users.json()).users).toEqual(
      expect.arrayContaining([expect.objectContaining({ username: 'e2e-admin' })]),
    );
  });

  test('second registration needs the admin token', async ({ request }) => {
    const open = await request.post('/api/auth/register', {
      data: { username: 'e2e-bob', password: 'password-123' },
    });
    expect(open.status()).toBe(403);

    const login = await request.post('/api/auth/login', {
      data: { username: 'e2e-admin', password: 'password-123' },
    });
    const { token } = await login.json();
    const authed = await request.post('/api/auth/register', {
      headers: { Authorization: `Bearer ${token}` },
      data: { username: 'e2e-bob', password: 'password-123' },
    });
    expect(authed.status()).toBe(201);
  });

  test('login overlay appears and signs in through the UI', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('#authOverlay')).toBeVisible({ timeout: 10000 });
    await page.locator('#authUsername').fill('e2e-admin');
    await page.locator('#authPassword').fill('password-123');
    await page.locator('#authSubmitBtn').click();
    await expect(page.locator('#authOverlay')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#logoutBtn')).toBeVisible();

    // Cleanup: remove the extra user so reruns start clean.
    const login = await request.post('/api/auth/login', {
      data: { username: 'e2e-admin', password: 'password-123' },
    });
    const { token } = await login.json();
    await request.delete('/api/auth/users/e2e-bob', {
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});
