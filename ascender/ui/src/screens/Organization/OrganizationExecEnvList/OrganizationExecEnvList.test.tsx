import type { Organization } from 'types/api';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import {
  ExecutionEnvironmentsAPI,
  InventorySourcesAPI,
  OrganizationsAPI,
  ProjectsAPI,
  UnifiedJobTemplatesAPI,
} from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import OrganizationExecEnvList from './OrganizationExecEnvList';

vi.mock('../../../api/');

const executionEnvironments = {
  data: {
    count: 3,
    results: [
      {
        id: 1,
        type: 'execution_environment',
        url: '/api/v2/execution_environments/1/',
        related: {
          organization: '/api/v2/organizations/1/',
        },
        organization: 1,
        image: 'https://localhost.com/image/disk',
        managed: false,
        credential: null,
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
      {
        id: 2,
        type: 'execution_environment',
        url: '/api/v2/execution_environments/2/',
        related: {
          organization: '/api/v2/organizations/1/',
        },
        organization: 1,
        image: 'test/image123',
        managed: false,
        credential: null,
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
      {
        id: 3,
        type: 'execution_environment',
        url: '/api/v2/execution_environments/3/',
        related: {
          organization: '/api/v2/organizations/1/',
        },
        organization: 1,
        image: 'test/test',
        managed: false,
        credential: null,
        summary_fields: { user_capabilities: { edit: true, delete: true } },
      },
    ],
  },
};

const mockOrganization = {
  id: 1,
  type: 'organization',
  name: 'Default',
} as unknown as Organization;

const options = { data: { actions: { POST: {}, GET: {} } } };

describe('<OrganizationExecEnvList/>', () => {
  beforeEach(() => {
    vi.mocked(OrganizationsAPI.readExecutionEnvironments).mockResolvedValue(
      executionEnvironments as unknown as ResponseOf<
        typeof OrganizationsAPI.readExecutionEnvironments
      >
    );
    vi.mocked(
      OrganizationsAPI.readExecutionEnvironmentsOptions
    ).mockResolvedValue(
      options as unknown as ResponseOf<
        typeof OrganizationsAPI.readExecutionEnvironmentsOptions
      >
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should have data fetched and render 3 rows', async () => {
    renderWithContexts(
      <OrganizationExecEnvList organization={mockOrganization} />
    );

    expect(
      await screen.findByText('https://localhost.com/image/disk')
    ).toBeInTheDocument();
    expect(screen.getByText('test/image123')).toBeInTheDocument();
    expect(screen.getByText('test/test')).toBeInTheDocument();
    expect(OrganizationsAPI.readExecutionEnvironments).toHaveBeenCalled();
    expect(
      OrganizationsAPI.readExecutionEnvironmentsOptions
    ).toHaveBeenCalled();
  });

  test('adds one in this organization, for somebody the api lets add one', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/organizations/1/execution_environments'],
    });
    const { user } = renderWithContexts(
      <OrganizationExecEnvList organization={mockOrganization} />,
      { context: { router: { history } } }
    );
    await screen.findByText('https://localhost.com/image/disk');

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(history.location.pathname).toBe('/execution_environments/add');
    expect(history.location.state).toEqual({
      organization: { id: 1, name: 'Default' },
    });
  });

  test('offers no Add to somebody the api does not let add one', async () => {
    vi.mocked(
      OrganizationsAPI.readExecutionEnvironmentsOptions
    ).mockResolvedValue({
      data: { actions: { GET: {} } },
    } as unknown as ResponseOf<
      typeof OrganizationsAPI.readExecutionEnvironmentsOptions
    >);
    renderWithContexts(
      <OrganizationExecEnvList organization={mockOrganization} />
    );
    await screen.findByText('https://localhost.com/image/disk');
    expect(
      screen.queryByRole('button', { name: 'Add' })
    ).not.toBeInTheDocument();
  });

  test('deletes the selected execution environments', async () => {
    const empty = { data: { count: 0, results: [] } };
    vi.mocked(UnifiedJobTemplatesAPI.read).mockResolvedValue(
      empty as unknown as ResponseOf<typeof UnifiedJobTemplatesAPI.read>
    );
    vi.mocked(ProjectsAPI.read).mockResolvedValue(
      empty as unknown as ResponseOf<typeof ProjectsAPI.read>
    );
    vi.mocked(OrganizationsAPI.read).mockResolvedValue(
      empty as unknown as ResponseOf<typeof OrganizationsAPI.read>
    );
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue(
      empty as unknown as ResponseOf<typeof InventorySourcesAPI.read>
    );
    vi.mocked(ExecutionEnvironmentsAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.destroy>
    );
    const { user } = renderWithContexts(
      <OrganizationExecEnvList organization={mockOrganization} />
    );
    const row = (await screen.findByText('test/image123')).closest('tr')!;

    await user.click(within(row).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.destroy).toHaveBeenCalledWith(2)
    );
    expect(ExecutionEnvironmentsAPI.destroy).toHaveBeenCalledTimes(1);
  });

  test('says so when a deletion fails', async () => {
    const empty = { data: { count: 0, results: [] } };
    vi.mocked(UnifiedJobTemplatesAPI.read).mockResolvedValue(
      empty as unknown as ResponseOf<typeof UnifiedJobTemplatesAPI.read>
    );
    vi.mocked(ProjectsAPI.read).mockResolvedValue(
      empty as unknown as ResponseOf<typeof ProjectsAPI.read>
    );
    vi.mocked(OrganizationsAPI.read).mockResolvedValue(
      empty as unknown as ResponseOf<typeof OrganizationsAPI.read>
    );
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue(
      empty as unknown as ResponseOf<typeof InventorySourcesAPI.read>
    );
    vi.mocked(ExecutionEnvironmentsAPI.destroy).mockRejectedValue(
      new Error('An error occurred')
    );
    const { user } = renderWithContexts(
      <OrganizationExecEnvList organization={mockOrganization} />
    );
    const row = (await screen.findByText('test/image123')).closest('tr')!;

    await user.click(within(row).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    expect(
      screen.getByText('Failed to delete one or more execution environments.')
    ).toBeInTheDocument();
  });

  test('refuses to delete one the viewer may not delete', async () => {
    vi.mocked(OrganizationsAPI.readExecutionEnvironments).mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            ...executionEnvironments.data.results[0],
            summary_fields: {
              user_capabilities: { edit: false, delete: false },
            },
          },
        ],
      },
    } as unknown as ResponseOf<
      typeof OrganizationsAPI.readExecutionEnvironments
    >);
    const { user } = renderWithContexts(
      <OrganizationExecEnvList organization={mockOrganization} />
    );
    const row = (
      await screen.findByText('https://localhost.com/image/disk')
    ).closest('tr')!;

    await user.click(within(row).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
