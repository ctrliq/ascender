// Modifications Copyright (c) 2026 Ctrl IQ, Inc.
const { test, expect } = require('@playwright/test');
const { fixtures, login, route } = require('./helpers');

// RoutedTabs is shared by around forty screens, so a break here is broad.
test.describe('job tabs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('moves between Details and Output', async ({ page }) => {
    const { nodes } = fixtures();
    const { jobId } = nodes[0];
    await page.goto(route(`/jobs/management/${jobId}/output`), {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('tab', { name: 'Details' }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/management/${jobId}/details$`));
    await page.getByRole('tab', { name: 'Output' }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/management/${jobId}/output$`));
  });

  test('the workflow job has its own tabs', async ({ page }) => {
    const { workflowJobId } = fixtures();
    await page.goto(route(`/jobs/workflow/${workflowJobId}/output`), {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('tab', { name: 'Details' }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/workflow/${workflowJobId}/details$`));
  });

  test('Back to Jobs returns to the job list', async ({ page }) => {
    const { nodes } = fixtures();
    await page.goto(route(`/jobs/management/${nodes[0].jobId}/details`), {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('tab', { name: 'Back to Jobs' }).click();
    await expect(page).toHaveURL(/#\/jobs/);
  });
});
