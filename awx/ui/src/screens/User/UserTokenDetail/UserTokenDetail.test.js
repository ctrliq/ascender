import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { TokensAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import UserTokenDetail from './UserTokenDetail';

jest.mock('../../../api/models/Tokens');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({
    id: 1,
    tokenId: 2,
  }),
}));

describe('<UserTokenDetail/>', () => {
  const token = {
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
  };

  test('should render properly', () => {
    renderWithContexts(<UserTokenDetail token={token} />);

    assertDetail('Application', 'hg');
    assertDetail('Description', 'cdfsg');
    assertDetail('Scope', 'Read');
    assertDetail('Created', '6/23/2020, 7:56:38 PM');
    assertDetail('Last Modified', '6/23/2020, 7:56:38 PM');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('should delete token properly', async () => {
    TokensAPI.destroy.mockResolvedValueOnce({});
    const { user } = renderWithContexts(<UserTokenDetail token={token} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    await waitFor(() => expect(TokensAPI.destroy).toHaveBeenCalledWith(2));
  });

  test('should display error on failed deletion', async () => {
    TokensAPI.destroy.mockRejectedValueOnce(
      new Error({
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/tokens',
          },
          data: 'An error occurred',
          status: 400,
        },
      })
    );
    const { user } = renderWithContexts(<UserTokenDetail token={token} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    await waitFor(() => expect(TokensAPI.destroy).toHaveBeenCalledWith(2));
    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });
});
