import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { UsersAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockDetails from './data.user.json';
import User from './User';

jest.mock('../../api');

// Mount under the same /users/:id/* route that Users.js gives it, so the
// nested v6 <Routes> resolve and useParams sees the id.
function renderUser(initialEntry, props = {}) {
  const history = createMemoryHistory({
    initialEntries: [initialEntry],
  });
  return renderWithContexts(
    <Routes>
      <Route
        path="/users/:id/*"
        element={<User setBreadcrumb={() => {}} {...props} />}
      />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<User />', () => {
  beforeEach(() => {
    UsersAPI.readDetail.mockResolvedValue({ data: mockDetails });
    UsersAPI.read.mockResolvedValue({
      data: { count: 1, results: [mockDetails] },
    });
  });

  test('initially renders successfully', async () => {
    renderUser('/users/1');
    expect(await screen.findByRole('tab', { name: 'Details' })).toBeInTheDocument();
  });

  test('tabs shown for users', async () => {
    renderUser('/users/1', { me: { id: 1 } });
    await screen.findByRole('tab', { name: 'Details' });

    expect(screen.getAllByRole('tab')).toHaveLength(6);
    expect(screen.getByRole('tab', { name: 'Tokens' })).toBeInTheDocument();
  });

  test('should not show Tokens tab', async () => {
    renderUser('/users/1', { me: { id: 2 } });
    await screen.findByRole('tab', { name: 'Details' });

    expect(
      screen.queryByRole('tab', { name: 'Tokens' })
    ).not.toBeInTheDocument();
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderUser('/users/1/foobar');

    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });
});
