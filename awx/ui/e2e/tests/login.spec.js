// Modifications Copyright (c) 2026 Ctrl IQ, Inc.
const { test, expect } = require('@playwright/test');
const { login, route, watchConsole, USERNAME } = require('./helpers');

test.describe('signing in', () => {
  test('lands somewhere other than the login page and knows who you are', async ({ page }) => {
    const console_ = watchConsole(page);
    await login(page);
    await expect(page).not.toHaveURL(/\/login/);
    // the account menu carries the username once a session exists
    await expect(page.getByText(USERNAME, { exact: true }).first()).toBeVisible();
    console_.expectQuiet();
  });

  test('an unauthenticated visit is sent to the login page', async ({ page }) => {
    await page.goto(route('/jobs'), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.location.hash.includes('/login'), {
      timeout: 30_000,
    });
    await expect(page.locator('#pf-login-username-id')).toBeVisible();
  });
});
