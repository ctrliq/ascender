import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';

import { ApplicationsAPI, TokensAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import ApplicationTokenList from './ApplicationTokenList';

vi.mock('../../../api/models/Applications');
vi.mock('../../../api/models/Tokens');

const tokens = {
  data: {
    results: [
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
    count: 2,
  },
};

describe('<ApplicationTokenList/>', () => {
  beforeEach(() => {
    vi.mocked(ApplicationsAPI.readTokenOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof ApplicationsAPI.readTokenOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should have data fetched and render 2 rows', async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );

    renderWithContexts(<ApplicationTokenList />);

    expect(await screen.findAllByRole('link', { name: 'admin' })).toHaveLength(
      2
    );
    expect(ApplicationsAPI.readTokens).toHaveBeenCalled();
  });

  // Regression: the application id must come from the v6 route params. When the
  // route tree moved to v6 <Routes>, reading useParams from plain react-router-dom
  // returned {} and tokens were fetched for /applications/undefined/tokens.
  test('fetches tokens for the application id from the v6 route params', async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );
    const history = createMemoryHistory({
      initialEntries: ['/applications/5/tokens'],
    });

    renderWithContexts(
      <Routes>
        <Route
          path="/applications/:id/tokens/*"
          element={<ApplicationTokenList />}
        />
      </Routes>,
      { context: { router: { history } } }
    );

    await waitFor(() =>
      expect(ApplicationsAPI.readTokens).toHaveBeenCalledWith(
        '5',
        expect.any(Object)
      )
    );
  });

  test('should delete item successfully', async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );
    vi.mocked(TokensAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof TokensAPI.destroy>
    );

    const { user } = renderWithContexts(<ApplicationTokenList />);
    await screen.findAllByRole('link', { name: 'admin' });

    const row = screen
      .getAllByRole('link', { name: 'admin' })[0]!
      .closest('tr');
    const checkbox = within(row!).getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(TokensAPI.destroy).toHaveBeenCalledWith(tokens.data.results[0]!.id)
    );
  });

  test('should throw content error', async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'get',
            url: '/api/v2/applications/',
          },
          data: 'An error occurred',
        },
      })
    );

    renderWithContexts(<ApplicationTokenList />);

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should render deletion error modal', async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );
    vi.mocked(TokensAPI.destroy).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/tokens/',
          },
          data: 'An error occurred',
        },
      })
    );

    const { user } = renderWithContexts(<ApplicationTokenList />);
    await screen.findAllByRole('link', { name: 'admin' });

    const row = screen
      .getAllByRole('link', { name: 'admin' })[0]!
      .closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    expect(
      screen.getByText('Failed to delete one or more tokens.')
    ).toBeInTheDocument();
    // the error modal includes an ErrorDetail with an expandable "Details" toggle
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  test("adds a token for this application through the viewer's own form", async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );
    const history = createMemoryHistory({
      initialEntries: ['/applications/3/tokens'],
    });
    const { user } = renderWithContexts(
      <ApplicationTokenList application={{ id: 3, name: 'hg' }} />,
      {
        context: {
          router: { history },
          config: { me: { id: 7, is_superuser: false } },
        },
      }
    );
    await screen.findAllByText('admin');

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(history.location.pathname).toBe('/users/7/tokens/add');
    expect(history.location.state).toEqual({
      application: { id: 3, name: 'hg' },
    });
  });

  test('offers no Add to somebody the api does not let make a token', async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );
    vi.mocked(ApplicationsAPI.readTokenOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof ApplicationsAPI.readTokenOptions>);

    renderWithContexts(
      <ApplicationTokenList application={{ id: 3, name: 'hg' }} />,
      { context: { config: { me: { id: 7 } } } }
    );
    await screen.findAllByText('admin');

    expect(
      screen.queryByRole('button', { name: 'Add' })
    ).not.toBeInTheDocument();
  });

  test('names the columns the rows show', async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );
    renderWithContexts(<ApplicationTokenList />);
    await screen.findAllByRole('link', { name: 'admin' });

    ['Username', 'Scope', 'Expires'].forEach((name) => {
      expect(
        screen.getByRole('columnheader', { name: new RegExp(name) })
      ).toBeInTheDocument();
    });
  });

  /*
   * An application has no token page of its own, so a row opens the token
   * under its owner, which only the owner or a superuser can always reach.
   */
  test("links a row to the token under its owner's tokens", async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );
    renderWithContexts(<ApplicationTokenList />);

    const [link] = await screen.findAllByRole('link', { name: 'admin' });
    expect(link).toHaveAttribute('href', '/users/1/tokens/2/details');
  });

  test('leaves a row unlinked for someone who cannot open the token', async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );
    renderWithContexts(<ApplicationTokenList />, {
      context: { config: { me: { id: 7, is_superuser: false } } },
    });

    expect(await screen.findAllByText('admin')).toHaveLength(2);
    expect(
      screen.queryByRole('link', { name: 'admin' })
    ).not.toBeInTheDocument();
  });

  /*
   * Tokens carry no user_capabilities, so the list asks what the api asks:
   * someone who is neither a superuser nor the owner may delete another
   * user's token only as an admin of this application's organization, which
   * is what the application's own delete capability says. Administering some
   * other organization is not enough.
   */
  test('offers deletion only to those the api lets delete the token', async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );
    const { user, unmount } = renderWithContexts(
      <ApplicationTokenList
        application={{
          id: 3,
          name: 'hg',
          summary_fields: { user_capabilities: { delete: false } },
        }}
      />,
      {
        context: {
          config: { me: { id: 7, is_superuser: false }, adminOrgCount: 1 },
        },
      }
    );
    const [cell] = await screen.findAllByText('admin');
    await user.click(within(cell!.closest('tr')!).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await settleTooltips();
    unmount();

    const { user: orgAdmin } = renderWithContexts(
      <ApplicationTokenList
        application={{
          id: 3,
          name: 'hg',
          summary_fields: { user_capabilities: { delete: true } },
        }}
      />,
      {
        context: {
          config: { me: { id: 7, is_superuser: false }, adminOrgCount: 1 },
        },
      }
    );
    const [adminCell] = await screen.findAllByText('admin');
    await orgAdmin.click(
      within(adminCell!.closest('tr')!).getByRole('checkbox')
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    await settleTooltips();
  });

  /*
   * The read is cached by the list's address, and the application arrives
   * after it on the way in, so its capability is weighed as the list renders
   * rather than inside the read.
   */
  test('updates what may be deleted once the application is known', async () => {
    vi.mocked(ApplicationsAPI.readTokens).mockResolvedValue(
      tokens as unknown as ResponseOf<typeof ApplicationsAPI.readTokens>
    );
    const context = {
      context: {
        config: { me: { id: 7, is_superuser: false }, adminOrgCount: 0 },
      },
    };
    const { user, rerender } = renderWithContexts(
      <ApplicationTokenList application={null} />,
      context
    );
    const [cell] = await screen.findAllByText('admin');
    await user.click(within(cell!.closest('tr')!).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    rerender(
      <ApplicationTokenList
        application={{
          id: 3,
          name: 'hg',
          summary_fields: { user_capabilities: { delete: true } },
        }}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    );
    await settleTooltips();
  });
});
