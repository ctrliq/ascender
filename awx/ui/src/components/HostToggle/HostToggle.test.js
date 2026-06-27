import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { HostsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import HostToggle from './HostToggle';

jest.mock('../../api');

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
};

// The PF Switch renders a hidden checkbox input with the aria-label
const getToggle = () => screen.getByRole('switch', { name: 'Toggle host' });

describe('<HostToggle>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should toggle off', async () => {
    const onToggle = jest.fn();
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
  });

  test('should toggle on', async () => {
    const onToggle = jest.fn();
    const { user } = renderWithContexts(
      <HostToggle
        host={{
          ...mockHost,
          enabled: false,
        }}
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
    HostsAPI.update.mockImplementation(() => {
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
