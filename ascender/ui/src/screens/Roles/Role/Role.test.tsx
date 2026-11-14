import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { RolesAPI, UsersAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { createMemoryHistory } from '../../../../testUtils/historyShim';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import Role from './Role';

vi.mock('../../../api/models/Roles');
vi.mock('../../../api/models/Users');

describe('<Role />', () => {
  beforeEach(() => {
    vi.mocked(RolesAPI.read).mockResolvedValue({
      data: {
        count: 1,
        results: [{ id: 3, name: 'Admin', description: '' }],
      },
    } as unknown as ResponseOf<typeof RolesAPI.read>);
    vi.mocked(UsersAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof UsersAPI.read>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * A role is picked from its kind's tab of the list, so Back to Roles opens
   * the list on that tab rather than on the first one.
   */
  test("goes back to the list on the role's kind", async () => {
    const history = createMemoryHistory({
      initialEntries: ['/roles/credential/admin_role/details'],
    });
    const { user } = renderWithContexts(
      <Routes>
        <Route
          path="/roles/:model/:roleField/*"
          element={<Role setBreadcrumb={vi.fn()} />}
        />
        <Route path="/roles/:model" element={null} />
      </Routes>,
      { context: { router: { history } } }
    );

    await user.click(await screen.findByRole('tab', { name: /Back to Roles/ }));
    await waitFor(() =>
      expect(history.location.pathname).toBe('/roles/credential')
    );
  });

  function renderAt(path: string) {
    const history = createMemoryHistory({ initialEntries: [path] });
    return renderWithContexts(
      <Routes>
        <Route
          path="/roles/:model/:roleField/*"
          element={<Role setBreadcrumb={vi.fn()} />}
        />
      </Routes>,
      { context: { router: { history } } }
    );
  }

  test('an unknown kind is not found, rather than a tab named after it', async () => {
    renderAt('/roles/bogus/admin_role/details');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View all Roles.' })
    ).toHaveAttribute('href', '/roles');
    expect(RolesAPI.read).not.toHaveBeenCalled();
  });

  /*
   * An address below the role that it has no view for is not found, and no
   * tab claims it: not Details, and not Back to Roles.
   */
  test('an unknown view of a role leaves no tab active', async () => {
    renderAt('/roles/credential/admin_role/bogus');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    const selected = screen
      .getAllByRole('tab')
      .filter((tab) => tab.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(0);
  });
});
