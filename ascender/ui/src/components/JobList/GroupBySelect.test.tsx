import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { renderWithContexts } from '../../../testUtils/rtlContexts';
import GroupBySelect from './GroupBySelect';
import { getJobListQSConfig } from './qsConfig';

function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const view = renderWithContexts(
    <GroupBySelect qsConfig={getJobListQSConfig()} />,
    { context: { router: { history } } }
  );
  return { ...view, history };
}

async function selectOption(
  user: ReturnType<typeof renderAt>['user'],
  currentLabel: string,
  optionLabel: string
) {
  await user.click(screen.getByRole('button', { name: currentLabel }));
  await user.click(await screen.findByRole('option', { name: optionLabel }));
}

describe('<GroupBySelect />', () => {
  test('selects status grouping and clears the page', async () => {
    const { history, user } = renderAt(
      '/jobs?job.page=3&job.unified_job_template=12'
    );

    await selectOption(user, 'No grouping', 'Group by status');

    await waitFor(() =>
      expect(history.location.search).toContain('group_by=status')
    );
    expect(history.location.search).not.toContain('job.page');
    expect(history.location.search).toContain('job.unified_job_template=12');
  });

  test('selects template grouping and clears the page but keeps filters', async () => {
    const { history, user } = renderAt(
      '/jobs?job.page=3&job.unified_job_template=12'
    );

    await selectOption(user, 'No grouping', 'Group by template');

    await waitFor(() =>
      expect(history.location.search).toContain('group_by=template')
    );
    expect(history.location.search).not.toContain('job.page');
    expect(history.location.search).toContain('job.unified_job_template=12');
  });

  test('selects no grouping and clears the page', async () => {
    const { history, user } = renderAt(
      '/jobs?group_by=status&job.page=2&job.unified_job_template=12'
    );

    await selectOption(user, 'Group by status', 'No grouping');

    await waitFor(() =>
      expect(history.location.search).not.toContain('group_by=status')
    );
    expect(history.location.search).not.toContain('job.page');
    expect(history.location.search).toContain('job.unified_job_template=12');
  });

  test.each([
    'job.status=pending',
    'job.or__status=pending',
    'job.status__in=pending,running',
    'job.or__status__in=pending,running',
  ])('stays enabled while the %s status filter is set', (filter) => {
    renderAt(`/jobs?${filter}`);
    expect(screen.getByRole('button', { name: 'No grouping' })).toBeEnabled();
  });

  test('stays enabled while template grouping and a template filter are set', () => {
    renderAt('/jobs?group_by=template&job.unified_job_template=12');
    expect(
      screen.getByRole('button', { name: 'Group by template' })
    ).toBeEnabled();
  });

  test('stays enabled when only a template filter is set', () => {
    renderAt('/jobs?job.unified_job_template=12');
    expect(screen.getByRole('button', { name: 'No grouping' })).toBeEnabled();
  });
});
