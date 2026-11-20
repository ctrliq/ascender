import type { Team } from 'types/api';
import React from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { TeamsAPI, RolesAPI, UsersAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import TeamRolesList from './TeamRolesList';

vi.mock('../../../api/models/Teams');
vi.mock('../../../api/models/Roles');
vi.mock('../../../api/models/Users');

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
} as unknown as Team;

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
    vi.mocked(UsersAPI.readAdminOfOrganizations).mockResolvedValue({
      data: { count: 1, results: [{ id: 1, name: 'Foo Org' }] },
    } as unknown as ResponseOf<typeof UsersAPI.readAdminOfOrganizations>);
    vi.mocked(TeamsAPI.readRoleOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof TeamsAPI.readRoleOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render properly', async () => {
    vi.mocked(TeamsAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof TeamsAPI.readRoles>
    );
    renderWithContexts(<TeamRolesList me={me} team={team} />);
    expect(await screen.findByText('Credential Bar')).toBeInTheDocument();
  });

  test('should create proper detailUrl', async () => {
    vi.mocked(TeamsAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof TeamsAPI.readRoles>
    );
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
    vi.mocked(UsersAPI.readAdminOfOrganizations).mockResolvedValueOnce({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof UsersAPI.readAdminOfOrganizations>);
    vi.mocked(TeamsAPI.readRoles).mockResolvedValue({
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
    } as unknown as ResponseOf<typeof TeamsAPI.readRoles>);
    renderWithContexts(<TeamRolesList me={me} team={team} />);
    await screen.findByText('template delete project');
    expect(
      screen.queryByRole('button', { name: 'Associate' })
    ).not.toBeInTheDocument();
  });

  test('offers to associate a role when the list is empty', async () => {
    vi.mocked(TeamsAPI.readRoles).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof TeamsAPI.readRoles>);

    renderWithContexts(<TeamRolesList me={me} team={team} />);

    expect(
      await screen.findByText('Associate a role to list it here')
    ).toBeInTheDocument();
  });

  test('describes the empty list without offering to associate', async () => {
    vi.mocked(UsersAPI.readAdminOfOrganizations).mockResolvedValueOnce({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof UsersAPI.readAdminOfOrganizations>);
    vi.mocked(TeamsAPI.readRoles).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof TeamsAPI.readRoles>);

    renderWithContexts(<TeamRolesList me={me} team={team} />);

    expect(
      await screen.findByText('Roles this team holds appear here')
    ).toBeInTheDocument();
  });

  /*
   * A tick kept across a new search could sit on a role the search hides, and
   * the toolbar's Disassociate would still take it off.
   */
  test('clears the ticks when the search changes', async () => {
    vi.mocked(TeamsAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof TeamsAPI.readRoles>
    );
    const history = createMemoryHistory({
      initialEntries: ['/teams/18/roles'],
    });
    const { user } = renderWithContexts(<TeamRolesList me={me} team={team} />, {
      context: { router: { history } },
    });
    await screen.findByText('Credential Bar');

    const [tick] = screen.getAllByRole('checkbox', { name: /Select row/ });
    await user.click(tick as HTMLElement);
    expect(screen.getByRole('button', { name: 'Disassociate' })).toBeEnabled();

    act(() => history.replace('/teams/18/roles?roles.role_field__icontains=x'));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Disassociate' })
      ).toBeDisabled()
    );
  });

  test('steps back a page when every role on it is taken off', async () => {
    vi.mocked(TeamsAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof TeamsAPI.readRoles>
    );
    vi.mocked(RolesAPI.disassociateTeamRole).mockResolvedValue(
      {} as unknown as ResponseOf<typeof RolesAPI.disassociateTeamRole>
    );
    const history = createMemoryHistory({
      initialEntries: ['/teams/18/roles?roles.page=2'],
    });
    const { user } = renderWithContexts(<TeamRolesList me={me} team={team} />, {
      context: { router: { history } },
    });
    await screen.findByText('Credential Bar');

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Disassociate' })
    );

    await waitFor(() =>
      expect(history.location.search).not.toContain('roles.page=2')
    );
    expect(RolesAPI.disassociateTeamRole).toHaveBeenCalledTimes(5);
  });

  test('should render disassociate modal and call the api', async () => {
    vi.mocked(TeamsAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof TeamsAPI.readRoles>
    );
    vi.mocked(RolesAPI.disassociateTeamRole).mockResolvedValue(
      {} as unknown as ResponseOf<typeof RolesAPI.disassociateTeamRole>
    );
    const { user } = renderWithContexts(<TeamRolesList me={me} team={team} />);
    const row = (await screen.findByText('Credential Bar')).closest('tr');
    await user.click(within(row!).getByRole('button'));

    // The dialog names the side losing the role, the team, and the role with
    // the resource it is on.
    expect(
      await screen.findByText(
        /This disassociates the following role from the team:/
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Credential Bar: Execute')).toBeInTheDocument();
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Disassociate' })
    );
    await waitFor(() =>
      expect(RolesAPI.disassociateTeamRole).toHaveBeenCalledWith(4, 18)
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Confirm Disassociate' })
      ).not.toBeInTheDocument()
    );
  });

  test('should throw disassociation error', async () => {
    vi.mocked(TeamsAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof TeamsAPI.readRoles>
    );
    vi.mocked(RolesAPI.disassociateTeamRole).mockRejectedValue(new Error());
    const { user } = renderWithContexts(<TeamRolesList me={me} team={team} />);
    const row = (await screen.findByText('Credential Bar')).closest('tr');
    await user.click(within(row!).getByRole('button'));

    await user.click(
      await screen.findByRole('button', { name: 'Confirm Disassociate' })
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  /*
   * A team cannot hold a role on nothing, so a role's name, which the api
   * translates, never turns the list into the system administrator state.
   */
  test('lists a role whatever it is called', async () => {
    vi.mocked(TeamsAPI.readRoles).mockResolvedValue({
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
    } as unknown as ResponseOf<typeof TeamsAPI.readRoles>);
    renderWithContexts(<TeamRolesList me={me} team={team} />);
    expect(
      await screen.findByText('template delete project')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'System administrators have unrestricted access to all resources'
      )
    ).not.toBeInTheDocument();
  });
});
