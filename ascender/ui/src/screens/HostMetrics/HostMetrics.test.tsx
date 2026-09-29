import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { HostMetricsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import HostMetrics from './HostMetrics';

vi.mock('../../api');

const mockHostMetrics = [
  {
    hostname: 'Host name',
    first_automation: 'now',
    last_automation: 'now',
    automated_counter: 1,
    used_in_inventories: 1,
    deleted_counter: 1,
    id: 1,
    url: '',
  },
];

describe('<HostMetrics />', () => {
  beforeEach(() => {
    vi.mocked(HostMetricsAPI.read).mockResolvedValue({
      data: {
        count: mockHostMetrics.length,
        results: mockHostMetrics,
      },
    } as unknown as ResponseOf<typeof HostMetricsAPI.read>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(<HostMetrics />);
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
  });

  test('HostMetrics are retrieved from the api and the components finishes loading', async () => {
    renderWithContexts(<HostMetrics />);
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );

    expect(HostMetricsAPI.read).toHaveBeenCalled();
    expect(screen.getByText('Host name')).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'Host name' })).toHaveLength(1);
  });

  test('soft deletes the ticked rows and says so when that fails', async () => {
    vi.mocked(HostMetricsAPI.destroy).mockRejectedValue(new Error('nope'));
    const { user } = renderWithContexts(<HostMetrics />);
    const row = (await screen.findByText('Host name')).closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Soft Delete' }));
    const dialog = await screen.findByRole('dialog', {
      name: /Soft Delete Host Metrics\?/,
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirm Soft Delete' })
    );

    await waitFor(() => expect(HostMetricsAPI.destroy).toHaveBeenCalledWith(1));
    expect(
      await screen.findByText('Failed to soft delete one or more host metrics.')
    ).toBeInTheDocument();
  });

  test('offers no soft delete to a system auditor', async () => {
    renderWithContexts(<HostMetrics />, {
      context: { config: { me: { is_system_auditor: true } } },
    });
    await screen.findByText('Host name');

    expect(
      screen.queryByRole('button', { name: 'Soft Delete' })
    ).not.toBeInTheDocument();
    // Nor anything to select for it: a ticked row with nothing to do with it
    // reads as a control that forgot its button.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
