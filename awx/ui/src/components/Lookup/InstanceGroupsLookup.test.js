import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { InstanceGroupsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import InstanceGroupsLookup from './InstanceGroupsLookup';

jest.mock('../../api');

const mockedInstanceGroups = {
  count: 1,
  results: [
    {
      id: 2,
      name: 'Foo',
      image: 'quay.io/ansible/awx-ee',
      pull: 'missing',
    },
  ],
};

const instanceGroups = [
  {
    id: 1,
    type: 'instance_group',
    url: '/api/v2/instance_groups/1/',
    related: {
      jobs: '/api/v2/instance_groups/1/jobs/',
      instances: '/api/v2/instance_groups/1/instances/',
    },
    name: 'controlplane',
    created: '2022-09-13T15:44:54.870579Z',
    modified: '2022-09-13T15:44:54.886047Z',
    capacity: 59,
    consumed_capacity: 0,
    percent_capacity_remaining: 100.0,
    jobs_running: 0,
    jobs_total: 40,
    instances: 1,
    is_container_group: false,
    credential: null,
    policy_instance_percentage: 100,
    policy_instance_minimum: 0,
    policy_instance_list: [],
    pod_spec_override: '',
    summary_fields: {
      user_capabilities: {
        edit: true,
        delete: false,
      },
    },
  },
];

describe('InstanceGroupsLookup', () => {
  beforeEach(() => {
    InstanceGroupsAPI.read.mockResolvedValue({
      data: mockedInstanceGroups,
    });
    InstanceGroupsAPI.readOptions.mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render successfully', async () => {
    renderWithContexts(
      <Formik>
        <InstanceGroupsLookup value={instanceGroups} onChange={() => {}} />
      </Formik>
    );
    await waitFor(() =>
      expect(InstanceGroupsAPI.read).toHaveBeenCalledTimes(1)
    );
    expect(await screen.findByText('Instance Groups')).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Prompt on launch' })
    ).not.toBeInTheDocument();
  });

  test('should render prompt on launch checkbox when necessary', async () => {
    renderWithContexts(
      <Formik>
        <InstanceGroupsLookup
          value={instanceGroups}
          onChange={() => {}}
          isPromptableField
          promptId="ig-prompt"
          promptName="ask_instance_groups_on_launch"
        />
      </Formik>
    );
    expect(
      await screen.findByRole('checkbox', { name: 'Prompt on launch' })
    ).toBeInTheDocument();
  });
});
