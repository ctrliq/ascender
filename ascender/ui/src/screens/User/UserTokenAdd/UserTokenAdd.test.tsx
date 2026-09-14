import type { Mock } from 'vitest';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { UsersAPI, TokensAPI, ApplicationsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { TestUser } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserTokenAdd from './UserTokenAdd';

vi.mock('../../../api');
vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useParams: () => ({ id: 1 }),
}));

describe('<UserTokenAdd />', () => {
  let onSuccessfulAdd: Mock;

  beforeEach(() => {
    onSuccessfulAdd = vi.fn();
    vi.mocked(ApplicationsAPI.read).mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            name: 'app',
            description: '',
            url: '/api/v2/applications/1/',
          },
        ],
      },
    } as unknown as ResponseOf<typeof ApplicationsAPI.read>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function selectApplication(user: TestUser) {
    await user.click(await screen.findByRole('button', { name: 'Search' }));
    await user.click(await screen.findByText('app'));
    await user.click(screen.getByRole('button', { name: 'Select' }));
  }

  test('handleSubmit should post to api', async () => {
    vi.mocked(UsersAPI.createToken).mockResolvedValueOnce({
      data: { id: 1 },
    } as unknown as ResponseOf<typeof UsersAPI.createToken>);
    const { user } = renderWithContexts(
      <UserTokenAdd onSuccessfulAdd={onSuccessfulAdd} />
    );

    await selectApplication(user);
    await user.type(screen.getByLabelText('Description'), 'foo');
    await user.selectOptions(screen.getByLabelText('Select Input'), 'read');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(UsersAPI.createToken).toHaveBeenCalledWith(1, {
        application: 1,
        description: 'foo',
        scope: 'read',
      })
    );
  });

  test('should navigate to tokens list when cancel is clicked', async () => {
    const history = createMemoryHistory({});
    const { user } = renderWithContexts(
      <UserTokenAdd onSuccessfulAdd={onSuccessfulAdd} />,
      {
        context: { router: { history } },
      }
    );

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toEqual('/users/1/tokens');
  });

  test('successful form submission with application', async () => {
    const history = createMemoryHistory({});
    const rtnData = {
      id: 2,
      token: 'abc',
      refresh_token: 'def',
      expires: '3020-03-28T14:26:48.099297Z',
    };
    vi.mocked(UsersAPI.createToken).mockResolvedValueOnce({
      data: rtnData,
    } as unknown as ResponseOf<typeof UsersAPI.createToken>);
    const { user } = renderWithContexts(
      <UserTokenAdd onSuccessfulAdd={onSuccessfulAdd} />,
      {
        context: { router: { history } },
      }
    );

    await selectApplication(user);
    await user.selectOptions(screen.getByLabelText('Select Input'), 'read');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual('/users/1/tokens/2/details')
    );
    expect(onSuccessfulAdd).toHaveBeenCalledWith(rtnData);
  });

  test('successful form submission without application', async () => {
    const history = createMemoryHistory({});
    const rtnData = {
      id: 2,
      token: 'abc',
      refresh_token: null,
      expires: '3020-03-28T14:26:48.099297Z',
    };
    vi.mocked(TokensAPI.create).mockResolvedValueOnce({
      data: rtnData,
    } as unknown as ResponseOf<typeof TokensAPI.create>);
    const { user } = renderWithContexts(
      <UserTokenAdd onSuccessfulAdd={onSuccessfulAdd} />,
      {
        context: { router: { history } },
      }
    );

    await user.selectOptions(
      await screen.findByLabelText('Select Input'),
      'read'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual('/users/1/tokens/2/details')
    );
    expect(onSuccessfulAdd).toHaveBeenCalledWith(rtnData);
  });
});
