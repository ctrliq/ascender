import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import HostListItem from './HostListItem';

describe('HostListItem', () => {
  const mockInventory = {
    id: 1,
    type: 'inventory',
    name: 'Foo',
    description: 'Buzz',
    summary_fields: {
      inventory: {
        name: 'Bar',
      },
    },
  };
  test('initially renders successfully', () => {
    renderWithContexts(
      <table>
        <tbody>
          <HostListItem item={mockInventory} />
        </tbody>
      </table>
    );
    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Foo');
    expect(cells[1]).toHaveTextContent('Buzz');
    expect(cells[2]).toHaveTextContent('Bar');
  });
});
