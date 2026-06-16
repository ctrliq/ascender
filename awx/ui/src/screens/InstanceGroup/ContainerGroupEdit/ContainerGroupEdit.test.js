import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { InstanceGroupsAPI, CredentialsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ContainerGroupEdit from './ContainerGroupEdit';

jest.mock('../../../api');

// Prefixed `mock` so the jest.mock factory below may reference it.
const mockUpdatedInstanceGroup = {
  name: 'Bar',
  credential: { id: 12, name: 'CGX' },
};

// Mock the shared form so the test drives ContainerGroupEdit's own submit/cancel
// handlers directly. The form itself is covered by ContainerGroupForm.test.js.
jest.mock('../shared/ContainerGroupForm', () => ({ onSubmit, onCancel, submitError }) => (
  <div>
    {submitError && <div>FormSubmitError</div>}
    <button
      type="button"
      onClick={() => onSubmit({ ...mockUpdatedInstanceGroup, override: false })}
    >
      mock submit
    </button>
    <button type="button" aria-label="Cancel" onClick={onCancel}>
      Cancel
    </button>
  </div>
));

const instanceGroup = {
  id: 123,
  type: 'instance_group',
  url: '/api/v2/instance_groups/123/',
  related: {
    named_url: '/api/v2/instance_groups/Foo/',
    jobs: '/api/v2/instance_groups/123/jobs/',
    instances: '/api/v2/instance_groups/123/instances/',
    credential: '/api/v2/credentials/71/',
  },
  name: 'Foo',
  created: '2020-09-02T17:20:01.214170Z',
  modified: '2020-09-02T17:20:01.214236Z',
  capacity: 0,
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
  max_concurrent_jobs: 0,
  max_forks: 0,
  pod_spec_override: '',
  summary_fields: {
    credential: {
      id: 71,
      name: 'CG',
      description: 'a',
      kind: 'kubernetes_bearer_token',
      cloud: false,
      kubernetes: true,
      credential_type_id: 17,
    },
    user_capabilities: {
      edit: true,
      delete: true,
    },
  },
};

const initialPodSpec = {
  default: {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      namespace: 'default',
    },
    spec: {
      containers: [
        {
          image: 'ansible/ansible-runner',
          tty: true,
          stdin: true,
          imagePullPolicy: 'Always',
          args: ['sleep', 'infinity'],
        },
      ],
    },
  },
};

describe('<ContainerGroupEdit/>', () => {
  let history;

  beforeEach(() => {
    history = createMemoryHistory({ initialEntries: ['/instance_groups'] });
    InstanceGroupsAPI.update.mockResolvedValue({ data: {} });
    InstanceGroupsAPI.readInstanceGroupOptions.mockResolvedValue({
      data: {
        actions: { PUT: { pod_spec_override: { default: initialPodSpec } } },
      },
    });
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: [
          {
            id: 71,
            name: 'Test',
          },
        ],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('called InstanceGroupsAPI.readInstanceGroupOptions', async () => {
    renderWithContexts(<ContainerGroupEdit instanceGroup={instanceGroup} />, {
      context: { router: { history } },
    });
    await waitFor(() =>
      expect(InstanceGroupsAPI.readInstanceGroupOptions).toHaveBeenCalledWith(
        123
      )
    );
  });

  test('handleCancel returns the user to container group detail', async () => {
    const { user } = renderWithContexts(
      <ContainerGroupEdit instanceGroup={instanceGroup} />,
      { context: { router: { history } } }
    );
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual(
      '/instance_groups/container_group/123/details'
    );
  });

  test('handleSubmit should call the api and redirect to details page', async () => {
    const { user } = renderWithContexts(
      <ContainerGroupEdit instanceGroup={instanceGroup} />,
      { context: { router: { history } } }
    );
    await user.click(await screen.findByRole('button', { name: 'mock submit' }));
    await waitFor(() =>
      expect(InstanceGroupsAPI.update).toHaveBeenCalledWith(123, {
        ...mockUpdatedInstanceGroup,
        credential: 12,
        pod_spec_override: null,
        max_concurrent_jobs: 0,
        max_forks: 0,
        is_container_group: true,
      })
    );
    expect(history.location.pathname).toEqual(
      '/instance_groups/container_group/123/details'
    );
  });
});
