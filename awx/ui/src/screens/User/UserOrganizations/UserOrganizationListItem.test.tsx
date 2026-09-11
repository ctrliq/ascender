import React from 'react';
import { screen } from '@testing-library/react';
import type { Organization } from 'types/api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import UserOrganizationListItem from './UserOrganizationListItem';

describe('<UserOrganizationListItem />', () => {
  test('mounts correctly', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserOrganizationListItem
            organization={
              {
                name: 'foo',
                id: 1,
                description: 'Bar',
              } as unknown as Organization
            }
          />
        </tbody>
      </table>
    );
    expect(screen.getByRole('row')).toBeInTheDocument();
  });
  test('render correct information', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserOrganizationListItem
            organization={
              {
                name: 'foo',
                id: 1,
                description: 'Bar',
              } as unknown as Organization
            }
          />
        </tbody>
      </table>
    );
    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('foo');
    expect(cells[1]).toHaveTextContent('Bar');
    expect(screen.getByRole('link', { name: 'foo' })).toHaveAttribute(
      'href',
      '/organizations/1/details'
    );
  });
});
