import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import {
  CredentialsAPI,
  OrganizationsAPI,
  RolesAPI,
  TeamsAPI,
  UsersAPI,
} from 'api';
import { useUserProfile } from 'contexts/Config';
import * as ConfigContext from 'contexts/Config';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ResourceAccessList from './ResourceAccessList';

jest.mock('../../api');

describe('<ResourceAccessList />', () => {
  const organization = {
    id: 1,
    name: 'Default',
    summary_fields: {
      object_roles: {
        admin_role: {
          description: 'Can manage all aspects of the organization',
          name: 'Admin',
          id: 2,
          user_only: true,
        },
        execute_role: {
          description: 'May run any executable resources in the organization',
          name: 'Execute',
          id: 3,
        },
        project_admin_role: {
          description: 'Can manage all projects of the organization',
          name: 'Project Admin',
          id: 4,
        },
      },
      user_capabilities: {
        edit: true,
      },
    },
  };

  const data = {
    count: 2,
    results: [
      {
        id: 1,
        username: 'joe',
        url: '/foo',
        first_name: 'joe',
        last_name: 'smith',
        summary_fields: {
          direct_access: [
            {
              role: {
                id: 1,
                name: 'Member',
                resource_name: 'Org',
                resource_type: 'organization',
                user_capabilities: { unattach: true },
              },
            },
          ],
          indirect_access: [],
        },
      },
      {
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
      },
    ],
  };

  const credentialAccessList = {
    count: 2,
    results: [
      {
        id: 1,
        type: 'user',
        url: '/api/v2/users/1/',
        summary_fields: {
          direct_access: [
            {
              role: {
                id: 20,
                name: 'Admin',
                description: 'Can manage all aspects of the credential',
                resource_name: 'Demo Credential',
                resource_type: 'credential',
                related: { credential: '/api/v2/credentials/1/' },
                user_capabilities: { unattach: false },
              },
              descendant_roles: ['admin_role', 'read_role', 'use_role'],
            },
          ],
          indirect_access: [
            {
              role: {
                id: 1,
                name: 'System Administrator',
                description: 'Can manage all aspects of the system',
                user_capabilities: { unattach: false },
              },
              descendant_roles: ['admin_role', 'read_role', 'use_role'],
            },
          ],
        },
        created: '2022-06-08T18:31:35.834036Z',
        modified: '2022-06-09T16:47:54.712473Z',
        username: 'admin',
        first_name: '',
        last_name: '',
        email: 'admin@localhost',
        is_superuser: true,
        is_system_auditor: false,
        ldap_dn: '',
        last_login: '2022-06-09T16:47:54.712473Z',
        external_account: null,
      },
      {
        id: 2,
        type: 'user',
        url: '/api/v2/users/2/',
        related: {
          teams: '/api/v2/users/2/teams/',
          organizations: '/api/v2/users/2/organizations/',
          admin_of_organizations: '/api/v2/users/2/admin_of_organizations/',
          projects: '/api/v2/users/2/projects/',
          credentials: '/api/v2/users/2/credentials/',
          roles: '/api/v2/users/2/roles/',
          activity_stream: '/api/v2/users/2/activity_stream/',
          access_list: '/api/v2/users/2/access_list/',
          tokens: '/api/v2/users/2/tokens/',
          authorized_tokens: '/api/v2/users/2/authorized_tokens/',
          personal_tokens: '/api/v2/users/2/personal_tokens/',
        },
        summary_fields: {
          direct_access: [
            {
              role: {
                id: 22,
                name: 'Read',
                description: 'May view settings for the credential',
                resource_name: 'Demo Credential',
                resource_type: 'credential',
                related: { credential: '/api/v2/credentials/1/' },
                user_capabilities: { unattach: false },
              },
              descendant_roles: ['read_role'],
            },
          ],
          indirect_access: [],
        },
        created: '2022-06-09T13:45:56.049783Z',
        modified: '2022-06-09T16:48:46.169760Z',
        username: 'second',
        first_name: '',
        last_name: '',
        email: '',
        is_superuser: false,
        is_system_auditor: false,
        ldap_dn: '',
        last_login: '2022-06-09T16:48:46.169760Z',
        external_account: null,
      },
    ],
  };

  const credential = {
    id: 1,
    type: 'credential',
    url: '/api/v2/credentials/1/',
    related: {
      named_url: '/api/v2/credentials/Demo Credential++Machine+ssh++Default/',
      created_by: '/api/v2/users/1/',
      modified_by: '/api/v2/users/1/',
      organization: '/api/v2/organizations/1/',
      activity_stream: '/api/v2/credentials/1/activity_stream/',
      access_list: '/api/v2/credentials/1/access_list/',
      object_roles: '/api/v2/credentials/1/object_roles/',
      owner_users: '/api/v2/credentials/1/owner_users/',
      owner_teams: '/api/v2/credentials/1/owner_teams/',
      copy: '/api/v2/credentials/1/copy/',
      input_sources: '/api/v2/credentials/1/input_sources/',
      credential_type: '/api/v2/credential_types/1/',
    },
    summary_fields: {
      organization: {
        id: 1,
        name: 'Default',
        description: '',
      },
      credential_type: {
        id: 1,
        name: 'Machine',
        description: '',
      },
      created_by: {
        id: 1,
        username: 'admin',
        first_name: '',
        last_name: '',
      },
      modified_by: {
        id: 1,
        username: 'admin',
        first_name: '',
        last_name: '',
      },
      object_roles: {
        admin_role: {
          description: 'Can manage all aspects of the credential',
          name: 'Admin',
          id: 20,
        },
        use_role: {
          description: 'Can use the credential in a job template',
          name: 'Use',
          id: 21,
        },
        read_role: {
          description: 'May view settings for the credential',
          name: 'Read',
          id: 22,
        },
      },
      user_capabilities: {
        edit: true,
        delete: true,
        copy: false,
        use: true,
      },
      owners: [
        {
          id: 3,
          type: 'user',
          name: 'third',
          description: ' ',
          url: '/api/v2/users/3/',
        },
        {
          id: 1,
          type: 'user',
          name: 'admin',
          description: ' ',
          url: '/api/v2/users/1/',
        },
        {
          id: 1,
          type: 'organization',
          name: 'Default',
          description: '',
          url: '/api/v2/organizations/1/',
        },
      ],
    },
    created: '2022-06-08T18:31:43.491973Z',
    modified: '2022-06-09T19:40:49.460771Z',
    name: 'Demo Credential',
    description: '',
    organization: 1,
    credential_type: 1,
    managed: false,
    inputs: {
      username: 'admin',
      become_method: '',
      become_username: '',
    },
    kind: 'ssh',
    cloud: false,
    kubernetes: false,
  };

  const renderOrg = () =>
    renderWithContexts(
      <ResourceAccessList resource={organization} apiModel={OrganizationsAPI} />,
      {
        context: {
          router: {
            history: createMemoryHistory({
              initialEntries: ['/organizations/1/access'],
            }),
          },
        },
      }
    );

  const credentialHistory = createMemoryHistory({
    initialEntries: ['/credentials/1/access'],
  });

  beforeEach(() => {
    jest.spyOn(ConfigContext, 'useConfig').mockImplementation(() => ({
      me: { id: 2 },
    }));
    useUserProfile.mockImplementation(() => ({
      isSuperUser: true,
      isSystemAuditor: false,
      isOrgAdmin: false,
      isNotificationAdmin: false,
      isExecEnvAdmin: false,
    }));
    OrganizationsAPI.readAccessList.mockResolvedValue({ data });
    OrganizationsAPI.readAccessOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    OrganizationsAPI.readAdmins.mockResolvedValue({ data: { count: 1 } });
    TeamsAPI.disassociateRole.mockResolvedValue({});
    UsersAPI.disassociateRole.mockResolvedValue({});
    RolesAPI.read.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'System Administrator' },
          { id: 14, name: 'System Auditor' },
        ],
      },
    });
    CredentialsAPI.readAccessList.mockResolvedValue({ credentialAccessList });
    CredentialsAPI.readAccessOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch and display access records on mount', async () => {
    renderOrg();
    expect(
      await screen.findByRole('link', { name: 'joe' })
    ).toBeInTheDocument();
    expect(OrganizationsAPI.readAccessList).toHaveBeenCalled();
    // Two access records (joe, jane) each rendered as a row.
    expect(screen.getByRole('link', { name: 'jane' })).toBeInTheDocument();
  });

  test('should open and close confirmation dialog when deleting role', async () => {
    const { user } = renderOrg();
    await screen.findByRole('link', { name: 'joe' });
    // No confirm modal initially.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Click the first role chip's close button (joe's user role).
    const chipButtons = screen.getAllByRole('button', {
      name: /Remove Member chip/,
    });
    await user.click(chipButtons[0]);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Cancel the modal.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(TeamsAPI.disassociateRole).not.toHaveBeenCalled();
    expect(UsersAPI.disassociateRole).not.toHaveBeenCalled();
  });

  test('should delete user role', async () => {
    const { user } = renderOrg();
    await screen.findByRole('link', { name: 'joe' });
    const chipButtons = screen.getAllByRole('button', {
      name: /Remove Member chip/,
    });
    // Index 0 is joe's user role (id 1, user id 1).
    await user.click(chipButtons[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirm delete' })
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(TeamsAPI.disassociateRole).not.toHaveBeenCalled();
    expect(UsersAPI.disassociateRole).toHaveBeenCalledWith(1, 1);
    expect(OrganizationsAPI.readAccessList).toHaveBeenCalledTimes(2);
  });

  test('should delete team role', async () => {
    const { user } = renderOrg();
    await screen.findByRole('link', { name: 'jane' });
    const chipButtons = screen.getAllByRole('button', {
      name: /Remove Member chip/,
    });
    // Index 1 is jane's team role (id 3, team id 5).
    await user.click(chipButtons[1]);
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirm delete' })
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(TeamsAPI.disassociateRole).toHaveBeenCalledWith(5, 3);
    expect(UsersAPI.disassociateRole).not.toHaveBeenCalled();
    expect(OrganizationsAPI.readAccessList).toHaveBeenCalledTimes(2);
  });

  test('should call api to get org details', async () => {
    // The original asserted the computed toolbarSearchColumns prop, including the
    // "Roles" column whose options merge the org admin role id with the system
    // administrator role id ('2, 1'). The DOM equivalent: select "Roles" as the
    // search key, open the value filter, and assert the rendered options, with
    // the Admin option carrying the merged id 'select-option-2, 1'.
    const { user } = renderOrg();
    await screen.findByRole('link', { name: 'joe' });

    await user.click(screen.getByRole('button', { name: 'Simple key select' }));
    await user.click(await screen.findByRole('option', { name: 'Roles' }));

    const rolesToggle = await waitFor(() => {
      const el = document.querySelector(
        '[data-ouia-component-id="filter-by-or__roles__in"]'
      );
      expect(el).toBeInTheDocument();
      return el;
    });
    await user.click(rolesToggle);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('Admin')).toBeInTheDocument();
    expect(within(listbox).getByText('Execute')).toBeInTheDocument();
    expect(within(listbox).getByText('Project Admin')).toBeInTheDocument();
    // The Admin option carries the merged role ids '2, 1' as its value (the org
    // admin role id merged with the system administrator role id) -- this is the
    // DOM equivalent of the original toolbarSearchColumns options assertion.
    expect(
      listbox.querySelector('[id="select-option-2, 1"]')
    ).toBeInTheDocument();
  });

  test('should show add button for system admin', async () => {
    renderWithContexts(
      <ResourceAccessList resource={credential} apiModel={CredentialsAPI} />,
      { context: { router: { history: credentialHistory } } }
    );
    expect(
      await screen.findByRole('button', { name: /add/i })
    ).toBeInTheDocument();
  });

  test('should not show add button for a user without edit permissions on the credential', async () => {
    useUserProfile.mockImplementation(() => ({
      isSuperUser: false,
      isSystemAuditor: false,
      isOrgAdmin: false,
      isNotificationAdmin: false,
      isExecEnvAdmin: false,
    }));
    renderWithContexts(
      <ResourceAccessList
        resource={{
          ...credential,
          summary_fields: {
            ...credential.summary_fields,
            user_capabilities: {
              edit: false,
              delete: false,
              copy: false,
              use: false,
            },
          },
        }}
        apiModel={CredentialsAPI}
      />,
      { context: { router: { history: credentialHistory } } }
    );
    // Wait for content to load, then assert no Add button.
    await waitFor(() =>
      expect(CredentialsAPI.readAccessOptions).toHaveBeenCalled()
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: /add/i })
    ).not.toBeInTheDocument();
  });

  test('should show add button for non system admin, org admin, credential admin for credentials associated with org', async () => {
    useUserProfile.mockImplementation(() => ({
      isSuperUser: false,
      isSystemAuditor: false,
      isOrgAdmin: true,
      isNotificationAdmin: false,
      isExecEnvAdmin: false,
    }));
    renderWithContexts(
      <ResourceAccessList resource={credential} apiModel={CredentialsAPI} />,
      { context: { router: { history: credentialHistory } } }
    );
    expect(
      await screen.findByRole('button', { name: /add/i })
    ).toBeInTheDocument();
  });

  test('should not show add button for non system admin, org admin, credential admin for credentials non associated with org', async () => {
    useUserProfile.mockImplementation(() => ({
      isSuperUser: false,
      isSystemAuditor: false,
      isOrgAdmin: true,
      isNotificationAdmin: false,
      isExecEnvAdmin: false,
    }));
    renderWithContexts(
      <ResourceAccessList
        resource={{ ...credential, organization: null }}
        apiModel={CredentialsAPI}
      />,
      { context: { router: { history: credentialHistory } } }
    );
    await waitFor(() =>
      expect(CredentialsAPI.readAccessOptions).toHaveBeenCalled()
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: /add/i })
    ).not.toBeInTheDocument();
  });
});
