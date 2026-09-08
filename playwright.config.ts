import { defineConfig } from '@playwright/test';

const PORT = 3100;
const AUTH_PORT = 3101;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  projects: [
    {
      name: 'main',
      testMatch: ['app.spec.ts', 'api.spec.ts'],
      use: { baseURL: `http://127.0.0.1:${PORT}` },
    },
    {
      name: 'auth',
      testMatch: ['auth.spec.ts'],
      use: { baseURL: `http://127.0.0.1:${AUTH_PORT}` },
    },
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: [
    {
      command: 'node server.js',
      env: { ...process.env, PORT: String(PORT) },
      url: `http://127.0.0.1:${PORT}/api/version`,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      // Isolated auth server: own port + own user store so auth tests
      // never lock the main suite out.
      command: 'node server.js',
      env: {
        ...process.env,
        PORT: String(AUTH_PORT),
        AUTH_STORE_FILE: 'test-results/e2e-auth-users.json',
        AUTH_SECRET_FILE: 'test-results/e2e-auth-secret',
      },
      url: `http://127.0.0.1:${AUTH_PORT}/api/version`,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
