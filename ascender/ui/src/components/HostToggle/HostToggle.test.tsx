import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HostsAPI } from 'api';
import type { Host } from 'types/api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import HostToggle from './HostToggle';

vi.mock('../../api');

const mockHost = {
  id: 1,
  name: 'Host 1',
  url: '/api/v2/hosts/1',
  inventory: 1,
  enabled: true,
  summary_fields: {
    inventory: {
      id: 1,
      name: 'inv 1',
    },
    user_capabilities: {
      delete: true,
      edit: true,
    },
    recent_jobs: [],
  },
} as unknown as Host;

// The PF Switch renders a hidden checkbox input with the aria-label
const getToggle = () => screen.getByRole('switch', { name: 'Toggle Host' });

describe('<HostToggle>', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should toggle off', async () => {
    const onToggle = vi.fn();
    const { user } = renderWithContexts(
      <HostToggle host={mockHost} onToggle={onToggle} />
    );
    expect(getToggle()).toBeChecked();

    await user.click(getToggle());
    expect(HostsAPI.update).toHaveBeenCalledWith(1, {
      enabled: false,
    });
    await waitFor(() => expect(getToggle()).not.toBeChecked());
    expect(onToggle).toHaveBeenCalledWith(false);
    // PF6 has no off label, so the label itself has to follow the state.
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  test('should toggle on', async () => {
    const onToggle = vi.fn();
    const { user } = renderWithContexts(
      <HostToggle
        host={
          {
            ...mockHost,
            enabled: false,
          } as unknown as Host
        }
        onToggle={onToggle}
      />
    );
    expect(getToggle()).not.toBeChecked();

    await user.click(getToggle());
    expect(HostsAPI.update).toHaveBeenCalledWith(1, {
      enabled: true,
    });
    await waitFor(() => expect(getToggle()).toBeChecked());
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(screen.getByText('On')).toBeInTheDocument();
  });

  test('should follow the host it is handed when that changes', async () => {
    // A list returning from another screen paints its cached rows and then
    // the fresh ones into the same row, so the switch has to follow the new
    // host rather than keep what it was mounted with.
    const { rerender } = renderWithContexts(<HostToggle host={mockHost} />);
    expect(getToggle()).toBeChecked();

    rerender(
      <HostToggle host={{ ...mockHost, enabled: false } as unknown as Host} />
    );

    await waitFor(() => expect(getToggle()).not.toBeChecked());
  });

  test('should write the change into the cached host lists', async () => {
    // Otherwise the list navigated back to would paint the old state until
    // its own read came back.
    const queryClient = new QueryClient();
    const other = { ...mockHost, id: 2 };
    queryClient.setQueryData(['host-list', ''], {
      hosts: [mockHost, other],
      count: 2,
    });
    queryClient.setQueryData(['inventory-host-list', 1, ''], {
      hosts: [mockHost],
      hostCount: 1,
    });
    queryClient.setQueryData(['team-list', ''], { results: [{ id: 1 }] });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider i18n={i18n}>
          <HostToggle host={mockHost} />
        </I18nProvider>
      </QueryClientProvider>
    );

    await user.click(getToggle());
    await waitFor(() => expect(getToggle()).not.toBeChecked());

    interface HostPage {
      hosts: Host[];
    }
    const hostList = queryClient.getQueryData<HostPage>(['host-list', '']);
    expect(hostList?.hosts.map((h) => h.enabled)).toEqual([false, true]);
    expect(
      queryClient.getQueryData<HostPage>(['inventory-host-list', 1, ''])
        ?.hosts[0]?.enabled
    ).toBe(false);
    expect(queryClient.getQueryData(['team-list', ''])).toEqual({
      results: [{ id: 1 }],
    });
  });

  test('should be enabled', async () => {
    renderWithContexts(<HostToggle host={mockHost} />);
    expect(getToggle()).toBeEnabled();
  });

  test('should be disabled', async () => {
    renderWithContexts(<HostToggle isDisabled host={mockHost} />);
    expect(getToggle()).toBeDisabled();
  });

  test('should show error modal', async () => {
    vi.mocked(HostsAPI.update).mockImplementation(() => {
      throw new Error('nope');
    });
    const { user } = renderWithContexts(<HostToggle host={mockHost} />);
    expect(getToggle()).toBeChecked();

    await user.click(getToggle());
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });
});
