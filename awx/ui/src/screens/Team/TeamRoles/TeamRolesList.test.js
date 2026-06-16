import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { TeamsAPI, RolesAPI, UsersAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import TeamRolesList from './TeamRolesList';

jest.mock('../../../api/models/Teams');
jest.mock('../../../api/models/Roles');
jest.mock('../../../api/models/Users');

const me = { id: 1 };

const team = {
  id: 18,
  type: 'team',
  url: '/api/v2/teams/1/',
  summary_fields: {
    organization: { id: 1, name: 'Default', description: '' },
    user_capabilities: { edit: false, delete: false },
  },
  name: 'a team',
  description: '',
  organization: 1,
};

const roles = {
  data: {
    results: [
      {
        id: 2,
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
      },
      {
        id: 3,
        name: 'Admin Read Only',
        type: 'role',
        url: '/api/v2/roles/257/',
        summary_fields: {
          resource_name: 'workflow delete project',
          resource_id: 16,
          resource_type: 'workflow_job_template',
          resource_type_display_name: 'Job Template',
          user_capabilities: { unattach: true },
        },
      },
      {
        id: 4,
        name: 'Execute',
        type: 'role',
        url: '/api/v2/roles/258/',
        summary_fields: {
          resource_name: 'Credential Bar',
          resource_id: 75,
          resource_type: 'credential',
          resource_type_display_name: 'Credential',
          user_capabilities: { unattach: true },
        },
      },
      {
        id: 5,
        name: 'Update',
        type: 'role',
        url: '/api/v2/roles/259/',
        summary_fields: {
          resource_name: 'Inventory Foo',
          resource_id: 76,
          resource_type: 'inventory',
          resource_type_display_name: 'Inventory',
          user_capabilities: { unattach: true },
        },
      },
      {
        id: 6,
        name: 'Admin',
        type: 'role',
        url: '/api/v2/roles/260/',
        summary_fields: {
          resource_name: 'Smart Inventory Foo',
          resource_id: 77,
          resource_type: 'smart_inventory',
          resource_type_display_name: 'Inventory',
          user_capabilities: { unattach: true },
        },
      },
    ],
    count: 5,
  },
};

describe('<TeamRolesList />', () => {
  beforeEach(() => {
    UsersAPI.readAdminOfOrganizations.mockResolvedValue({
      count: 1,
      results: [{ id: 1, name: 'Foo Org' }],
    });
    TeamsAPI.readRoleOptions.mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render properly', async () => {
    TeamsAPI.readRoles.mockResolvedValue(roles);
    renderWithContexts(<TeamRolesList me={me} team={team} />);
    expect(await screen.findByText('Credential Bar')).toBeInTheDocument();
  });

  test('should create proper detailUrl', async () => {
    TeamsAPI.readRoles.mockResolvedValue(roles);
    const { container } = renderWithContexts(
      <TeamRolesList me={me} team={team} />
    );
    await screen.findByText('Credential Bar');

    expect(container.querySelector('#role-item-row-2 a')).toHaveAttribute(
      'href',
      '/templates/job_template/15/details'
    );
    expect(container.querySelector('#role-item-row-3 a')).toHaveAttribute(
      'href',
      '/templates/workflow_job_template/16/details'
    );
    expect(container.querySelector('#role-item-row-4 a')).toHaveAttribute(
      'href',
      '/credentials/75/details'
    );
    expect(container.querySelector('#role-item-row-5 a')).toHaveAttribute(
      'href',
      '/inventories/inventory/76/details'
    );
    expect(container.querySelector('#role-item-row-6 a')).toHaveAttribute(
      'href',
      '/inventories/smart_inventory/77/details'
    );
  });

  test('should not render add button when user cannot edit team and is not an admin of the org', async () => {
    UsersAPI.readAdminOfOrganizations.mockResolvedValueOnce({
      count: 0,
      results: [],
    });
    TeamsAPI.readRoles.mockResolvedValue({
      data: {
        results: [
          {
            id: 2,
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
            description: 'Can manage all aspects of the job template',
          },
        ],
        count: 1,
      },
    });
    renderWithContexts(<TeamRolesList me={me} team={team} />);
    await screen.findByText('template delete project');
    expect(
      screen.queryByRole('button', { name: 'Add' })
    ).not.toBeInTheDocument();
  });

  test('should render disassociate modal and call the api', async () => {
    TeamsAPI.readRoles.mockResolvedValue(roles);
    RolesAPI.disassociateTeamRole.mockResolvedValue({});
    const { user } = renderWithContexts(
      <TeamRolesList me={me} team={team} />
    );
    const row = (await screen.findByText('Credential Bar')).closest('tr');
    await user.click(within(row).getByRole('button'));

    await user.click(
      await screen.findByRole('button', { name: 'confirm disassociate' })
    );
    await waitFor(() =>
      expect(RolesAPI.disassociateTeamRole).toHaveBeenCalledWith(4, 18)
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'confirm disassociate' })
      ).not.toBeInTheDocument()
    );
  });

  test('should throw disassociation error', async () => {
    TeamsAPI.readRoles.mockResolvedValue(roles);
    RolesAPI.disassociateTeamRole.mockRejectedValue(new Error());
    const { user } = renderWithContexts(
      <TeamRolesList me={me} team={team} />
    );
    const row = (await screen.findByText('Credential Bar')).closest('tr');
    await user.click(within(row).getByRole('button'));

    await user.click(
      await screen.findByRole('button', { name: 'confirm disassociate' })
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  test('user with sys admin privilege should show empty state', async () => {
    TeamsAPI.readRoles.mockResolvedValue({
      data: {
        results: [
          {
            id: 2,
            name: 'System Administrator',
            type: 'role',
            url: '/api/v2/roles/257/',
            summary_fields: {
              resource_name: 'template delete project',
              resource_id: 15,
              resource_type: 'job_template',
              resource_type_display_name: 'Job Template',
              user_capabilities: { unattach: true },
            },
          },
        ],
        count: 1,
      },
    });
    renderWithContexts(<TeamRolesList me={me} team={team} />);
    expect(
      await screen.findByText('System Administrator')
    ).toBeInTheDocument();
  });
});
