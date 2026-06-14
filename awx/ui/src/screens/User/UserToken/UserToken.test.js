import React from 'react';
import { screen } from '@testing-library/react';
import { TokensAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserToken from './UserToken';

jest.mock('../../../api/models/Tokens');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
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
    TokensAPI.readDetail.mockResolvedValue({
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
    });
  });

  test('should render token tabs', async () => {
    renderWithContexts(<UserToken setBreadcrumb={jest.fn()} user={user} />);

    expect(
      await screen.findByRole('tab', { name: 'Details' })
    ).toBeInTheDocument();
  });

  test('should call api for token details', async () => {
    renderWithContexts(<UserToken setBreadcrumb={jest.fn()} user={user} />);

    await screen.findByRole('tab', { name: 'Details' });
    expect(TokensAPI.readDetail).toHaveBeenCalledWith(2);
  });
});
