import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import TeamRoleListItem from './TeamRoleListItem';

const makeRole = (overrides = {}) => ({
  id: 1,
  name: 'Admin',
  type: 'role',
  url: '/api/v2/roles/257/',
  summary_fields: {
    resource_name: 'template delete project',
    resource_id: 15,
    resource_type: 'job_template',
    resource_type_display_name: 'Job Template',
    user_capabilities: { unattach: true, ...(overrides.user_capabilities || {}) },
  },
});

const renderItem = (role = makeRole()) =>
  renderWithContexts(
    <table>
      <tbody>
        <TeamRoleListItem
          role={role}
          detailUrl="/templates/job_template/15/details"
          onDisassociate={() => {}}
        />
      </tbody>
    </table>
  );

describe('<TeamRoleListItem/>', () => {
  test('should render proper list item data', () => {
    renderItem();
    expect(
      screen.getByRole('link', { name: 'template delete project' })
    ).toBeInTheDocument();
    expect(screen.getByText('Job Template')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  test('should render deletable chip', () => {
    renderItem();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('should render read only chip', () => {
    renderItem(makeRole({ user_capabilities: { unattach: false } }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
