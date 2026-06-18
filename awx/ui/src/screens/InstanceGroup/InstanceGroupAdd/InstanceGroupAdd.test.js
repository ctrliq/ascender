import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { InstanceGroupsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InstanceGroupAdd from './InstanceGroupAdd';

jest.mock('../../../api');

// Prefixed `mock` so the jest.mock factory below may reference it (jest allows
// out-of-scope refs only when the name begins with "mock").
const mockInstanceGroupData = {
  id: 42,
  type: 'instance_group',
  url: '/api/v2/instance_groups/42/',
  related: {
    jobs: '/api/v2/instance_groups/42/jobs/',
    instances: '/api/v2/instance_groups/7/instances/',
  },
  name: 'Bar',
  created: '2020-07-21T18:41:02.818081Z',
  modified: '2020-07-24T20:32:03.121079Z',
  capacity: 24,
  committed_capacity: 0,
  consumed_capacity: 0,
  percent_capacity_remaining: 100.0,
  jobs_running: 0,
  jobs_total: 0,
  instances: 1,
  controller: null,
  is_container_group: false,
  credential: null,
  policy_instance_percentage: 46,
  policy_instance_minimum: 12,
  policy_instance_list: [],
  pod_spec_override: '',
  summary_fields: {
    user_capabilities: {
      edit: true,
      delete: true,
    },
  },
};

// Mock the shared form so the test drives InstanceGroupAdd's own submit/cancel
// handlers directly. The form itself is covered by InstanceGroupForm.test.js.
jest.mock('../shared/InstanceGroupForm', () => ({ onSubmit, onCancel, submitError }) => (
  <div>
    {submitError && <div>FormSubmitError</div>}
    <button type="button" onClick={() => onSubmit(mockInstanceGroupData)}>
      mock submit
    </button>
    <button type="button" aria-label="Cancel" onClick={onCancel}>
      Cancel
    </button>
  </div>
));

describe('<InstanceGroupAdd/>', () => {
  let history;

  beforeEach(() => {
    history = createMemoryHistory({
      initialEntries: ['/instance_groups'],
    });
    InstanceGroupsAPI.create.mockResolvedValue({
      data: {
        id: 42,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('handleSubmit should call the api and redirect to details page', async () => {
    const { user } = renderWithContexts(<InstanceGroupAdd />, {
      context: { router: { history } },
    });
    await user.click(screen.getByRole('button', { name: 'mock submit' }));
    await waitFor(() =>
      expect(InstanceGroupsAPI.create).toHaveBeenCalledWith(
        mockInstanceGroupData
      )
    );
    expect(history.location.pathname).toBe('/instance_groups/42/details');
  });

  test('handleCancel should return the user back to the instance group list', async () => {
    const { user } = renderWithContexts(<InstanceGroupAdd />, {
      context: { router: { history } },
    });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/instance_groups');
  });

  test('failed form submission should show an error message', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    InstanceGroupsAPI.create.mockImplementationOnce(() => Promise.reject(error));
    const { user } = renderWithContexts(<InstanceGroupAdd />, {
      context: { router: { history } },
    });
    await user.click(screen.getByRole('button', { name: 'mock submit' }));
    expect(await screen.findByText('FormSubmitError')).toBeInTheDocument();
  });
});
