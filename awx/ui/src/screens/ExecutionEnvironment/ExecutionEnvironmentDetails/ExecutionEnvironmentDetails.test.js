import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { ExecutionEnvironmentsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentDetails from './ExecutionEnvironmentDetails';

jest.mock('../../../api');

// The DeleteButton fetches related-resource counts on click; return an empty
// request list so it skips that fetch (which hits several auto-mocked APIs)
// and opens the confirm modal directly.
jest.mock('util/getRelatedResourceDeleteDetails', () => ({
  relatedResourceDeleteRequests: () => ({ executionEnvironment: () => [] }),
  getRelatedResourceDeleteCounts: jest
    .fn()
    .mockResolvedValue({ results: {}, error: null }),
}));

const executionEnvironment = {
  id: 17,
  type: 'execution_environment',
  url: '/api/v2/execution_environments/17/',
  related: {
    created_by: '/api/v2/users/1/',
    modified_by: '/api/v2/users/1/',
    activity_stream: '/api/v2/execution_environments/17/activity_stream/',
    unified_job_templates:
      '/api/v2/execution_environments/17/unified_job_templates/',
    credential: '/api/v2/credentials/4/',
  },
  summary_fields: {
    user_capabilities: { edit: true, delete: true, copy: true },
    credential: { id: 4, name: 'Container Registry' },
    created_by: { id: 1, username: 'admin', first_name: '', last_name: '' },
    modified_by: { id: 1, username: 'admin', first_name: '', last_name: '' },
  },
  name: 'Default EE',
  created: '2020-09-17T20:14:15.408782Z',
  modified: '2020-09-17T20:14:15.408802Z',
  description: 'Foo',
  organization: null,
  image: 'https://localhost:90/12345/ma',
  managed: false,
  credential: 4,
};

describe('<ExecutionEnvironmentDetails/>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render details properly', async () => {
    renderWithContexts(
      <ExecutionEnvironmentDetails executionEnvironment={executionEnvironment} />
    );
    await waitFor(() => expect(screen.getByText('Image')).toBeInTheDocument());
    assertDetail('Image', executionEnvironment.image);
    assertDetail('Description', 'Foo');
    assertDetail('Organization', 'Globally Available');
    assertDetail('Registry credential', 'Container Registry');
    assertDetail('Managed', 'False');
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();
    expect(screen.getByLabelText('edit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('should render organization detail when set', async () => {
    renderWithContexts(
      <ExecutionEnvironmentDetails
        executionEnvironment={{
          ...executionEnvironment,
          organization: 1,
          summary_fields: {
            organization: { id: 1, name: 'Bar' },
            credential: { id: 4, name: 'Container Registry' },
          },
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('Image')).toBeInTheDocument());
    assertDetail('Organization', 'Bar');
    assertDetail('Registry credential', 'Container Registry');
  });

  test('expected api call is made for delete', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/execution_environments/42/details'],
    });
    const { user } = renderWithContexts(
      <ExecutionEnvironmentDetails
        executionEnvironment={executionEnvironment}
      />,
      { context: { router: { history } } }
    );
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('Confirm Delete'));
    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.destroy).toHaveBeenCalledTimes(1)
    );
    await waitFor(() =>
      expect(history.location.pathname).toBe('/execution_environments')
    );
  });

  test('should render action buttons for a managed ee', async () => {
    renderWithContexts(
      <ExecutionEnvironmentDetails
        executionEnvironment={{ ...executionEnvironment, managed: true }}
      />
    );
    await waitFor(() => expect(screen.getByText('Image')).toBeInTheDocument());
    assertDetail('Managed', 'True');
    expect(screen.getByLabelText('edit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('should hide the edit button without edit permission', async () => {
    renderWithContexts(
      <ExecutionEnvironmentDetails
        executionEnvironment={{
          ...executionEnvironment,
          summary_fields: { user_capabilities: { edit: false } },
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('Image')).toBeInTheDocument());
    expect(screen.queryByLabelText('edit')).not.toBeInTheDocument();
  });

  test('should hide the delete button without delete permission', async () => {
    renderWithContexts(
      <ExecutionEnvironmentDetails
        executionEnvironment={{
          ...executionEnvironment,
          summary_fields: { user_capabilities: { delete: false } },
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('Image')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });
});
