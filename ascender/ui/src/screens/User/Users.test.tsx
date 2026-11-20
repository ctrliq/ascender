import type { ScreenHeaderProps } from 'components/ScreenHeader/ScreenHeader';
import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Users from './Users';

vi.mock('../../api/models/Users');

// resetMocks: true strips vi.fn implementations between tests, so capture
// the props with a plain function instead of asserting on mock.calls.
let mockScreenHeaderProps: ScreenHeaderProps | undefined;
vi.mock('components/ScreenHeader/ScreenHeader', () => ({
  __esModule: true,
  default: (props: ScreenHeaderProps) => {
    mockScreenHeaderProps = props;
    return null;
  },
}));

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
vi.mock('./UserList/UserList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'UsersList'),
  };
});
vi.mock('./UserAdd/UserAdd', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'UserAdd'),
  };
});
// The breadcrumb a test wants the detail subtree to report, if any.
let mockBreadcrumbArgs: unknown[] | undefined;
vi.mock('./User', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  function MockUser({
    setBreadcrumb,
  }: {
    setBreadcrumb: (...args: unknown[]) => void;
  }) {
    ReactLib.useEffect(() => {
      if (mockBreadcrumbArgs) {
        setBreadcrumb(...mockBreadcrumbArgs);
      }
    }, [setBreadcrumb]);
    return ReactLib.createElement('div', null, 'User detail');
  }
  return { __esModule: true, default: MockUser };
});

function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/users/*" element={<Users />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<Users />', () => {
  beforeEach(() => {
    mockScreenHeaderProps = undefined;
    mockBreadcrumbArgs = undefined;
  });

  test('renders the list and sets the breadcrumb config at /users', async () => {
    renderAt('/users');
    expect(await screen.findByText('UsersList')).toBeInTheDocument();
    expect(mockScreenHeaderProps?.streamType).toBe('user');
    expect(mockScreenHeaderProps?.breadcrumbConfig).toEqual({
      '/users': 'Users',
      '/users/add': 'Create New User',
    });
  });

  test('renders the add form at /users/add', async () => {
    renderAt('/users/add');
    expect(await screen.findByText('UserAdd')).toBeInTheDocument();
    expect(screen.queryByText('UsersList')).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /users/:id', async () => {
    renderAt('/users/1/details');
    expect(await screen.findByText('User detail')).toBeInTheDocument();
    expect(screen.queryByText('UsersList')).not.toBeInTheDocument();
  });

  /*
   * The api gives a token no name, so the crumb names it the way the token
   * list does: by its application, or as a personal access token.
   */
  test("names a token's crumb after its application", async () => {
    mockBreadcrumbArgs = [
      { id: 1, username: 'alex' },
      { id: 5, summary_fields: { application: { id: 3, name: 'hg' } } },
    ];
    renderAt('/users/1/tokens/5/details');
    await screen.findByText('User detail');
    expect(
      mockScreenHeaderProps?.breadcrumbConfig['/users/1/tokens/5/details']
    ).toBe('hg');
  });

  test("names a personal token's crumb as such", async () => {
    mockBreadcrumbArgs = [
      { id: 1, username: 'alex' },
      { id: 5, summary_fields: { application: null } },
    ];
    renderAt('/users/1/tokens/5/details');
    await screen.findByText('User detail');
    expect(
      mockScreenHeaderProps?.breadcrumbConfig['/users/1/tokens/5/details']
    ).toBe('Personal Access Token');
  });
});
