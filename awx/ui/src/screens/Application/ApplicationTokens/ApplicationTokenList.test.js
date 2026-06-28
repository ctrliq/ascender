import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';

import { ApplicationsAPI, TokensAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ApplicationTokenList from './ApplicationTokenList';

jest.mock('../../../api/models/Applications');
jest.mock('../../../api/models/Tokens');

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
    ApplicationsAPI.readTokenOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should have data fetched and render 2 rows', async () => {
    ApplicationsAPI.readTokens.mockResolvedValue(tokens);

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
    ApplicationsAPI.readTokens.mockResolvedValue(tokens);
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
    ApplicationsAPI.readTokens.mockResolvedValue(tokens);
    TokensAPI.destroy.mockResolvedValue({});

    const { user } = renderWithContexts(<ApplicationTokenList />);
    await screen.findAllByRole('link', { name: 'admin' });

    const row = screen
      .getAllByRole('link', { name: 'admin' })[0]
      .closest('tr');
    const checkbox = within(row).getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(TokensAPI.destroy).toHaveBeenCalledWith(tokens.data.results[0].id)
    );
  });

  test('should throw content error', async () => {
    ApplicationsAPI.readTokens.mockRejectedValue(
      new Error({
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
    ApplicationsAPI.readTokens.mockResolvedValue(tokens);
    TokensAPI.destroy.mockRejectedValue(
      new Error({
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
      .getAllByRole('link', { name: 'admin' })[0]
      .closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(
      await screen.findByText('Error deleting tokens')
    ).toBeInTheDocument();
    // the error modal includes an ErrorDetail with an expandable "Details" toggle
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  test('should not render add button', async () => {
    ApplicationsAPI.readTokens.mockResolvedValue(tokens);

    renderWithContexts(<ApplicationTokenList />);
    await screen.findAllByRole('link', { name: 'admin' });

    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });
});
