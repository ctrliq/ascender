// Modifications Copyright (c) 2026 Ctrl IQ, Inc.
const { test, expect } = require('@playwright/test');
const { fixtures, login, route } = require('./helpers');

// RoutedTabs is shared by around forty screens, so a break here is broad.
test.describe('run tabs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('moves between Details and Output', async ({ page }) => {
    const { nodes } = fixtures();
    const { jobId } = nodes[0];
    await page.goto(route(`/runs/management/${jobId}/output`), {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('tab', { name: 'Details' }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/management/${jobId}/details$`));
    await page.getByRole('tab', { name: 'Output' }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/management/${jobId}/output$`));
  });

  test('the workflow job has its own tabs', async ({ page }) => {
    const { workflowJobId } = fixtures();
    await page.goto(route(`/runs/workflow/${workflowJobId}/output`), {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('tab', { name: 'Details' }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/workflow/${workflowJobId}/details$`));
  });

  test('Back to Runs returns to the runs list', async ({ page }) => {
    const { nodes } = fixtures();
    await page.goto(route(`/runs/management/${nodes[0].jobId}/details`), {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('tab', { name: 'Back to Runs' }).click();
    await expect(page).toHaveURL(/#\/runs/);
  });
});
