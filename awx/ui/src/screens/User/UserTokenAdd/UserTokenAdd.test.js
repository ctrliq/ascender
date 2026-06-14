import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { UsersAPI, TokensAPI, ApplicationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserTokenAdd from './UserTokenAdd';

jest.mock('../../../api');
jest.mock('react-router-dom-v5-compat', () => ({
  ...jest.requireActual('react-router-dom-v5-compat'),
  useParams: () => ({ id: 1 }),
}));

describe('<UserTokenAdd />', () => {
  let onSuccessfulAdd;

  beforeEach(() => {
    onSuccessfulAdd = jest.fn();
    ApplicationsAPI.read.mockResolvedValue({
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
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function selectApplication(user) {
    await user.click(await screen.findByRole('button', { name: 'Search' }));
    await user.click(await screen.findByText('app'));
    await user.click(screen.getByRole('button', { name: 'Select' }));
  }

  test('handleSubmit should post to api', async () => {
    UsersAPI.createToken.mockResolvedValueOnce({ data: { id: 1 } });
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
    UsersAPI.createToken.mockResolvedValueOnce({
      data: rtnData,
    });
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
    TokensAPI.create.mockResolvedValueOnce({
      data: rtnData,
    });
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
