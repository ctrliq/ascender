import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { UsersAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import UsersList from './UserList';

jest.mock('../../../api');

const mockUsers = [
  {
    id: 1,
    type: 'user',
    url: '/api/v2/users/1/',
    related: {
      teams: '/api/v2/users/1/teams/',
      organizations: '/api/v2/users/1/organizations/',
      admin_of_organizations: '/api/v2/users/1/admin_of_organizations/',
      projects: '/api/v2/users/1/projects/',
      credentials: '/api/v2/users/1/credentials/',
      roles: '/api/v2/users/1/roles/',
      activity_stream: '/api/v2/users/1/activity_stream/',
      access_list: '/api/v2/users/1/access_list/',
      tokens: '/api/v2/users/1/tokens/',
      authorized_tokens: '/api/v2/users/1/authorized_tokens/',
      personal_tokens: '/api/v2/users/1/personal_tokens/',
    },
    summary_fields: {
      user_capabilities: {
        edit: true,
        delete: true,
      },
    },
    created: '2019-10-28T15:01:07.218634Z',
    username: 'admin',
    first_name: 'Admin',
    last_name: 'User',
    email: 'admin@ansible.com',
    is_superuser: true,
    is_system_auditor: false,
    ldap_dn: '',
    last_login: '2019-11-05T18:12:57.367622Z',
    external_account: null,
    auth: [],
  },
  {
    id: 9,
    type: 'user',
    url: '/api/v2/users/9/',
    related: {
      teams: '/api/v2/users/9/teams/',
      organizations: '/api/v2/users/9/organizations/',
      admin_of_organizations: '/api/v2/users/9/admin_of_organizations/',
      projects: '/api/v2/users/9/projects/',
      credentials: '/api/v2/users/9/credentials/',
      roles: '/api/v2/users/9/roles/',
      activity_stream: '/api/v2/users/9/activity_stream/',
      access_list: '/api/v2/users/9/access_list/',
      tokens: '/api/v2/users/9/tokens/',
      authorized_tokens: '/api/v2/users/9/authorized_tokens/',
      personal_tokens: '/api/v2/users/9/personal_tokens/',
    },
    summary_fields: {
      user_capabilities: {
        edit: true,
        delete: false,
      },
    },
    created: '2019-11-04T18:52:13.565525Z',
    username: 'systemauditor',
    first_name: 'System',
    last_name: 'Auditor',
    email: 'systemauditor@ansible.com',
    is_superuser: false,
    is_system_auditor: true,
    ldap_dn: '',
    last_login: null,
    external_account: null,
    auth: [],
  },
  {
    id: 10,
    type: 'user',
    url: '/api/v2/users/10/',
    related: {
      teams: '/api/v2/users/10/teams/',
      organizations: '/api/v2/users/10/organizations/',
      admin_of_organizations: '/api/v2/users/10/admin_of_organizations/',
      projects: '/api/v2/users/10/projects/',
      credentials: '/api/v2/users/10/credentials/',
      roles: '/api/v2/users/10/roles/',
      activity_stream: '/api/v2/users/10/activity_stream/',
      access_list: '/api/v2/users/10/access_list/',
      tokens: '/api/v2/users/10/tokens/',
      authorized_tokens: '/api/v2/users/10/authorized_tokens/',
      personal_tokens: '/api/v2/users/10/personal_tokens/',
    },
    summary_fields: {
      user_capabilities: {
        edit: true,
        delete: false,
      },
    },
    created: '2019-11-04T18:52:13.565525Z',
    username: 'nobody',
    first_name: '',
    last_name: '',
    email: 'systemauditor@ansible.com',
    is_superuser: false,
    is_system_auditor: true,
    ldap_dn: '',
    last_login: null,
    external_account: null,
    auth: [],
  },
];

afterEach(() => {
  jest.clearAllMocks();
});

describe('UsersList with full permissions', () => {
  let user;

  beforeEach(async () => {
    UsersAPI.destroy = jest.fn();
    UsersAPI.read.mockResolvedValue({
      data: {
        count: mockUsers.length,
        results: mockUsers,
      },
    });
    UsersAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
      },
    });

    ({ user } = renderWithContexts(<UsersList />));
    await screen.findByRole('link', { name: 'admin' });
  });

  test('Users are retrieved from the api and the components finishes loading', () => {
    expect(UsersAPI.read).toHaveBeenCalled();
    expect(screen.getAllByRole('link', { name: /admin|systemauditor|nobody/ })).toHaveLength(3);
  });

  test('should show add button', () => {
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });

  test('Last user should have no first name or last name and the row items should render properly', () => {
    const row = screen.getByRole('link', { name: 'nobody' }).closest('tr');
    const cells = within(row).getAllByRole('cell');
    const firstNameCell = cells.find(
      (cell) => cell.getAttribute('data-label') === 'First Name'
    );
    const lastNameCell = cells.find(
      (cell) => cell.getAttribute('data-label') === 'Last Name'
    );
    expect(firstNameCell).toHaveTextContent('');
    expect(lastNameCell).toHaveTextContent('');
  });

  test('should check and uncheck the row item', async () => {
    const row = screen.getByRole('link', { name: 'admin' }).closest('tr');
    const checkbox = within(row).getByRole('checkbox');

    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('should check all row items when select all is checked', async () => {
    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox')
      .filter((box) => box !== selectAll);

    expect(rowCheckboxes).toHaveLength(3);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
  });

  test('should call api delete users for each selected user', async () => {
    UsersAPI.destroy.mockResolvedValue({});
    const row = screen.getByRole('link', { name: 'admin' }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() => expect(UsersAPI.destroy).toHaveBeenCalledTimes(1));
  });

  test('should show error modal when user is not successfully deleted from api', async () => {
    UsersAPI.destroy.mockRejectedValueOnce(new Error());
    const row = screen.getByRole('link', { name: 'admin' }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    // closing the modal refocuses the Tooltip-wrapped toolbar Delete button
    await settleTooltips();
  });
});

describe('UsersList without full permissions', () => {
  test('Add button hidden for users without ability to POST', async () => {
    UsersAPI.read.mockResolvedValue({
      data: {
        count: mockUsers.length,
        results: mockUsers,
      },
    });
    UsersAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
        },
      },
    });

    renderWithContexts(<UsersList />);
    await screen.findByRole('link', { name: 'admin' });

    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });
});

describe('read call unsuccessful', () => {
  test('should show content error when read call unsuccessful', async () => {
    UsersAPI.read.mockRejectedValue(new Error());
    UsersAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });

    renderWithContexts(<UsersList />);

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
