// Modifications Copyright (c) 2026 Ctrl IQ, Inc.
//
// Regression cover for #742: the workflow job selector in the job tab bar read
// "Workflow Job 1/X" on every task, and picking another task did nothing. The
// jest suite could not catch either one. The counter was wrong in jsdom too,
// but the dead click was a real-browser problem: the click bubbled out of the
// selector into the tab that hosts it, and jsdom does not reproduce that.
const { test, expect } = require('@playwright/test');
const {
  fixtures,
  login,
  route,
  watchConsole,
  watchLayoutLoops,
  workflowToggle,
  menuItem,
} = require('./helpers');

test.describe('workflow job selector', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('shows which of the workflow jobs is on screen', async ({ page }) => {
    const { nodes } = fixtures();
    for (let i = 0; i < nodes.length; i += 1) {
      await page.goto(route(`/jobs/management/${nodes[i].jobId}/output`), {
        waitUntil: 'domcontentloaded',
      });
      await expect(workflowToggle(page)).toHaveText(
        `Workflow Job ${i + 1}/${nodes.length}`
      );
    }
  });

  test('switches to the job picked from the menu', async ({ page }) => {
    const { nodes } = fixtures();
    const [first, , third] = nodes;
    await page.goto(route(`/jobs/management/${first.jobId}/output`), {
      waitUntil: 'domcontentloaded',
    });
    const console_ = watchConsole(page);

    await workflowToggle(page).click();
    await menuItem(page, third.identifier).click();

    await expect(page).toHaveURL(new RegExp(`/jobs/management/${third.jobId}/output$`));
    await expect(workflowToggle(page)).toHaveText(`Workflow Job 3/${nodes.length}`);
    console_.expectQuiet();
  });

  test('keeps working on a second move, without a page load in between', async ({ page }) => {
    // the menu used to hold the list it was given on first render, so after one
    // move it still offered the jobs belonging to the page you came from
    const { nodes } = fixtures();
    const [first, second, third] = nodes;
    await page.goto(route(`/jobs/management/${first.jobId}/output`), {
      waitUntil: 'domcontentloaded',
    });

    await workflowToggle(page).click();
    await menuItem(page, third.identifier).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/management/${third.jobId}/output$`));

    await workflowToggle(page).click();
    await menuItem(page, second.identifier).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/management/${second.jobId}/output$`));
    await expect(workflowToggle(page)).toHaveText(`Workflow Job 2/${nodes.length}`);
  });

  test('lists every job node, and picking the current one is harmless', async ({ page }) => {
    const { nodes } = fixtures();
    const current = nodes[1];
    await page.goto(route(`/jobs/management/${current.jobId}/output`), {
      waitUntil: 'domcontentloaded',
    });
    await workflowToggle(page).click();
    for (const node of nodes) {
      await expect(menuItem(page, node.identifier)).toBeVisible();
    }
    await menuItem(page, current.identifier).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/management/${current.jobId}/output$`));
  });

  test('filters the list by status', async ({ page }) => {
    const { nodes } = fixtures();
    await page.goto(route(`/jobs/management/${nodes[0].jobId}/output`), {
      waitUntil: 'domcontentloaded',
    });
    await workflowToggle(page).click();
    // the fixture workflow succeeds, so Successful keeps every node and Failed
    // keeps none
    await expect(page.getByRole('option', { name: /Successful/ })).toHaveText(
      new RegExp(`\\(${nodes.length}\\)`)
    );
    await page.getByRole('option', { name: /Successful/ }).click();
    await expect(workflowToggle(page)).toHaveText(/Successful/);
    for (const node of nodes) {
      await expect(menuItem(page, node.identifier)).toBeVisible();
    }
  });
});

test.describe('job output layout', () => {
  // The rows are measured with a ResizeObserver, and the scroll container used
  // to take its height from the rows, so the first measurements resized it in
  // the same frame and the browser reported an undelivered-notifications loop.
  // The dev server's error overlay turned that into a full-screen error on
  // every job output page. jsdom has no layout, so only a browser can see it.
  test('measures its rows without a ResizeObserver loop', async ({ page }) => {
    const loops = await watchLayoutLoops(page);
    await login(page);
    const { nodes } = fixtures();
    await page.goto(route(`/jobs/management/${nodes[0].jobId}/output`), {
      waitUntil: 'domcontentloaded',
    });
    const scroller = page.locator('.ascender-output-scroll');
    await expect(scroller.locator('[data-index]').first()).toBeVisible();
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    // the notice is reported on the frame after the measurements land
    await page.waitForTimeout(1000);
    await loops.expectQuiet();
  });
});
