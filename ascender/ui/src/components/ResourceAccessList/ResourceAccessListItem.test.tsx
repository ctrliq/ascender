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

    // Username link plus first name / last name cells. The first name equals
    // the username here, so target the First Name cell by its column label.
    expect(screen.getByRole('link', { name: 'jane' })).toBeInTheDocument();
    expect(
      document.querySelector('[data-label="First Name"]')
    ).toHaveTextContent('jane');
    expect(
      document.querySelector('[data-label="Last Name"]')
    ).toHaveTextContent('brown');

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

  /*
   * An inherited role, or one the viewer may not take off, keeps its chip but
   * loses the close button: closing it would do nothing or far too much.
   */
  test('offers to disassociate only the roles the viewer can take off', async () => {
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
                  {
                    role: {
                      id: 4,
                      name: 'Read',
                      user_capabilities: { unattach: false },
                    },
                  },
                ],
                indirect_access: [
                  {
                    role: {
                      id: 5,
                      name: 'Admin',
                      user_capabilities: { unattach: true },
                    },
                  },
                ],
              },
            }}
            resourceRoleIds={[3, 4, 5]}
            onRoleDelete={() => {}}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Disassociate Member' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disassociate Read' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disassociate Admin' })
    ).not.toBeInTheDocument();
  });

  /*
   * The api puts a team's inherited roles in direct_access alongside the ones
   * on the resource: a team that administers the organization shows up on one
   * of its projects with the organization's Admin role. Only the team role on
   * the project itself can be closed from here.
   */
  test('does not offer to disassociate a role a team inherits from elsewhere', async () => {
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
                      name: 'Use',
                      resource_name: 'Project',
                      resource_type: 'project',
                      team_id: 5,
                      team_name: 'The Team',
                      user_capabilities: { unattach: true },
                    },
                  },
                  {
                    role: {
                      id: 40,
                      name: 'Admin',
                      resource_name: 'Default',
                      resource_type: 'organization',
                      team_id: 5,
                      team_name: 'The Team',
                      user_capabilities: { unattach: true },
                    },
                  },
                ],
                indirect_access: [],
              },
            }}
            resourceRoleIds={[1, 2, 3]}
            onRoleDelete={() => {}}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Disassociate Use' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disassociate Admin' })
    ).not.toBeInTheDocument();
  });
});
