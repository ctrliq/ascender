import React from 'react';
import { screen } from '@testing-library/react';

import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ResourceAccessListItem from './ResourceAccessListItem';

const accessRecord = {
  id: 2,
  username: 'jane',
  url: '/bar',
  first_name: 'jane',
  last_name: 'brown',
  summary_fields: {
    direct_access: [
      {
        role: {
          id: 3,
          name: 'Member',
          resource_name: 'Org',
          resource_type: 'organization',
          team_id: 5,
          team_name: 'The Team',
          user_capabilities: { unattach: true },
        },
      },
    ],
    indirect_access: [],
  },
};

describe('<ResourceAccessListItem />', () => {
  test('initially renders successfully', async () => {
    renderWithContexts(
      <table>
        <tbody>
          <ResourceAccessListItem
            accessRecord={accessRecord}
            onRoleDelete={() => {}}
          />
        </tbody>
      </table>
    );

    // Username link plus first name / last name cells.
    expect(screen.getByRole('link', { name: 'jane' })).toBeInTheDocument();
    expect(screen.getByText('brown')).toBeInTheDocument();

    // The only role has a team_id, so it's a team role; the "User Roles" Detail
    // is empty (isEmpty -> Detail renders nothing). The team role chip renders.
    expect(screen.queryByText('User Roles')).not.toBeInTheDocument();
    expect(screen.getByText('Team Roles')).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
  });

  test('should not load team roles', async () => {
    renderWithContexts(
      <table>
        <tbody>
          <ResourceAccessListItem
            accessRecord={{
              ...accessRecord,
              summary_fields: {
                direct_access: [
                  {
                    role: {
                      id: 3,
                      name: 'Member',
                      user_capabilities: { unattach: true },
                    },
                  },
                ],
                indirect_access: [],
              },
            }}
            onRoleDelete={() => {}}
          />
        </tbody>
      </table>
    );

    // The role lacks a team_id, so it's a user role; the "Team Roles" Detail is
    // empty (isEmpty -> Detail renders nothing) while "User Roles" renders.
    expect(screen.queryByText('Team Roles')).not.toBeInTheDocument();
    expect(screen.getByText('User Roles')).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
  });
});
