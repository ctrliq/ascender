import React from 'react';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import Users from './Users';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useRouteMatch: () => ({
    path: 'users',
  }),
}));

describe('<Users />', () => {
  test('should set breadcrumbs', () => {
    const wrapper = mountWithContexts(<Users />);

    const header = wrapper.find('ScreenHeader');
    expect(header.prop('streamType')).toBe('user');
    expect(header.prop('breadcrumbConfig')).toEqual({
      '/users': 'Users',
      '/users/add': 'Create New User',
    });
  });
});
