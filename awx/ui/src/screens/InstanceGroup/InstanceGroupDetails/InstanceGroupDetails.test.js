import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import {
  InstanceGroupsAPI,
  OrganizationsAPI,
  InventoriesAPI,
  UnifiedJobTemplatesAPI,
} from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';

import InstanceGroupDetails from './InstanceGroupDetails';

jest.mock('../../../api');

// Build fresh objects per test so capability mutations don't leak between tests.
function buildInstanceGroup(overrides = {}) {
  return {
    id: 1,
    name: 'Foo',
    type: 'instance_group',
    url: '/api/v2/instance_groups/1/',
    capacity: 10,
    policy_instance_minimum: 10,
    policy_instance_percentage: 50,
    percent_capacity_remaining: 60,
    max_concurrent_jobs: 0,
    max_forks: 0,
    is_container_group: false,
    created: '2020-07-21T18:41:02.818081Z',
    modified: '2020-07-24T20:32:03.121079Z',
    summary_fields: {
      user_capabilities: {
        edit: true,
        delete: true,
      },
    },
    ...overrides,
  };
}

describe('<InstanceGroupDetails/>', () => {
  beforeEach(() => {
    // The DeleteButton fetches related-resource counts before confirming.
    OrganizationsAPI.read.mockResolvedValue({ data: { count: 0 } });
    InventoriesAPI.read.mockResolvedValue({ data: { count: 0 } });
    UnifiedJobTemplatesAPI.read.mockResolvedValue({ data: { count: 0 } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render details properly', () => {
    const instanceGroup = buildInstanceGroup();
    renderWithContexts(<InstanceGroupDetails instanceGroup={instanceGroup} />);

    assertDetail('Name', 'Foo');
    assertDetail('Type', 'Instance group');
    assertDetail('Policy instance minimum', '10');
    assertDetail('Policy instance percentage', '50 %');
    assertDetail(
      'Used capacity',
      `${100 - instanceGroup.percent_capacity_remaining} %`
    );
  });

  test('expected api call is made for delete', async () => {
    const instanceGroup = buildInstanceGroup();
    const history = createMemoryHistory({
      initialEntries: ['/instance_groups/1/details'],
    });
    InstanceGroupsAPI.destroy.mockResolvedValue({});
    const { user } = renderWithContexts(
      <InstanceGroupDetails instanceGroup={instanceGroup} />,
      { context: { router: { history } } }
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    await waitFor(() =>
      expect(InstanceGroupsAPI.destroy).toHaveBeenCalledTimes(1)
    );
    expect(history.location.pathname).toBe('/instance_groups');
  });

  test('should not render delete button when delete capability is false', () => {
    const instanceGroup = buildInstanceGroup({
      summary_fields: { user_capabilities: { edit: true, delete: false } },
    });
    renderWithContexts(<InstanceGroupDetails instanceGroup={instanceGroup} />);

    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  test('should not render edit button when edit capability is false', () => {
    const instanceGroup = buildInstanceGroup({
      summary_fields: { user_capabilities: { edit: false, delete: true } },
    });
    renderWithContexts(<InstanceGroupDetails instanceGroup={instanceGroup} />);

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
