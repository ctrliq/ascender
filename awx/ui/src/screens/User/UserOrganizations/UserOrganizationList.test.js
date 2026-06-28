import React from 'react';
import { Routes, Route } from 'react-router';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { UsersAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import UserOrganizationList from './UserOrganizationList';

jest.mock('../../../api/models/Users');

describe('<UserOrganizationlist />', () => {
  let history;

  beforeEach(async () => {
    history = createMemoryHistory({
      initialEntries: ['/users/1/organizations'],
    });
    UsersAPI.readOrganizations.mockResolvedValue({
      data: {
        results: [
          {
            name: 'Foo',
            id: 1,
            description: 'Bar',
            url: '/api/v2/organizations/1/',
          },
        ],
        count: 1,
      },
    });
    UsersAPI.readOrganizationOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    renderWithContexts(
      <Routes>
        <Route
          path="/users/:id/organizations"
          element={<UserOrganizationList />}
        />
      </Routes>,
      {
        context: {
          router: {
            history,
          },
        },
      }
    );
    await screen.findByText('Foo');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('successfully mounts', async () => {
    expect(screen.getByText('Foo')).toBeInTheDocument();
    expect(screen.getByText('Bar')).toBeInTheDocument();
  });

  test('calls api to get organizations', () => {
    expect(UsersAPI.readOrganizations).toHaveBeenCalledWith('1', {
      order_by: 'name',
      page: 1,
      page_size: 20,
      type: 'organization',
    });
    expect(UsersAPI.readOrganizationOptions).toHaveBeenCalledWith('1');
  });
});
