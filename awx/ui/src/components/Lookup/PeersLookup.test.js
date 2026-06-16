import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { InstancesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import PeersLookup from './PeersLookup';

jest.mock('../../api');

const mockedInstances = {
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

const instances = [
  {
    id: 1,
    hostname: 'awx_1',
    type: 'instance',
    url: '/api/v2/instances/1/',
    related: {
      named_url: '/api/v2/instances/awx_1/',
      jobs: '/api/v2/instances/1/jobs/',
      instance_groups: '/api/v2/instances/1/instance_groups/',
      peers: '/api/v2/instances/1/peers/',
    },
    summary_fields: {
      user_capabilities: {
        edit: false,
      },
      links: [],
    },
    uuid: '00000000-0000-0000-0000-000000000000',
    created: '2023-04-26T22:06:46.766198Z',
    modified: '2023-04-26T22:06:46.766217Z',
    last_seen: '2023-04-26T23:12:02.857732Z',
    health_check_started: null,
    health_check_pending: false,
    last_health_check: '2023-04-26T23:01:13.941693Z',
    errors: 'Instance received normal shutdown signal',
    capacity_adjustment: '1.00',
    version: '0.1.dev33237+g1fdef52',
    capacity: 0,
    consumed_capacity: 0,
    percent_capacity_remaining: 0,
    jobs_running: 0,
    jobs_total: 0,
    cpu: '8.0',
    memory: 8011055104,
    cpu_capacity: 0,
    mem_capacity: 0,
    enabled: true,
    managed_by_policy: true,
    node_type: 'hybrid',
    node_state: 'installed',
    ip_address: null,
    listener_port: 27199,
    peers: [],
    peers_from_control_nodes: false,
  },
];

describe('PeersLookup', () => {
  beforeEach(() => {
    InstancesAPI.read.mockResolvedValue({
      data: mockedInstances,
    });
    InstancesAPI.readOptions.mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render successfully without instance_details (for new added instance)', async () => {
    renderWithContexts(
      <Formik>
        <PeersLookup value={instances} onChange={() => {}} />
      </Formik>
    );
    await waitFor(() => expect(InstancesAPI.read).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Prompt on launch' })
    ).not.toBeInTheDocument();
  });

  test('should render successfully with instance_details for edit instance', async () => {
    renderWithContexts(
      <Formik>
        <PeersLookup
          value={instances}
          instance_details={instances[0]}
          onChange={() => {}}
        />
      </Formik>
    );
    await waitFor(() => expect(InstancesAPI.read).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Prompt on launch' })
    ).not.toBeInTheDocument();
  });
});
