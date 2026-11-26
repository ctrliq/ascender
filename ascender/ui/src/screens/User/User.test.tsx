import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { UsersAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockDetails from './data.user.json';
import User from './User';

vi.mock('../../api');

// Mount under the same /users/:id/* route that Users.js gives it, so the
// nested v6 <Routes> resolve and useParams sees the id.
function renderUser(initialEntry: string, props = {}) {
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
    vi.mocked(UsersAPI.readDetail).mockResolvedValue({
      data: mockDetails,
    } as unknown as ResponseOf<typeof UsersAPI.readDetail>);
    vi.mocked(UsersAPI.read).mockResolvedValue({
      data: { count: 1, results: [mockDetails] },
    } as unknown as ResponseOf<typeof UsersAPI.read>);
  });

  test('initially renders successfully', async () => {
    renderUser('/users/1');
    expect(
      await screen.findByRole('tab', { name: 'Details' })
    ).toBeInTheDocument();
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
    // No tab claims an address it has no view for, Back to Users included.
    const selected = screen
      .getAllByRole('tab')
      .filter((tab) => tab.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(0);
  });

  test('does not say Not Found while the user is still loading', async () => {
    vi.mocked(UsersAPI.readDetail).mockReturnValue(
      new Promise(() => {}) as ReturnType<typeof UsersAPI.readDetail>
    );
    renderUser('/users/1/details');
    await waitFor(() => expect(UsersAPI.readDetail).toHaveBeenCalled());
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
  });
});
