import React from 'react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Users from './Users';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useRouteMatch: () => ({
    path: 'users',
  }),
}));

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

describe('<Users />', () => {
  beforeEach(() => {
    mockScreenHeaderProps = undefined;
  });

  test('should set breadcrumbs', () => {
    renderWithContexts(<Users />);

    const props = mockScreenHeaderProps;
    expect(props.streamType).toBe('user');
    expect(props.breadcrumbConfig).toEqual({
      '/users': 'Users',
      '/users/add': 'Create New User',
    });
  });
});
