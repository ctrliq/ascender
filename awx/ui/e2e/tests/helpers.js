// Modifications Copyright (c) 2026 Ctrl IQ, Inc.
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const USERNAME = process.env.ASCENDER_USERNAME || 'admin';
const PASSWORD = process.env.ASCENDER_PASSWORD || 'password';

function fixtures() {
  const file = path.join(__dirname, '..', 'fixtures.json');
  if (!fs.existsSync(file)) {
    throw new Error('fixtures.json is missing; the global setup in seed.js writes it');
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// The UI is a hash router, so every route the specs visit is behind a #.
const route = (hash) => `/#${hash}`;

async function login(page) {
  await page.goto(route('/login'), { waitUntil: 'domcontentloaded' });
  await page.fill('#pf-login-username-id', USERNAME);
  await page.fill('#pf-login-password-id', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.hash.includes('/login'), {
    timeout: 60_000,
  });
}

// Console errors the application already emits. Anything not matched here fails
// the spec that saw it, so a new one has to be either fixed or added knowingly.
const ALLOWED_CONSOLE_ERRORS = [
  // websocket chatter when a job finishes while a page is open
  /websocket/i,
];

// Records console errors for a page and returns a checker. Call the checker at
// the point in the spec where the page should be quiet.
function watchConsole(page) {
  const seen = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (ALLOWED_CONSOLE_ERRORS.some((pattern) => pattern.test(text))) return;
    seen.push(text.split('\n')[0].slice(0, 200));
  });
  return {
    expectQuiet() {
      expect(seen, `unexpected console errors:\n${seen.join('\n')}`).toEqual([]);
    },
    seen,
  };
}

// The tab bar hosts the workflow job selector, whose toggle shows either the
// position within the workflow or, once a status filter is on, that status.
const workflowToggle = (page) =>
  page
    .locator('button[class*="menu-toggle"]')
    .filter({ hasText: /Workflow Job|Successful|Failed/ })
    .first();

const menuItem = (page, label) =>
  page.locator('.pf-v6-c-menu__item').filter({ hasText: label }).first();

module.exports = {
  fixtures,
  route,
  login,
  watchConsole,
  workflowToggle,
  menuItem,
  USERNAME,
};
