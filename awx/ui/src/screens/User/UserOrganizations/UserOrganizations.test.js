import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import UserOrganizations from './UserOrganizations';

jest.mock('./UserOrganizationList', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('div', null, 'UserOrganizationList'),
  };
});

describe('<UserOrganizations />', () => {
  test('should render UserOrganizationList', () => {
    renderWithContexts(<UserOrganizations />);
    expect(screen.getByText('UserOrganizationList')).toBeInTheDocument();
  });
});
