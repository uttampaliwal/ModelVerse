import { defineConfig } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command: 'node server.js',
    env: { ...process.env, PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/api/version`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
