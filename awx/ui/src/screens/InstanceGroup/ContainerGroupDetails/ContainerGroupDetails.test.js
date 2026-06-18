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

import ContainerGroupDetails from './ContainerGroupDetails';

jest.mock('../../../api');

function buildInstanceGroup(overrides = {}) {
  const { summary_fields: summaryOverrides, ...rest } = overrides;
  return {
    id: 42,
    type: 'instance_group',
    url: '/api/v2/instance_groups/128/',
    related: {
      named_url: '/api/v2/instance_groups/A1/',
      jobs: '/api/v2/instance_groups/128/jobs/',
      instances: '/api/v2/instance_groups/128/instances/',
      credential: '/api/v2/credentials/71/',
    },
    name: 'Foo',
    created: '2020-09-03T18:26:47.113934Z',
    modified: '2020-09-03T19:34:23.244694Z',
    capacity: 0,
    max_concurrent_jobs: 0,
    max_forks: 0,
    committed_capacity: 0,
    consumed_capacity: 0,
    percent_capacity_remaining: 0.0,
    jobs_running: 0,
    jobs_total: 0,
    instances: 0,
    controller: null,
    is_container_group: true,
    credential: 71,
    policy_instance_percentage: 0,
    policy_instance_minimum: 0,
    policy_instance_list: [],
    pod_spec_override:
      'apiVersion: v1\nkind: Pod\nmetadata:\n  namespace: default\nspec:\n  containers:\n    - image: ansible/ansible-runner\n      tty: true\n      stdin: true\n      imagePullPolicy: Always\n      args:\n        - sleep\n        - infinity\n        - test',
    summary_fields: {
      credential: {
        id: 71,
        name: 'CG',
        description: 'Container Group',
        kind: 'kubernetes_bearer_token',
        cloud: false,
        kubernetes: true,
        credential_type_id: 17,
      },
      user_capabilities: {
        edit: true,
        delete: true,
      },
      ...summaryOverrides,
    },
    ...rest,
  };
}

describe('<ContainerGroupDetails/>', () => {
  beforeEach(() => {
    OrganizationsAPI.read.mockResolvedValue({ data: { count: 0 } });
    InventoriesAPI.read.mockResolvedValue({ data: { count: 0 } });
    UnifiedJobTemplatesAPI.read.mockResolvedValue({ data: { count: 0 } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render details properly', () => {
    renderWithContexts(
      <ContainerGroupDetails instanceGroup={buildInstanceGroup()} />
    );

    assertDetail('Name', 'Foo');
    assertDetail('Type', 'Container group');
    // The credential renders as a link to its detail page.
    expect(screen.getByRole('link', { name: 'CG' })).toHaveAttribute(
      'href',
      '/credentials/71'
    );
    // react-ace renders empty under jsdom, so assert the pod-spec label only.
    expect(screen.getByText('Pod spec override')).toBeInTheDocument();
  });

  test('expected api call is made for delete', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/instance_groups/container_group/42/details'],
    });
    InstanceGroupsAPI.destroy.mockResolvedValue({});
    const { user } = renderWithContexts(
      <ContainerGroupDetails instanceGroup={buildInstanceGroup()} />,
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
    renderWithContexts(
      <ContainerGroupDetails
        instanceGroup={buildInstanceGroup({
          summary_fields: { user_capabilities: { edit: true, delete: false } },
        })}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  test('should not render edit button when edit capability is false', () => {
    renderWithContexts(
      <ContainerGroupDetails
        instanceGroup={buildInstanceGroup({
          summary_fields: { user_capabilities: { edit: false, delete: true } },
        })}
      />
    );
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
