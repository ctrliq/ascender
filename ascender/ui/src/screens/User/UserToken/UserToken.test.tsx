import type { User } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { TokensAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserToken from './UserToken';

vi.mock('../../../api/models/Tokens');

vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useParams: () => ({
    id: 1,
    tokenId: 2,
  }),
}));

describe('<UserToken/>', () => {
  const user = {
    id: 1,
    type: 'user',
    url: '/api/v2/users/1/',
    summary_fields: {
      user_capabilities: {
        edit: true,
        delete: false,
      },
    },
    created: '2020-06-19T12:55:13.138692Z',
    username: 'admin',
    first_name: 'Alex',
    last_name: 'Corey',
    email: 'a@g.com',
  };

  beforeEach(() => {
    vi.mocked(TokensAPI.readDetail).mockResolvedValue({
      data: {
        id: 2,
        type: 'o_auth2_access_token',
        url: '/api/v2/tokens/2/',
        summary_fields: {
          user: {
            id: 1,
            username: 'admin',
            first_name: 'Alex',
            last_name: 'Corey',
          },
          application: {
            id: 3,
            name: 'hg',
          },
        },
        created: '2020-06-23T19:56:38.422053Z',
        modified: '2020-06-23T19:56:38.441353Z',
        description: 'cdfsg',
        scope: 'read',
      },
    } as unknown as ResponseOf<typeof TokensAPI.readDetail>);
  });

  test('should render token tabs', async () => {
    renderWithContexts(
      <UserToken setBreadcrumb={vi.fn()} user={user as unknown as User} />
    );

    expect(
      await screen.findByRole('tab', { name: 'Details' })
    ).toBeInTheDocument();
  });

  test('should call api for token details', async () => {
    renderWithContexts(
      <UserToken setBreadcrumb={vi.fn()} user={user as unknown as User} />
    );

    await screen.findByRole('tab', { name: 'Details' });
    expect(TokensAPI.readDetail).toHaveBeenCalledWith(2);
  });

  test("links a missing token back to this user's tokens", async () => {
    vi.mocked(TokensAPI.readDetail).mockRejectedValue(
      Object.assign(new Error('Not found'), {
        response: {
          config: { method: 'get', url: '/api/v2/tokens/2/' },
          data: 'Not found',
          status: 404,
        },
      })
    );
    renderWithContexts(
      <UserToken setBreadcrumb={vi.fn()} user={user as unknown as User} />
    );

    expect(
      await screen.findByRole('link', { name: 'View all Tokens.' })
    ).toHaveAttribute('href', '/users/1/tokens');
  });

  /*
   * Back to Tokens returns to where the token was opened from: the user's own
   * list for their token, an application's Tokens tab for someone else's.
   */
  describe('Back to Tokens', () => {
    const goBack = async (
      config: Record<string, unknown>,
      entry: string | { pathname: string; state?: unknown }
    ) => {
      const history = createMemoryHistory({ initialEntries: [entry] });
      const { user: events } = renderWithContexts(
        <UserToken setBreadcrumb={vi.fn()} user={user as unknown as User} />,
        { context: { config, router: { history } } }
      );
      await events.click(
        await screen.findByRole('tab', { name: /Back to Tokens/ })
      );
      return history;
    };

    test("returns to the user's tokens for the viewer's own token", async () => {
      const history = await goBack(
        { me: { id: 1, is_superuser: true } },
        '/users/1/tokens/2/details'
      );
      await waitFor(() =>
        expect(history.location.pathname).toBe('/users/1/tokens')
      );
    });

    test('returns to the application for a token of someone else', async () => {
      const history = await goBack(
        { me: { id: 5, is_superuser: true } },
        '/users/1/tokens/2/details'
      );
      await waitFor(() =>
        expect(history.location.pathname).toBe('/applications/3/tokens')
      );
    });

    test('returns where the application list says it came from', async () => {
      const history = await goBack(
        { me: { id: 1, is_superuser: true } },
        {
          pathname: '/users/1/tokens/2/details',
          state: { backTo: '/applications/3/tokens' },
        }
      );
      await waitFor(() =>
        expect(history.location.pathname).toBe('/applications/3/tokens')
      );
    });
  });

  test('does not say Not Found while the token is still loading', async () => {
    vi.mocked(TokensAPI.readDetail).mockReturnValue(
      new Promise(() => {}) as ReturnType<typeof TokensAPI.readDetail>
    );
    renderWithContexts(
      <UserToken setBreadcrumb={vi.fn()} user={user as unknown as User} />
    );
    await waitFor(() => expect(TokensAPI.readDetail).toHaveBeenCalled());
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
  });
});
