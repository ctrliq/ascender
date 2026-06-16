import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import {
  InstanceGroupsAPI,
  OrganizationsAPI,
  InventoriesAPI,
  UnifiedJobTemplatesAPI,
} from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceGroupList from './InstanceGroupList';

jest.mock('../../../api');

const instanceGroups = {
  data: {
    results: [
      {
        id: 1,
        name: 'Foo',
        type: 'instance_group',
        url: '/api/v2/instance_groups/1',
        consumed_capacity: 10,
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
      {
        id: 2,
        name: 'controlplan',
        type: 'instance_group',
        url: '/api/v2/instance_groups/2',
        consumed_capacity: 42,
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
      {
        id: 3,
        name: 'default',
        type: 'instance_group',
        url: '/api/v2/instance_groups/2',
        consumed_capacity: 42,
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
      {
        id: 4,
        name: 'Bar',
        type: 'instance_group',
        url: '/api/v2/instance_groups/3',
        consumed_capacity: 42,
        summary_fields: { user_capabilities: { edit: true, delete: false } },
      },
    ],
    count: 4,
  },
};

const options = { data: { actions: { POST: true } } };

describe('<InstanceGroupList />', () => {
  beforeEach(() => {
    OrganizationsAPI.read.mockResolvedValue({ data: { count: 0 } });
    InventoriesAPI.read.mockResolvedValue({ data: { count: 0 } });
    UnifiedJobTemplatesAPI.read.mockResolvedValue({ data: { count: 0 } });
    InstanceGroupsAPI.read.mockResolvedValue(instanceGroups);
    InstanceGroupsAPI.readOptions.mockResolvedValue(options);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should have data fetched and render all rows', async () => {
    renderWithContexts(<InstanceGroupList />);
    await screen.findByRole('link', { name: 'Foo' });

    expect(InstanceGroupsAPI.read).toHaveBeenCalled();
    expect(InstanceGroupsAPI.readOptions).toHaveBeenCalled();
    expect(
      screen.getAllByRole('link', {
        name: /^(Foo|controlplan|default|Bar)$/,
      })
    ).toHaveLength(4);
  });

  test('should delete item successfully', async () => {
    InstanceGroupsAPI.destroy.mockResolvedValue({});
    const { user } = renderWithContexts(<InstanceGroupList />);
    await screen.findByRole('link', { name: 'Foo' });

    const row = screen.getByRole('link', { name: 'Foo' }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(InstanceGroupsAPI.destroy).toHaveBeenCalledWith(
        instanceGroups.data.results[0].id
      )
    );
  });

  test('delete button is disabled when a protected (non-deletable) group is selected', async () => {
    const { user } = renderWithContexts(<InstanceGroupList />);
    await screen.findByRole('link', { name: 'Foo' });

    // Select all rows; "Bar" has delete=false, which disables the toolbar Delete.
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('should show content error', async () => {
    InstanceGroupsAPI.read.mockRejectedValue(new Error());
    renderWithContexts(<InstanceGroupList />);

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should render deletion error modal', async () => {
    InstanceGroupsAPI.destroy.mockRejectedValue(new Error());
    const { user } = renderWithContexts(<InstanceGroupList />);
    await screen.findByRole('link', { name: 'Foo' });

    const row = screen.getByRole('link', { name: 'Foo' }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(
      await screen.findByText(
        'Failed to delete one or more instance groups.'
      )
    ).toBeInTheDocument();
  });

  test('should not render add button', async () => {
    InstanceGroupsAPI.readOptions.mockResolvedValue({
      data: { actions: { POST: false } },
    });
    renderWithContexts(<InstanceGroupList />);
    await screen.findByRole('link', { name: 'Foo' });

    expect(
      screen.queryByRole('button', { name: /Add/ })
    ).not.toBeInTheDocument();
  });
});
