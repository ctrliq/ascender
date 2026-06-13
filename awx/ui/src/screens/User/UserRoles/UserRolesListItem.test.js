import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserRolesListItem from './UserRolesListItem';

describe('<UserRolesListItem/>', () => {
  const role = {
    id: 1,
    name: 'Admin',
    type: 'role',
    url: '/api/v2/roles/257/',
    summary_fields: {
      resource_name: 'template delete project',
      resource_id: 15,
      resource_type: 'job_template',
      resource_type_display_name: 'Job Template',
      user_capabilities: { unattach: true },
    },
  };
  test('should mount properly', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserRolesListItem
            role={role}
            detailUrl="/templates/job_template/15/details"
          />
        </tbody>
      </table>
    );
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  test('should render proper list item data', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserRolesListItem
            role={role}
            detailUrl="/templates/job_template/15/details"
          />
        </tbody>
      </table>
    );
    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('template delete project');
    expect(cells[1]).toHaveTextContent('Job Template');
    expect(cells[2]).toHaveTextContent('Admin');
  });

  test('should render deletable chip', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserRolesListItem
            role={role}
            detailUrl="/templates/job_template/15/details"
          />
        </tbody>
      </table>
    );
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  test('should render read only chip', () => {
    role.summary_fields.user_capabilities.unattach = false;
    renderWithContexts(
      <table>
        <tbody>
          <UserRolesListItem
            role={role}
            detailUrl="/templates/job_template/15/details"
          />
        </tbody>
      </table>
    );
    expect(
      screen.queryByRole('button', { name: /close/i })
    ).not.toBeInTheDocument();
  });

  test('should display System as name when no resource_name is present in summary_fields', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserRolesListItem
            role={{
              ...role,
              summary_fields: {
                user_capabilities: { unattach: false },
              },
            }}
          />
        </tbody>
      </table>
    );
    expect(screen.getAllByRole('cell')[0]).toHaveTextContent('System');
  });
});
