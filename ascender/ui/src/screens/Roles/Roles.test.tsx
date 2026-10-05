import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Roles from './Roles';

vi.mock('./RoleList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'RoleList'),
  };
});

// A role page that names itself, as the real one does once its role is read,
// and links back to the list on its kind.
vi.mock('./Role', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  const { Link } =
    await vi.importActual<typeof import('react-router')>('react-router');
  function MockRole({
    setBreadcrumb,
  }: {
    setBreadcrumb: (crumb: {
      model: string;
      roleField: string;
      name: string;
    }) => void;
  }) {
    ReactLib.useEffect(() => {
      setBreadcrumb({ model: 'team', roleField: 'admin_role', name: 'Admin' });
    }, [setBreadcrumb]);
    return ReactLib.createElement(Link, { to: '/roles/team' }, 'Back');
  }
  return { __esModule: true, default: MockRole };
});

describe('<Roles />', () => {
  test('offers no activity stream, which files grants elsewhere', async () => {
    const history = createMemoryHistory({ initialEntries: ['/roles/team'] });
    renderWithContexts(
      <Routes>
        <Route path="/roles/*" element={<Roles />} />
      </Routes>,
      { context: { router: { history } } }
    );
    expect(await screen.findByText('RoleList')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'View Activity Stream' })
    ).not.toBeInTheDocument();
  });

  test('titles the list Roles on a kind, whether or not a role was opened first', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/roles/team/admin_role/details'],
    });
    const { user } = renderWithContexts(
      <Routes>
        <Route path="/roles/*" element={<Roles />} />
      </Routes>,
      { context: { router: { history } } }
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Admin' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back' }));
    expect(await screen.findByText('RoleList')).toBeInTheDocument();
    // The same title the list has when /roles/team is opened directly.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Roles' })
    ).toBeInTheDocument();
  });
});
