// Modifications Copyright (c) 2026 Ctrl IQ, Inc.
const { defineConfig, devices } = require('@playwright/test');

// The development environment serves the built UI over a self-signed
// certificate, which is why ignoreHTTPSErrors is on rather than optional.
const baseURL = process.env.ASCENDER_URL || 'https://localhost:8043';

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./seed.js'),
  // The suite talks to one shared instance and seeds data into it, so the
  // specs run one at a time rather than racing each other.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1400, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
