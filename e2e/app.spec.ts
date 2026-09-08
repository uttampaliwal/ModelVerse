import { test, expect } from '@playwright/test';

test.describe('app shell', () => {
  test('loads with sidebar, welcome screen, and input', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ModelVerse/);
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await expect(page.locator('#userInput')).toBeVisible();
    await expect(page.locator('#statusBar')).toBeVisible();
  });

  test('shows disconnected status with no engine running', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#statusIndicator .status-text')).toContainText(
      /Disconnected|Error/,
      { timeout: 10000 },
    );
  });

  test('export modal opens and offers backup/restore', async ({ page }) => {
    await page.goto('/');
    await page.locator('#exportBtn').click();
    const modal = page.locator('#exportModal');
    await expect(modal).toHaveClass(/active/);
    await expect(modal.locator('[data-format="markdown"]')).toBeVisible();
    await expect(modal.locator('[data-format="backup"]')).toBeVisible();
    await expect(modal.locator('[data-format="restore"]')).toBeVisible();
    await page.locator('#exportCloseBtn').click();
    await expect(modal).not.toHaveClass(/active/);
  });

  test('settings modal opens with categories', async ({ page }) => {
    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    await expect(page.locator('.settings-nav-item[data-category="general"]')).toBeVisible();
  });

  test('global errors surface a toast instead of failing silently', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    // Retry: a probe fired while app init is still attaching handlers is
    // legitimately missed, so re-fire until the boundary observes it.
    await expect(async () => {
      await page.evaluate(() => {
        void Promise.reject(new Error('e2e probe'));
      });
      await expect(page.locator('#toastContainer .toast.error')).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
  });
});
