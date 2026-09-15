import type { ApiResponse } from 'api/Base';
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
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentList from './ExecutionEnvironmentList';

vi.mock('../../../api/models/ExecutionEnvironments');
vi.mock('../../../api/models/UnifiedJobTemplates');
vi.mock('../../../api/models/Projects');
vi.mock('../../../api/models/Organizations');
vi.mock('../../../api/models/InventorySources');
vi.mock('../../../api/models/WorkflowJobTemplateNodes');

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
    vi.mocked(ExecutionEnvironmentsAPI.read).mockResolvedValue(
      executionEnvironments as unknown as ApiResponse<unknown>
    );
    vi.mocked(ExecutionEnvironmentsAPI.readOptions).mockResolvedValue(
      options as unknown as ApiResponse<unknown>
    );
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue({
      data: { results: [{ id: 10000000 }] },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.read>);
    vi.mocked(WorkflowJobTemplateNodesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof WorkflowJobTemplateNodesAPI.read>);
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    vi.mocked(UnifiedJobTemplatesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof UnifiedJobTemplatesAPI.read>);
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof ProjectsAPI.read>);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(ExecutionEnvironmentsAPI.destroy).mockRejectedValue(
      new Error('nope')
    );
    const { user } = renderWithContexts(<ExecutionEnvironmentList />);
    await screen.findByText('Foo');

    await user.click(screen.getByRole('checkbox', { name: 'Select row 0' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('confirm delete'));

    expect(await screen.findByLabelText('Deletion error')).toBeInTheDocument();
  });

  test('should show a content error when the fetch fails', async () => {
    vi.mocked(ExecutionEnvironmentsAPI.read).mockRejectedValue(
      new Error('nope')
    );
    renderWithContexts(<ExecutionEnvironmentList />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should not render the add button when POST is not allowed', async () => {
    vi.mocked(ExecutionEnvironmentsAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: false } },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.readOptions>);
    renderWithContexts(<ExecutionEnvironmentList />);
    await screen.findByText('Foo');
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });
});
