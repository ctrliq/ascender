import type { User } from 'types/api';
import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { UsersAPI, RolesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserRolesList from './UserRolesList';

vi.mock('../../../api');

const user = {
  id: 18,
  username: 'Foo User',
  summary_fields: {
    user_capabilities: {
      edit: true,
      delete: true,
    },
  },
} as unknown as User;

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
        name: 'Admin',
        type: 'role',
        url: '/api/v2/roles/257/',
        summary_fields: {
          resource_name: 'template delete project',
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

describe('<UserRolesList />', () => {
  beforeEach(() => {
    vi.mocked(UsersAPI.readOptions).mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof UsersAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render properly', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof UsersAPI.readRoles>
    );

    renderWithContexts(<UserRolesList user={user} />);

    expect(await screen.findByText('Credential Bar')).toBeInTheDocument();
  });

  /*
   * The search keys describe roles, so they come from the roles endpoint's
   * OPTIONS rather than the users endpoint's.
   */
  test('reads the search keys from the user roles endpoint', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof UsersAPI.readRoles>
    );

    renderWithContexts(<UserRolesList user={user} />);

    await screen.findByText('Credential Bar');
    expect(UsersAPI.readRoleOptions).toHaveBeenCalledWith(18);
  });

  test('should create proper detailUrl', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof UsersAPI.readRoles>
    );

    renderWithContexts(<UserRolesList user={user} />);

    const templateLinks = await screen.findAllByRole('link', {
      name: 'template delete project',
    });
    expect(templateLinks[0]).toHaveAttribute(
      'href',
      '/templates/job_template/15/details'
    );
    expect(templateLinks[1]).toHaveAttribute(
      'href',
      '/templates/workflow_job_template/16/details'
    );
    expect(
      screen.getByRole('link', { name: 'Credential Bar' })
    ).toHaveAttribute('href', '/credentials/75/details');
    expect(screen.getByRole('link', { name: 'Inventory Foo' })).toHaveAttribute(
      'href',
      '/inventories/inventory/76/details'
    );
    expect(
      screen.getByRole('link', { name: 'Smart Inventory Foo' })
    ).toHaveAttribute('href', '/inventories/smart_inventory/77/details');
  });
  test('should not render add button when user cannot create other users and user cannot edit this user', async () => {
    vi.mocked(UsersAPI.readRoleOptions).mockResolvedValueOnce({
      data: {
        actions: {
          GET: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof UsersAPI.readRoleOptions>);

    vi.mocked(UsersAPI.readRoles).mockResolvedValue({
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
              object_roles: {
                admin_role: {
                  description: 'Can manage all aspects of the job template',
                  name: 'Admin',
                  id: 164,
                },
                execute_role: {
                  description: 'May run the job template',
                  name: 'Execute',
                  id: 165,
                },
                read_role: {
                  description: 'May view settings for the job template',
                  name: 'Read',
                  id: 166,
                },
              },
            },
          },
        ],
        count: 1,
      },
    } as unknown as ResponseOf<typeof UsersAPI.readRoles>);
    renderWithContexts(
      <UserRolesList
        user={
          {
            ...user,
            summary_fields: {
              user_capabilities: {
                edit: false,
                delete: false,
              },
            },
          } as unknown as User
        }
      />
    );

    await screen.findByText('template delete project');

    expect(
      screen.queryByRole('button', { name: 'Add resource roles' })
    ).not.toBeInTheDocument();
  });
  test('offers to associate a role when the list is empty', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof UsersAPI.readRoles>);

    renderWithContexts(<UserRolesList user={user} />);

    expect(
      await screen.findByText('Associate a role to list it here')
    ).toBeInTheDocument();
  });

  test('describes the empty list without offering to associate', async () => {
    vi.mocked(UsersAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof UsersAPI.readOptions>);
    vi.mocked(UsersAPI.readRoles).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof UsersAPI.readRoles>);

    renderWithContexts(<UserRolesList user={user} />);

    expect(
      await screen.findByText('Roles this user holds appear here')
    ).toBeInTheDocument();
  });

  test('should open and close wizard', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof UsersAPI.readRoles>
    );
    const { user: events } = renderWithContexts(<UserRolesList user={user} />);

    await screen.findByText('Credential Bar');
    await events.click(screen.getByRole('button', { name: 'Associate' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await events.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // let the Add button tooltip's show/hide/transition timers (300ms each)
    // settle before unmount to avoid a state-update-on-unmounted warning
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
    });
  });
  test('removes the ticked roles from the toolbar', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof UsersAPI.readRoles>
    );
    vi.mocked(RolesAPI.disassociateUserRole).mockResolvedValue(
      {} as unknown as ResponseOf<typeof RolesAPI.disassociateUserRole>
    );

    const { user: events } = renderWithContexts(<UserRolesList user={user} />);
    await screen.findByText('Credential Bar');

    const ticks = screen.getAllByRole('checkbox', { name: /Select row/ });
    await events.click(ticks[0] as HTMLElement);
    await events.click(ticks[1] as HTMLElement);
    await events.click(screen.getByRole('button', { name: 'Disassociate' }));
    await events.click(
      await screen.findByRole('button', { name: 'Confirm Disassociate' })
    );

    await waitFor(() =>
      expect(RolesAPI.disassociateUserRole).toHaveBeenCalledTimes(2)
    );
    expect(RolesAPI.disassociateUserRole).toHaveBeenCalledWith(2, 18);
  });

  /*
   * A tick kept across a new search could sit on a role the search hides, and
   * the toolbar's Disassociate would still take it off.
   */
  test('clears the ticks when the search changes', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof UsersAPI.readRoles>
    );
    const history = createMemoryHistory({
      initialEntries: ['/users/18/roles'],
    });
    const { user: events } = renderWithContexts(<UserRolesList user={user} />, {
      context: { router: { history } },
    });
    await screen.findByText('Credential Bar');

    const [tick] = screen.getAllByRole('checkbox', { name: /Select row/ });
    await events.click(tick as HTMLElement);
    expect(screen.getByRole('button', { name: 'Disassociate' })).toBeEnabled();

    // The search box replaces the address rather than pushing one.
    act(() => history.replace('/users/18/roles?roles.role_field__icontains=x'));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Disassociate' })
      ).toBeDisabled()
    );
  });

  test('steps back a page when every role on it is taken off', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof UsersAPI.readRoles>
    );
    vi.mocked(RolesAPI.disassociateUserRole).mockResolvedValue(
      {} as unknown as ResponseOf<typeof RolesAPI.disassociateUserRole>
    );
    const history = createMemoryHistory({
      initialEntries: ['/users/18/roles?roles.page=2'],
    });
    const { user: events } = renderWithContexts(<UserRolesList user={user} />, {
      context: { router: { history } },
    });
    await screen.findByText('Credential Bar');

    await events.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await events.click(screen.getByRole('button', { name: 'Disassociate' }));
    await events.click(
      await screen.findByRole('button', { name: 'Confirm Disassociate' })
    );

    await waitFor(() =>
      expect(history.location.search).not.toContain('roles.page=2')
    );
    expect(RolesAPI.disassociateUserRole).toHaveBeenCalledTimes(5);
  });

  test('should render disassociate modal', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof UsersAPI.readRoles>
    );

    const { user: events } = renderWithContexts(<UserRolesList user={user} />);

    await screen.findByText('Credential Bar');

    await events.click(
      screen.getByRole('button', { name: 'Disassociate Execute' })
    );
    expect(
      await screen.findByRole('dialog', { name: /Disassociate Role\?/ })
    ).toBeInTheDocument();
    // The dialog names the side losing the role, the user, and the role with
    // the resource it is on.
    expect(
      screen.getByText(/This disassociates the following role from the user:/)
    ).toBeInTheDocument();
    expect(screen.getByText('Credential Bar: Execute')).toBeInTheDocument();
    await events.click(
      screen.getByRole('button', { name: 'Confirm Disassociate' })
    );
    expect(RolesAPI.disassociateUserRole).toHaveBeenCalledWith(4, 18);
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Disassociate Role\?/ })
      ).not.toBeInTheDocument();
    });
  });
  test('should throw disassociation error', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue(
      roles as unknown as ResponseOf<typeof UsersAPI.readRoles>
    );
    vi.mocked(RolesAPI.disassociateUserRole).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'post',
            url: '/api/v2/roles/18/roles',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );

    const { user: events } = renderWithContexts(<UserRolesList user={user} />);

    await screen.findByText('Credential Bar');

    await events.click(
      screen.getByRole('button', { name: 'Disassociate Execute' })
    );
    expect(
      await screen.findByRole('dialog', { name: /Disassociate Role\?/ })
    ).toBeInTheDocument();
    await events.click(
      screen.getByRole('button', { name: 'Confirm Disassociate' })
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    expect(
      screen.getByText('Failed to disassociate role.')
    ).toBeInTheDocument();
  });
  /*
   * The api names a role in the viewer's language, so whether the user is a
   * system administrator is read off the account rather than off a role name.
   */
  test('a superuser shows the system administrator state in any language', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue({
      data: {
        results: [
          {
            id: 1,
            name: 'Administrador del sistema',
            type: 'role',
            url: '/api/v2/roles/1/',
            summary_fields: { user_capabilities: { unattach: true } },
          },
        ],
        count: 1,
      },
    } as unknown as ResponseOf<typeof UsersAPI.readRoles>);

    renderWithContexts(
      <UserRolesList user={{ ...user, is_superuser: true } as User} />
    );

    expect(
      await screen.findByText(
        'System administrators have unrestricted access to all resources'
      )
    ).toBeInTheDocument();
  });

  test('lists the roles of a user who is not a superuser', async () => {
    vi.mocked(UsersAPI.readRoles).mockResolvedValue({
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
    } as unknown as ResponseOf<typeof UsersAPI.readRoles>);

    renderWithContexts(<UserRolesList user={user} />);

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
