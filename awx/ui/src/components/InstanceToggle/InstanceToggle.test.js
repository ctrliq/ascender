import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { InstancesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import InstanceToggle from './InstanceToggle';

jest.mock('../../api');

const mockInstance = {
  id: 1,
  type: 'instance',
  url: '/api/v2/instances/1/',
  related: {
    jobs: '/api/v2/instances/1/jobs/',
    instance_groups: '/api/v2/instances/1/instance_groups/',
  },
  uuid: '00000000-0000-0000-0000-000000000000',
  hostname: 'awx',
  created: '2020-07-14T19:03:49.000054Z',
  modified: '2020-08-05T19:17:18.080033Z',
  capacity_adjustment: '0.40',
  version: '13.0.0',
  capacity: 10,
  consumed_capacity: 0,
  percent_capacity_remaining: 100.0,
  jobs_running: 0,
  jobs_total: 67,
  cpu: 6,
  memory: 2087469056,
  cpu_capacity: 24,
  mem_capacity: 1,
  enabled: true,
  managed_by_policy: true,
};

// The PF Switch renders a hidden checkbox input with the aria-label
const getToggle = () => screen.getByRole('switch', { name: 'Toggle instance' });

describe('<InstanceToggle>', () => {
  const onToggle = jest.fn();
  const fetchInstances = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should show toggle off', async () => {
    const { user } = renderWithContexts(
      <InstanceToggle
        instance={mockInstance}
        fetchInstances={fetchInstances}
        onToggle={onToggle}
      />
    );
    expect(getToggle()).toBeChecked();

    await user.click(getToggle());
    expect(InstancesAPI.update).toHaveBeenCalledWith(1, {
      enabled: false,
    });
    await waitFor(() => expect(getToggle()).not.toBeChecked());
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(fetchInstances).toHaveBeenCalledTimes(1);
  });

  test('should show toggle on', async () => {
    const { user } = renderWithContexts(
      <InstanceToggle
        instance={{
          ...mockInstance,
          enabled: false,
        }}
        onToggle={onToggle}
        fetchInstances={fetchInstances}
      />
    );
    expect(getToggle()).not.toBeChecked();

    await user.click(getToggle());
    expect(InstancesAPI.update).toHaveBeenCalledWith(1, {
      enabled: true,
    });
    await waitFor(() => expect(getToggle()).toBeChecked());
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(fetchInstances).toHaveBeenCalledTimes(1);
  });

  test('should show error modal', async () => {
    InstancesAPI.update.mockImplementation(() => {
      throw new Error('nope');
    });
    const { user } = renderWithContexts(
      <InstanceToggle instance={mockInstance} fetchInstances={fetchInstances} />
    );
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
