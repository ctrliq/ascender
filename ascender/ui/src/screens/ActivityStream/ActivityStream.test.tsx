import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { ActivityStreamAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ActivityStream from './ActivityStream';

vi.mock('../../api');

describe('<ActivityStream />', () => {
  beforeEach(() => {
    vi.mocked(ActivityStreamAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof ActivityStreamAPI.read>);
    vi.mocked(ActivityStreamAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof ActivityStreamAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders without crashing', async () => {
    renderWithContexts(<ActivityStream />);
    expect(
      await screen.findByRole('heading', { name: 'Activity Stream' })
    ).toBeInTheDocument();
  });

  test('names the types as the nav rail does', async () => {
    const { user } = renderWithContexts(<ActivityStream />);
    await user.click(
      await screen.findByRole('button', { name: 'Dashboard (All Activity)' })
    );

    [
      'Approvals',
      'Runs',
      'Labels',
      'API Applications & Tokens',
      'Notifications',
    ].forEach((name) =>
      expect(screen.getByRole('option', { name })).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('option', { name: 'Workflow Approvals' })
    ).not.toBeInTheDocument();
  });

  test('reads every kind of run for the Runs type', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/activity_stream?type=job,workflow_job,ad_hoc_command'],
    });
    renderWithContexts(<ActivityStream />, {
      context: { router: { history } },
    });

    expect(await screen.findByRole('button', { name: 'Runs' })).toBeVisible();
    await waitFor(() =>
      expect(ActivityStreamAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({
          or__object1__in: 'job,workflow_job,ad_hoc_command',
          or__object2__in: 'job,workflow_job,ad_hoc_command',
        })
      )
    );
  });
});
