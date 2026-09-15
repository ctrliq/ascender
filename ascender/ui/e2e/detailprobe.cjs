const { chromium } = require('@playwright/test');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const base = 'https://localhost:8043';
  await page.goto(base + '/#/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#pf-login-username-id', 'admin');
  await page.fill('#pf-login-password-id', 'password');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.hash.includes('/login'), { timeout: 60000 });

  const id = require('./fixtures.json').nodes[0].jobId;
  const out = {};
  for (const [name, hash] of [['job detail', `/jobs/system/${id}/details`], ['settings jobs', '/settings/jobs/details']]) {
    await page.goto(base + '/#' + hash, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    out[name] = await page.evaluate(() => {
      const pick = (el, props) => el ? Object.fromEntries(props.map((p) => [p, getComputedStyle(el)[p]])) : null;
      const dl = document.querySelector('dl');
      const dt = document.querySelector('dl dt');
      const dd = document.querySelector('dl dd');
      const div = document.querySelector('dl > div');
      return {
        dls: document.querySelectorAll('dl').length,
        dl: pick(dl, ['display', 'gridTemplateColumns', 'columnGap', 'rowGap', 'margin', 'fontSize', 'alignItems']),
        dt: pick(dt, ['fontSize', 'fontWeight', 'color', 'textTransform', 'letterSpacing', 'marginBottom', 'gridColumn']),
        dd: pick(dd, ['overflowWrap', 'margin', 'color', 'gridColumn']),
        div: pick(div, ['padding']),
      };
    });
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log('captured ->', process.argv[2]);
  await browser.close();
})();
