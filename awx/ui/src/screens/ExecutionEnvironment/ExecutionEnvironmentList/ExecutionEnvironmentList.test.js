import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import {
  ExecutionEnvironmentsAPI,
  InventorySourcesAPI,
  WorkflowJobTemplateNodesAPI,
  OrganizationsAPI,
  ProjectsAPI,
  UnifiedJobTemplatesAPI,
} from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentList from './ExecutionEnvironmentList';

jest.mock('../../../api/models/ExecutionEnvironments');
jest.mock('../../../api/models/UnifiedJobTemplates');
jest.mock('../../../api/models/Projects');
jest.mock('../../../api/models/Organizations');
jest.mock('../../../api/models/InventorySources');
jest.mock('../../../api/models/WorkflowJobTemplateNodes');

const executionEnvironments = {
  data: {
    results: [
      {
        name: 'Foo',
        id: 1,
        image: 'https://registry.com/r/image/manifest',
        organization: null,
        credential: null,
        url: '/api/v2/execution_environments/1/',
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
      {
        name: 'Bar',
        id: 2,
        image: 'https://registry.com/r/image2/manifest',
        organization: null,
        credential: null,
        url: '/api/v2/execution_environments/2/',
        summary_fields: { user_capabilities: { edit: false, delete: true } },
      },
    ],
    count: 2,
  },
};

const options = { data: { actions: { POST: true } } };

describe('<ExecutionEnvironmentList/>', () => {
  beforeEach(() => {
    ExecutionEnvironmentsAPI.read.mockResolvedValue(executionEnvironments);
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue(options);
    InventorySourcesAPI.read.mockResolvedValue({
      data: { results: [{ id: 10000000 }] },
    });
    WorkflowJobTemplateNodesAPI.read.mockResolvedValue({ data: { count: 0 } });
    OrganizationsAPI.read.mockResolvedValue({ data: { count: 0 } });
    UnifiedJobTemplatesAPI.read.mockResolvedValue({ data: { count: 0 } });
    ProjectsAPI.read.mockResolvedValue({ data: { count: 0 } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch data and render 2 rows', async () => {
    renderWithContexts(<ExecutionEnvironmentList />);
    expect(await screen.findByText('Foo')).toBeInTheDocument();
    expect(screen.getByText('Bar')).toBeInTheDocument();
    expect(ExecutionEnvironmentsAPI.read).toHaveBeenCalled();
    expect(ExecutionEnvironmentsAPI.readOptions).toHaveBeenCalled();
  });

  test('should delete selected items', async () => {
    const { user } = renderWithContexts(<ExecutionEnvironmentList />);
    await screen.findByText('Foo');

    await user.click(screen.getByRole('checkbox', { name: 'Select row 0' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('confirm delete'));

    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.destroy).toHaveBeenCalledTimes(2)
    );
  });

  test('should render a deletion error modal', async () => {
    ExecutionEnvironmentsAPI.destroy.mockRejectedValue(new Error('nope'));
    const { user } = renderWithContexts(<ExecutionEnvironmentList />);
    await screen.findByText('Foo');

    await user.click(screen.getByRole('checkbox', { name: 'Select row 0' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('confirm delete'));

    expect(await screen.findByLabelText('Deletion error')).toBeInTheDocument();
  });

  test('should show a content error when the fetch fails', async () => {
    ExecutionEnvironmentsAPI.read.mockRejectedValue(new Error('nope'));
    renderWithContexts(<ExecutionEnvironmentList />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should not render the add button when POST is not allowed', async () => {
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { POST: false } },
    });
    renderWithContexts(<ExecutionEnvironmentList />);
    await screen.findByText('Foo');
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });
});
