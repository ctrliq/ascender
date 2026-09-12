import React from 'react';
import { screen } from '@testing-library/react';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ManagementJobListItem from './ManagementJobListItem';

describe('<ManagementJobListItem/>', () => {
  const managementJob = {
    id: 3,
    name: 'Cleanup Expired Sessions',
    description: 'Cleans out expired browser sessions',
    job_type: 'cleanup_sessions',
    url: '/api/v2/system_job_templates/3/',
  };

  const renderItem = () =>
    renderWithContexts(
      <table>
        <tbody>
          <ManagementJobListItem
            id={managementJob.id}
            name={managementJob.name}
            description={managementJob.description}
            isSuperUser
            onLaunchError={() => {}}
          />
        </tbody>
      </table>
    );

  test('should mount successfully', () => {
    renderItem();
    expect(screen.getByText(managementJob.name)).toBeInTheDocument();
  });

  test('should render the proper data', () => {
    renderItem();
    expect(screen.getByText(managementJob.name)).toBeInTheDocument();
    expect(screen.getByText(managementJob.description)).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Launch management job' })
    ).toBeInTheDocument();
  });
});
