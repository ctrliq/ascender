import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserTokenListItem from './UserTokenListItem';

const token = {
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
      name: 'Foobar app',
    },
  },
  created: '2020-06-23T15:06:43.188634Z',
  modified: '2020-06-23T15:06:43.224151Z',
  description: 'foobar-token',
  user: 1,
  token: '************',
  refresh_token: '************',
  application: 1,
  expires: '3019-10-25T15:06:43.182788Z',
  scope: 'read',
};

describe('<UserTokenListItem />', () => {
  test('should mount properly', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserTokenListItem token={token} rowIndex={0} />
        </tbody>
      </table>
    );
    expect(screen.getByRole('row')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Foobar app' })).toBeInTheDocument();
  });

  test('should render application access token row properly', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserTokenListItem isSelected={false} token={token} rowIndex={0} />
        </tbody>
      </table>
    );
    expect(
      screen.getByRole('checkbox', { name: 'Select row 0' })
    ).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'Foobar app' })).toBeInTheDocument();
    expect(screen.getByText('Foobar-token')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('10/25/3019, 3:06:43 PM')).toBeInTheDocument();
  });

  test('should render personal access token row properly', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserTokenListItem
            isSelected={false}
            token={{
              ...token,
              refresh_token: null,
              application: null,
              scope: 'write',
              summary_fields: {
                user: token.summary_fields.user,
              },
            }}
            rowIndex={0}
          />
        </tbody>
      </table>
    );
    expect(
      screen.getByRole('checkbox', { name: 'Select row 0' })
    ).not.toBeChecked();
    expect(
      screen.getByRole('link', { name: 'Personal access token' })
    ).toBeInTheDocument();
    expect(screen.getByText('Foobar-token')).toBeInTheDocument();
    expect(screen.getByText('Write')).toBeInTheDocument();
    expect(screen.getByText('10/25/3019, 3:06:43 PM')).toBeInTheDocument();
  });

  test('should be checked', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserTokenListItem isSelected token={token} rowIndex={0} />
        </tbody>
      </table>
    );
    expect(screen.getByRole('checkbox', { name: 'Select row 0' })).toBeChecked();
  });
});
