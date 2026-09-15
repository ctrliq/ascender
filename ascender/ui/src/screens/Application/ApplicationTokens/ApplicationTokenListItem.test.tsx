import React from 'react';
import { screen, within } from '@testing-library/react';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ApplicationTokenListItem from './ApplicationTokenListItem';

describe('<ApplicationTokenListItem/>', () => {
  const token = {
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
  };

  function renderItem(props = {}) {
    return renderWithContexts(
      <table>
        <tbody>
          <ApplicationTokenListItem
            token={token}
            detailUrl="/users/2/details"
            isSelected={false}
            onSelect={() => {}}
            rowIndex={1}
            {...props}
          />
        </tbody>
      </table>
    );
  }

  test('should mount successfully', () => {
    renderItem();
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  test('should render the proper data', () => {
    renderItem();
    const row = screen.getByRole('row');
    const cells = within(row).getAllByRole('cell');
    const nameCell = cells.find(
      (cell) => cell.getAttribute('data-label') === 'Name'
    );
    const scopeCell = cells.find(
      (cell) => cell.getAttribute('data-label') === 'Scope'
    );
    const expiresCell = cells.find(
      (cell) => cell.getAttribute('data-label') === 'Expires'
    );
    expect(nameCell).toHaveTextContent('admin');
    expect(scopeCell).toHaveTextContent('Read');
    expect(expiresCell).toHaveTextContent('10/25/3019, 7:56:38 PM');
  });

  test('should be checked', () => {
    renderItem({ isSelected: true });
    expect(within(screen.getByRole('row')).getByRole('checkbox')).toBeChecked();
  });
});
