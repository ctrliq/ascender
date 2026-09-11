import type { Untyped } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Organizations from './Organizations';

vi.mock('../../api/models/Organizations');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
vi.mock('./OrganizationList/OrganizationList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'OrganizationList'),
  };
});
vi.mock('./OrganizationAdd/OrganizationAdd', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'OrganizationAdd'),
  };
});
vi.mock('./Organization', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'Organization detail'),
  };
});

function renderAt(path: Untyped) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/organizations/*" element={<Organizations />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<Organizations />', () => {
  test('renders the list at /organizations', async () => {
    renderAt('/organizations');
    expect(await screen.findByText('OrganizationList')).toBeInTheDocument();
  });

  test('renders the add form at /organizations/add', async () => {
    renderAt('/organizations/add');
    expect(await screen.findByText('OrganizationAdd')).toBeInTheDocument();
    expect(screen.queryByText('OrganizationList')).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /organizations/:id', async () => {
    renderAt('/organizations/1/details');
    expect(await screen.findByText('Organization detail')).toBeInTheDocument();
    expect(screen.queryByText('OrganizationList')).not.toBeInTheDocument();
  });
});
