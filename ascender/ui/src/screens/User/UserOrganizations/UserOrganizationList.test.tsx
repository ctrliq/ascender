import type { User } from 'types/api';
import React from 'react';
import { Routes, Route } from 'react-router';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { OrganizationsAPI, UsersAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import UserOrganizationList from './UserOrganizationList';

vi.mock('../../../api');

const organization = (
  id: number,
  name: string,
  memberRoleId: number,
  canDelete = true
) => ({
  id,
  name,
  description: 'Bar',
  url: `/api/v2/organizations/${id}/`,
  summary_fields: {
    user_capabilities: { edit: canDelete, delete: canDelete },
    object_roles: {
      admin_role: { id: memberRoleId - 1 },
      member_role: { id: memberRoleId },
    },
  },
});

/** The user the list is for, whom the viewer may or may not administer. */
const listedUser = (canEdit = true) =>
  ({
    id: 1,
    username: 'listed',
    summary_fields: { user_capabilities: { edit: canEdit, delete: canEdit } },
  }) as unknown as User;

/*
 * Rendered for a superuser unless a test says otherwise. The users endpoint's
 * OPTIONS offers POST throughout, which answers whether the viewer may create
 * users and is not what this list asks.
 */
function renderList(
  config: Record<string, unknown> = {},
  target: User = listedUser()
) {
  vi.mocked(UsersAPI.readOptions).mockResolvedValue({
    data: { actions: { GET: {}, POST: {} } },
  } as unknown as ResponseOf<typeof UsersAPI.readOptions>);
  const history = createMemoryHistory({
    initialEntries: ['/users/1/organizations'],
  });
  return renderWithContexts(
    <Routes>
      <Route
        path="/users/:id/organizations"
        element={<UserOrganizationList user={target} />}
      />
    </Routes>,
    { context: { router: { history }, config } }
  );
}

describe('<UserOrganizationlist />', () => {
  beforeEach(() => {
    vi.mocked(UsersAPI.readOrganizations).mockResolvedValue({
      data: {
        results: [organization(1, 'Foo', 11), organization(2, 'Qux', 21)],
        count: 2,
      },
    } as unknown as ResponseOf<typeof UsersAPI.readOrganizations>);
    vi.mocked(UsersAPI.readOrganizationOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof UsersAPI.readOrganizationOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('successfully mounts', async () => {
    renderList();
    expect(await screen.findByText('Foo')).toBeInTheDocument();
    expect(screen.getAllByText('Bar')).toHaveLength(2);
  });

  test('calls api to get organizations', async () => {
    renderList();
    await screen.findByText('Foo');
    expect(UsersAPI.readOrganizations).toHaveBeenCalledWith('1', {
      order_by: 'name',
      page: 1,
      page_size: 20,
      type: 'organization',
    });
    expect(UsersAPI.readOrganizationOptions).toHaveBeenCalledWith('1');
  });

  test('adds the user to the picked organizations as a member', async () => {
    vi.mocked(UsersAPI.associateRole).mockResolvedValue(
      {} as unknown as ResponseOf<typeof UsersAPI.associateRole>
    );
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { count: 1, results: [organization(3, 'Baz', 31)] },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    const { user } = renderList();
    await screen.findByText('Foo');

    await user.click(screen.getByRole('button', { name: 'Associate' }));
    await user.click(await screen.findByText('Baz'));
    await user.click(screen.getByRole('button', { name: 'Associate' }));

    await waitFor(() =>
      expect(UsersAPI.associateRole).toHaveBeenCalledWith('1', 31)
    );
    expect(UsersAPI.associateRole).toHaveBeenCalledTimes(1);
    // The picker offers only organizations the user is not a member of yet,
    // and only those the viewer runs, which are the ones the api lets them
    // grant a membership of.
    expect(OrganizationsAPI.read).toHaveBeenCalledWith(
      expect.objectContaining({
        not__member_role__members__id: '1',
        role_level: 'admin_role',
      })
    );
    await settleTooltips();
  });

  /*
   * Membership is the organization's Member role: an organization admin may
   * grant it to a user they administer, and whether the viewer may create
   * users has nothing to do with it.
   */
  test('offers Associate and Disassociate to an admin of an organization', async () => {
    renderList({ me: { id: 9, is_superuser: false }, adminOrgCount: 1 });
    await screen.findByText('Foo');
    expect(
      screen.getByRole('button', { name: 'Associate' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Disassociate' })
    ).toBeInTheDocument();
  });

  test('offers neither to a viewer who may not grant the membership', async () => {
    // An organization admin, but of none this user is confined to.
    renderList(
      { me: { id: 9, is_superuser: false }, adminOrgCount: 1 },
      listedUser(false)
    );
    await screen.findByText('Foo');
    expect(
      screen.queryByRole('button', { name: 'Associate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disassociate' })
    ).not.toBeInTheDocument();
  });

  test('offers neither to a viewer who runs no organization', async () => {
    renderList({ me: { id: 9, is_superuser: false }, adminOrgCount: 0 });
    await screen.findByText('Foo');
    expect(
      screen.queryByRole('button', { name: 'Associate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disassociate' })
    ).not.toBeInTheDocument();
  });

  test('takes every role the user holds there, leaving the organization alone', async () => {
    vi.mocked(UsersAPI.disassociateRole).mockResolvedValue(
      {} as unknown as ResponseOf<typeof UsersAPI.disassociateRole>
    );
    // The user holds Member and Admin in Qux (roles 21 and 20).
    vi.mocked(UsersAPI.readRoles).mockResolvedValue({
      data: { results: [{ id: 20 }, { id: 21 }], count: 2 },
    } as unknown as ResponseOf<typeof UsersAPI.readRoles>);
    const { user } = renderList();
    const row = (await screen.findByText('Qux')).closest('tr')!;

    await user.click(within(row).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    expect(
      await screen.findByText('Disassociate the user from these organizations?')
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm Disassociate' })
    );

    await waitFor(() =>
      expect(UsersAPI.disassociateRole).toHaveBeenCalledTimes(2)
    );
    // Asked only about the organization's own roles, and took those held.
    expect(UsersAPI.readRoles).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ id__in: '20,21' })
    );
    expect(UsersAPI.disassociateRole).toHaveBeenCalledWith('1', 20);
    expect(UsersAPI.disassociateRole).toHaveBeenCalledWith('1', 21);
    expect(OrganizationsAPI.destroy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(UsersAPI.readOrganizations).toHaveBeenCalledTimes(2)
    );
    await settleTooltips();
  });

  test('refuses to remove a membership the viewer may not manage', async () => {
    vi.mocked(UsersAPI.readOrganizations).mockResolvedValue({
      data: { results: [organization(1, 'Foo', 11, false)], count: 1 },
    } as unknown as ResponseOf<typeof UsersAPI.readOrganizations>);
    const { user } = renderList();
    const row = (await screen.findByText('Foo')).closest('tr')!;

    await user.click(within(row).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Disassociate' })).toBeDisabled();
  });
});
