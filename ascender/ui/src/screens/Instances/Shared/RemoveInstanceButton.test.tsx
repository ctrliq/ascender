import type { Instance } from 'types/api';
import React from 'react';
import { within, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstanceGroupsAPI } from 'api';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import RemoveInstanceButton from './RemoveInstanceButton';
import { messages as englishMessages } from '../../../locales/en/messages';

vi.mock('api');

const instances = [
  {
    id: 1,
    type: 'instance',
    url: '/api/v2/instances/1/',
    capacity_adjustment: '0.40',
    version: '13.0.0',
    capacity: 10,
    consumed_capacity: 0,
    percent_capacity_remaining: 60.0,
    jobs_running: 0,
    jobs_total: 68,
    cpu: 6,
    node_type: 'execution',
    node_state: 'ready',
    memory: 2087469056,
    cpu_capacity: 24,
    mem_capacity: 1,
    enabled: true,
    managed_by_policy: true,
  },
  {
    id: 2,
    type: 'instance',
    url: '/api/v2/instances/2/',
    capacity_adjustment: '0.40',
    version: '13.0.0',
    capacity: 10,
    consumed_capacity: 0,
    percent_capacity_remaining: 60.0,
    jobs_running: 0,
    jobs_total: 68,
    cpu: 6,
    node_type: 'control',
    node_state: 'ready',
    memory: 2087469056,
    cpu_capacity: 24,
    mem_capacity: 1,
    enabled: true,
    managed_by_policy: false,
  },
] as unknown as Instance[];
describe('<RemoveInstanceButtton />', () => {
  beforeAll(() => {
    i18n.load({ en: englishMessages });
    i18n.activate('en');
  });

  test('Should open modal and deprovision node', async () => {
    vi.mocked(InstanceGroupsAPI.read).mockResolvedValue({
      data: { results: [{ id: 1 }], count: 1 },
    } as unknown as ResponseOf<typeof InstanceGroupsAPI.read>);
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <RemoveInstanceButton
          isK8s
          itemsToRemove={instances.slice(0, 1)}
          onRemove={onRemove}
        />
      </I18nProvider>
    );

    const button = screen.getByRole('button');
    await user.click(button);
    await waitFor(() => screen.getByRole('dialog'));
    const modal = screen.getByRole('dialog');
    const removeButton = within(modal).getByRole('button', {
      name: 'Confirm remove',
    });

    await user.click(removeButton);

    await waitFor(() => expect(onRemove).toHaveBeenCalled());
  });

  test('Should be disabled', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider i18n={i18n}>
        <RemoveInstanceButton
          isK8s
          itemsToRemove={instances.slice(1, 2)}
          onRemove={vi.fn()}
        />
      </I18nProvider>
    );

    const button = screen.getByRole('button');
    await user.hover(button);
    await waitFor(() =>
      screen.getByText('You do not have permission to remove instances:')
    );
  });

  test('Should handle error when fetching warning message details.', async () => {
    vi.mocked(InstanceGroupsAPI.read).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'get',
            url: '/api/v2/instance_groups',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <RemoveInstanceButton
          isK8s
          itemsToRemove={instances.slice(0, 1)}
          onRemove={onRemove}
        />
      </I18nProvider>
    );

    const button = screen.getByRole('button');
    await user.click(button);
    await waitFor(() => screen.getByRole('dialog'));
    screen.getByText('Error!');
  });
});
