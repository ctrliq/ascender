import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { UsersAPI, TokensAPI } from 'api';
import { ConfigContext } from 'contexts/Config';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { TestUser } from '../../../../testUtils/rtlContexts';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import UserTokenList from './UserTokenList';

vi.mock('../../../api/models/Users');
vi.mock('../../../api/models/Tokens');

vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useLocation: () => ({
    search: '',
  }),
  useParams: () => ({
    id: 1,
  }),
}));

const tokens = {
  data: {
    results: [
      {
        id: 1,
        type: 'o_auth2_access_token',
        url: '/api/v2/tokens/1/',
        related: {
          user: '/api/v2/users/1/',
          application: '/api/v2/applications/1/',
          activity_stream: '/api/v2/tokens/1/activity_stream/',
        },
        summary_fields: {
          user: {
            id: 1,
            username: 'admin',
            first_name: '',
            last_name: '',
          },
          application: {
            id: 1,
            name: 'app',
          },
        },
        created: '2020-06-23T15:06:43.188634Z',
        modified: '2020-06-23T15:06:43.224151Z',
        description: '',
        user: 1,
        token: '************',
        refresh_token: '************',
        application: 1,
        expires: '3019-10-25T15:06:43.182788Z',
        scope: 'read',
      },
      {
        id: 2,
        type: 'o_auth2_access_token',
        url: '/api/v2/tokens/2/',
        related: {
          user: '/api/v2/users/1/',
          application: '/api/v2/applications/3/',
          activity_stream: '/api/v2/tokens/2/activity_stream/',
        },
        summary_fields: {
          user: {
            id: 1,
            username: 'admin',
            first_name: '',
            last_name: '',
          },
          application: {
            id: 3,
            name: 'hg',
          },
        },
        created: '2020-06-23T19:56:38.422053Z',
        modified: '2020-06-23T19:56:38.441353Z',
        description: 'cdfsg',
        user: 1,
        token: '************',
        refresh_token: '************',
        application: 3,
        expires: '3019-10-25T19:56:38.395635Z',
        scope: 'read',
      },
      {
        id: 3,
        type: 'o_auth2_access_token',
        url: '/api/v2/tokens/3/',
        related: {
          user: '/api/v2/users/1/',
          application: '/api/v2/applications/3/',
          activity_stream: '/api/v2/tokens/3/activity_stream/',
        },
        summary_fields: {
          user: {
            id: 1,
            username: 'admin',
            first_name: '',
            last_name: '',
          },
          application: {
            id: 3,
            name: 'hg',
          },
        },
        created: '2020-06-23T19:56:50.536169Z',
        modified: '2020-06-23T19:56:50.549521Z',
        description: 'fgds',
        user: 1,
        token: '************',
        refresh_token: '************',
        application: 3,
        expires: '3019-10-25T19:56:50.529306Z',
        scope: 'write',
      },
    ],
    count: 3,
  },
};

async function selectThirdTokenAndDelete(user: TestUser) {
  // the third token is the one described as 'fgds' (id 3)
  const row = screen.getByText('fgds').closest('tr');
  await user.click(within(row!).getByRole('checkbox'));

  const deleteButton = screen.getByRole('button', { name: 'Delete' });
  expect(deleteButton).not.toBeDisabled();
  await user.click(deleteButton);
  await user.click(
    await screen.findByRole('button', { name: 'confirm delete' })
  );
}

describe('<UserTokenList />', () => {
  let user: TestUser;

  beforeEach(async () => {
    vi.mocked(UsersAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof UsersAPI.readTokens>
    );
    vi.mocked(UsersAPI.readTokenOptions).mockResolvedValue({
      data: { related_search_fields: [] },
    } as unknown as ResponseOf<typeof UsersAPI.readTokenOptions>);

    ({ user } = renderWithContexts(<UserTokenList />));
    await screen.findByText('fgds');
  });

  test('should mount properly, and fetch tokens', () => {
    expect(UsersAPI.readTokens).toHaveBeenCalledWith(1, {
      order_by: 'application__name',
      page: 1,
      page_size: 20,
    });
  });

  test('delete button should be disabled', () => {
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('should select and then delete item properly', async () => {
    vi.mocked(TokensAPI.destroy).mockResolvedValueOnce(
      {} as unknown as ResponseOf<typeof TokensAPI.destroy>
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await selectThirdTokenAndDelete(user);

    await waitFor(() => expect(TokensAPI.destroy).toHaveBeenCalledWith(3));
  });

  test('should show error dialog when deletion fails', async () => {
    vi.mocked(TokensAPI.destroy).mockRejectedValueOnce(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/tokens',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await selectThirdTokenAndDelete(user);

    await waitFor(() => expect(TokensAPI.destroy).toHaveBeenCalledWith(3));
    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    // closing the modal refocuses the Tooltip-wrapped toolbar Delete button
    await settleTooltips();
  });
});

describe('<UserTokenList /> for other viewers', () => {
  beforeEach(() => {
    vi.mocked(UsersAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof UsersAPI.readTokens>
    );
    vi.mocked(UsersAPI.readTokenOptions).mockResolvedValue({
      data: { related_search_fields: [] },
    } as unknown as ResponseOf<typeof UsersAPI.readTokenOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * A token is always made for whoever asks for it, so a superuser on someone
   * else's list is not offered Add, while the owner is.
   */
  test('offers Add only on the viewer own tokens', async () => {
    const { unmount } = renderWithContexts(<UserTokenList />, {
      context: { config: { me: { id: 2, is_superuser: true } } },
    });
    await screen.findByText('fgds');
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
    unmount();

    renderWithContexts(<UserTokenList />, {
      context: { config: { me: { id: 1 } } },
    });
    await screen.findByText('fgds');
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });

  /*
   * Tokens carry no user_capabilities, so the list asks what the api asks: a
   * viewer who is neither a superuser, the owner, nor an organization admin
   * cannot delete the token.
   */
  test('does not let a viewer who may not delete the token do so', async () => {
    const { user } = renderWithContexts(<UserTokenList />, {
      context: { config: { me: { id: 2 }, adminOrgCount: 0 } },
    });
    await screen.findByText('fgds');

    const row = screen.getByText('fgds').closest('tr');
    await user.click(within(row!).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await settleTooltips();
  });

  /*
   * The read is cached by the list's address, so whether a token may be
   * deleted is worked out as the list renders: a viewer who comes to
   * administer an organization is offered the deletion without a reload.
   */
  test('updates what may be deleted when the viewer changes', async () => {
    const { user, rerender } = renderWithContexts(
      <ConfigContext.Provider value={{ me: { id: 2 }, adminOrgCount: 0 }}>
        <UserTokenList />
      </ConfigContext.Provider>
    );
    await screen.findByText('fgds');
    const row = screen.getByText('fgds').closest('tr');
    await user.click(within(row!).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    rerender(
      <ConfigContext.Provider value={{ me: { id: 2 }, adminOrgCount: 1 }}>
        <UserTokenList />
      </ConfigContext.Provider>
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    );
    await settleTooltips();
  });
});
