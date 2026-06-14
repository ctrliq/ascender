import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { UsersAPI, TokensAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import UserTokenList from './UserTokenList';

jest.mock('../../../api/models/Users');
jest.mock('../../../api/models/Tokens');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({
    search: '',
  }),
}));
// the component reads useParams from react-router-dom-v5-compat (v6 route tree)
jest.mock('react-router-dom-v5-compat', () => ({
  ...jest.requireActual('react-router-dom-v5-compat'),
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

async function selectThirdTokenAndDelete(user) {
  // the third token is the one described as 'fgds' (title-cased to 'Fgds') (id 3)
  const row = screen.getByText('Fgds').closest('tr');
  await user.click(within(row).getByRole('checkbox'));

  const deleteButton = screen.getByRole('button', { name: 'Delete' });
  expect(deleteButton).not.toBeDisabled();
  await user.click(deleteButton);
  await user.click(
    await screen.findByRole('button', { name: 'confirm delete' })
  );
}

describe('<UserTokenList />', () => {
  let user;

  beforeEach(async () => {
    UsersAPI.readTokens.mockResolvedValue(tokens);
    UsersAPI.readTokenOptions.mockResolvedValue({
      data: { related_search_fields: [] },
    });

    ({ user } = renderWithContexts(<UserTokenList />));
    await screen.findByText('Fgds');
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
    TokensAPI.destroy.mockResolvedValueOnce({});

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await selectThirdTokenAndDelete(user);

    await waitFor(() => expect(TokensAPI.destroy).toHaveBeenCalledWith(3));
  });

  test('should show error dialog when deletion fails', async () => {
    TokensAPI.destroy.mockRejectedValueOnce(
      new Error({
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
