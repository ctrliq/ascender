import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import UserTokens from './UserTokens';

jest.mock('../../../api');
jest.mock('../UserTokenAdd', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ onSuccessfulAdd }) =>
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            onSuccessfulAdd({
              expires: '3020-03-28T14:26:48.099297Z',
              token: 'foobar',
              refresh_token: 'aaaaaaaaaaaaaaaaaaaaaaaaaa',
            }),
        },
        'simulate successful add'
      ),
  };
});

describe('<UserTokens />', () => {
  test('shows Application information modal after successful creation', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/users/1/tokens/add'],
    });
    const { user } = renderWithContexts(
      <Routes>
        <Route path="/users/:id/tokens/*" element={<UserTokens />} />
      </Routes>,
      {
        context: { router: { history } },
      }
    );
    expect(
      screen.queryByRole('dialog', { name: /Token information/ })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'simulate successful add' })
    );
    // PF Modal's aria-labelledby includes the modal box itself, so the
    // computed accessible name is longer than the title — match on substring.
    expect(
      await screen.findByRole('dialog', { name: /Token information/ })
    ).toBeInTheDocument();
  });
});
