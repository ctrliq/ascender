import React from 'react';
import { screen } from '@testing-library/react';

import { OrganizationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import OrganizationExecEnvList from './OrganizationExecEnvList';

jest.mock('../../../api/');

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
      },
    ],
  },
};

const mockOrganization = {
  id: 1,
  type: 'organization',
  name: 'Default',
};

const options = { data: { actions: { POST: {}, GET: {} } } };

describe('<OrganizationExecEnvList/>', () => {
  beforeEach(() => {
    OrganizationsAPI.readExecutionEnvironments.mockResolvedValue(
      executionEnvironments
    );
    OrganizationsAPI.readExecutionEnvironmentsOptions.mockResolvedValue(options);
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  test('should not render add button', async () => {
    renderWithContexts(
      <OrganizationExecEnvList organization={mockOrganization} />
    );
    await screen.findByText('https://localhost.com/image/disk');
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add' })
    ).not.toBeInTheDocument();
  });
});
