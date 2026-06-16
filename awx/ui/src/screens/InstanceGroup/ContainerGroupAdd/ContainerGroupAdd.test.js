import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { InstanceGroupsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ContainerGroupAdd from './ContainerGroupAdd';

jest.mock('../../../api');

// Prefixed `mock` so the jest.mock factory below may reference it.
const mockInstanceGroupCreateData = {
  name: 'Fuz',
  credential: { id: 71, name: 'CG' },
  max_concurrent_jobs: 0,
  max_forks: 0,
  pod_spec_override:
    'apiVersion: v1\nkind: Pod\nmetadata:\n  namespace: default\nspec:\n  containers:\n    - image: ansible/ansible-runner\n      tty: true\n      stdin: true\n      imagePullPolicy: Always\n      args:\n        - sleep\n        - infinity\n        - test',
};

// Mock the shared form so the test drives ContainerGroupAdd's own submit/cancel
// handlers directly. The form itself is covered by ContainerGroupForm.test.js.
jest.mock('../shared/ContainerGroupForm', () => ({ onSubmit, onCancel, submitError }) => (
  <div>
    {submitError && <div>FormSubmitError</div>}
    <button
      type="button"
      onClick={() => onSubmit({ ...mockInstanceGroupCreateData, override: true })}
    >
      mock submit
    </button>
    <button type="button" aria-label="Cancel" onClick={onCancel}>
      Cancel
    </button>
  </div>
));

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
    is_container_group: true,
  },
};

describe('<ContainerGroupAdd/>', () => {
  let history;

  beforeEach(() => {
    history = createMemoryHistory({
      initialEntries: ['/instance_groups'],
    });

    InstanceGroupsAPI.create.mockResolvedValue({
      data: {
        id: 123,
      },
    });

    InstanceGroupsAPI.readOptions.mockResolvedValue({
      data: {
        actions: { POST: { pod_spec_override: { default: initialPodSpec } } },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('handleSubmit should call the api and redirect to details page', async () => {
    const { user } = renderWithContexts(<ContainerGroupAdd />, {
      context: { router: { history } },
    });
    await user.click(await screen.findByRole('button', { name: 'mock submit' }));
    await waitFor(() =>
      expect(InstanceGroupsAPI.create).toHaveBeenCalledWith({
        ...mockInstanceGroupCreateData,
        credential: 71,
        is_container_group: true,
      })
    );
    expect(screen.queryByText('FormSubmitError')).not.toBeInTheDocument();
    expect(history.location.pathname).toBe(
      '/instance_groups/container_group/123/details'
    );
  });

  test('handleCancel should return the user back to the instance group list', async () => {
    const { user } = renderWithContexts(<ContainerGroupAdd />, {
      context: { router: { history } },
    });
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/instance_groups');
  });
});
