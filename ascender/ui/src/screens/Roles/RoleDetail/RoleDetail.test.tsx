import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { RolesAPI, UsersAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { createMemoryHistory } from '../../../../testUtils/historyShim';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import RoleDetail from './RoleDetail';

vi.mock('../../../api/models/Roles');
vi.mock('../../../api/models/Users');

function mockRole(count = 64) {
  vi.mocked(RolesAPI.read).mockResolvedValue({
    data: {
      count,
      results: [
        {
          id: 3,
          name: 'Admin',
          description: 'Can manage all aspects of the job template',
        },
      ],
    },
  } as unknown as ResponseOf<typeof RolesAPI.read>);
  vi.mocked(UsersAPI.read).mockResolvedValue({
    data: { count: 1, results: [{ id: 2, username: 'jane' }] },
  } as unknown as ResponseOf<typeof UsersAPI.read>);
}

async function renderDetail(path = '/roles/jobtemplate/admin_role/details') {
  const history = createMemoryHistory({ initialEntries: [path] });
  const utils = renderWithContexts(
    <Routes>
      <Route path="/roles/:model/:roleField/details" element={<RoleDetail />} />
    </Routes>,
    { context: { router: { history } } }
  );
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  );
  return utils;
}

describe('<RoleDetail />', () => {
  beforeEach(() => {
    mockRole();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should say what the role is and what carries it', async () => {
    await renderDetail();

    expect(await screen.findByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Job Templates')).toBeInTheDocument();
    expect(
      screen.getByText('Can manage all aspects of the job template')
    ).toBeInTheDocument();
  });

  test('should ask for a system role without a kind of object', async () => {
    await renderDetail('/roles/system/system_administrator/details');

    await waitFor(() =>
      expect(RolesAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({
          content_type__isnull: 'true',
          role_field: 'system_administrator',
        })
      )
    );
    // Nothing carries a system role, so no table of what does, on any tab.
    expect(document.querySelector('table')).toBeNull();
  });

  /*
   * An address naming a role the api does not have, a mistyped role field for
   * one, says so and offers the way back rather than leaving an empty card.
   */
  test('should say a role that does not exist was not found', async () => {
    vi.mocked(RolesAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof RolesAPI.read>);

    await renderDetail('/roles/jobtemplate/no_such_role/details');

    expect(
      await screen.findByRole('link', { name: 'View all Roles.' })
    ).toHaveAttribute('href', '/roles');
  });
});
