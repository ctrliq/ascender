import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { UsersAPI, RolesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserRolesList from './UserRolesList';

jest.mock('../../../api');

const user = {
  id: 18,
  username: 'Foo User',
  summary_fields: {
    user_capabilities: {
      edit: true,
      delete: true,
    },
  },
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
    UsersAPI.readOptions.mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render properly', async () => {
    UsersAPI.readRoles.mockResolvedValue(roles);

    renderWithContexts(<UserRolesList user={user} />);

    expect(await screen.findByText('Credential Bar')).toBeInTheDocument();
  });

  test('should create proper detailUrl', async () => {
    UsersAPI.readRoles.mockResolvedValue(roles);

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
    expect(screen.getByRole('link', { name: 'Credential Bar' })).toHaveAttribute(
      'href',
      '/credentials/75/details'
    );
    expect(screen.getByRole('link', { name: 'Inventory Foo' })).toHaveAttribute(
      'href',
      '/inventories/inventory/76/details'
    );
    expect(
      screen.getByRole('link', { name: 'Smart Inventory Foo' })
    ).toHaveAttribute('href', '/inventories/smart_inventory/77/details');
  });
  test('should not render add button when user cannot create other users and user cannot edit this user', async () => {
    UsersAPI.readRoleOptions.mockResolvedValueOnce({
      data: {
        actions: {
          GET: {},
        },
        related_search_fields: [],
      },
    });

    UsersAPI.readRoles.mockResolvedValue({
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
    });
    renderWithContexts(
      <UserRolesList
        user={{
          ...user,
          summary_fields: {
            user_capabilities: {
              edit: false,
              delete: false,
            },
          },
        }}
      />
    );

    await screen.findByText('template delete project');

    expect(
      screen.queryByRole('button', { name: 'Add resource roles' })
    ).not.toBeInTheDocument();
  });
  test('should open and close wizard', async () => {
    UsersAPI.readRoles.mockResolvedValue(roles);
    const { user: events } = renderWithContexts(<UserRolesList user={user} />);

    await screen.findByText('Credential Bar');
    await events.click(screen.getByRole('button', { name: 'Add' }));
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
  test('should render disassociate modal', async () => {
    UsersAPI.readRoles.mockResolvedValue(roles);

    const { user: events } = renderWithContexts(<UserRolesList user={user} />);

    await screen.findByText('Credential Bar');

    await events.click(screen.getByRole('button', { name: /Close Execute/ }));
    expect(
      await screen.findByRole('dialog', { name: /Disassociate role!/ })
    ).toBeInTheDocument();
    await events.click(
      screen.getByRole('button', { name: 'Confirm disassociate' })
    );
    expect(RolesAPI.disassociateUserRole).toHaveBeenCalledWith(4, 18);
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Disassociate role!/ })
      ).not.toBeInTheDocument();
    });
  });
  test('should throw disassociation error', async () => {
    UsersAPI.readRoles.mockResolvedValue(roles);
    RolesAPI.disassociateUserRole.mockRejectedValue(
      new Error({
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

    await events.click(screen.getByRole('button', { name: /Close Execute/ }));
    expect(
      await screen.findByRole('dialog', { name: /Disassociate role!/ })
    ).toBeInTheDocument();
    await events.click(
      screen.getByRole('button', { name: 'Confirm disassociate' })
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });
  test('user with sys admin privilege should show empty state', async () => {
    UsersAPI.readRoles.mockResolvedValue({
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

    renderWithContexts(<UserRolesList user={user} />);

    expect(
      await screen.findByText('System Administrator')
    ).toBeInTheDocument();
  });
});
