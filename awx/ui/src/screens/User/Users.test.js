import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Users from './Users';

jest.mock('../../api/models/Users');

// resetMocks: true strips jest.fn implementations between tests, so capture
// the props with a plain function instead of asserting on mock.calls.
let mockScreenHeaderProps;
jest.mock('components/ScreenHeader/ScreenHeader', () => ({
  __esModule: true,
  default: (props) => {
    mockScreenHeaderProps = props;
    return null;
  },
}));

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('./UserList/UserList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'UsersList'),
  };
});
jest.mock('./UserAdd/UserAdd', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'UserAdd'),
  };
});
jest.mock('./User', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'User detail'),
  };
});

function renderAt(path) {
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
  });

  test('renders the list and sets the breadcrumb config at /users', async () => {
    renderAt('/users');
    expect(await screen.findByText('UsersList')).toBeInTheDocument();
    expect(mockScreenHeaderProps.streamType).toBe('user');
    expect(mockScreenHeaderProps.breadcrumbConfig).toEqual({
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
});
