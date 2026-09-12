// Modifications Copyright (c) 2026 Ctrl IQ, Inc.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { login, route, watchConsole } = require('./helpers');

// The screens worth scanning first: the one page a signed out visitor sees, and
// the list views that most of the application is built from.
const SCREENS = [
  { name: 'login', hash: '/login', authenticated: false },
  { name: 'jobs', hash: '/jobs', authenticated: true },
  { name: 'templates', hash: '/templates', authenticated: true },
];

// The application does not pass WCAG today, so a zero-violation gate would fail
// on arrival and be switched off within a week. This records what each screen
// violates now and fails on anything new, which is what catches a regression.
//
// What is recorded, and why it is recorded rather than fixed: the list views
// colour the sorted column's header in the brand green, #0e8c5d, which is
// 4.25:1 on the table background where AA asks for 4.5:1. It comes out of
// --pf-v6-c-table__sort--m-selected__button--Color, and the value behind that
// is the brand colour itself, so moving it is a palette decision across all
// four themes rather than a patch: the same green is 4.26:1 on the light
// themes' white, and the lighter #12a66f that fixes the dark ones is 3.13:1
// there. It wants a colour picked on purpose, which is not this suite's call.
const BASELINE_FILE = path.join(__dirname, '..', 'accessibility-baseline.json');

function baseline() {
  if (!fs.existsSync(BASELINE_FILE)) return {};
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
}

test.describe('accessibility', () => {
  for (const screen of SCREENS) {
    test(`${screen.name} introduces no new accessibility violations`, async ({
      page,
    }) => {
      const console_ = watchConsole(page);
      if (screen.authenticated) {
        await login(page);
        await page.goto(route(screen.hash), { waitUntil: 'domcontentloaded' });
      } else {
        await page.goto(route(screen.hash), { waitUntil: 'domcontentloaded' });
      }
      // the lists fetch before they render, so wait for the toolbar rather than a timer
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      const found = results.violations.map((v) => v.id).sort();
      const known = (baseline()[screen.name] || []).sort();
      const introduced = found.filter((id) => !known.includes(id));

      expect(
        introduced,
        `new accessibility violations on ${screen.name}: ${introduced.join(', ')}`
      ).toEqual([]);
      console_.expectQuiet();
    });
  }
});
