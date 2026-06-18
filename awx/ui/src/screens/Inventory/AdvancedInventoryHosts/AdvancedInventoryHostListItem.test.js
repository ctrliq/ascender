import React from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import AdvancedInventoryHostListItem from './AdvancedInventoryHostListItem';

const mockHost = {
  id: 2,
  name: 'Host Two',
  url: '/api/v2/hosts/2',
  inventory: 1,
  summary_fields: {
    inventory: {
      id: 1,
      name: 'Inv 1',
    },
    user_capabilities: {
      edit: true,
    },
    recent_jobs: [],
  },
};

describe('<AdvancedInventoryHostListItem />', () => {
  test('should render expected row cells', () => {
    renderWithContexts(
      <table>
        <tbody>
          <AdvancedInventoryHostListItem
            detailUrl="/inventories/smart_inventory/1/hosts/2"
            host={mockHost}
            isSelected={false}
            onSelect={() => {}}
            rowIndex={0}
            inventoryType="smart_inventory"
          />
        </tbody>
      </table>
    );

    const nameLink = screen.getByRole('link', { name: 'Host Two' });
    expect(nameLink).toHaveAttribute(
      'href',
      '/inventories/smart_inventory/1/hosts/2'
    );

    const inventoryCell = screen
      .getByRole('cell', { name: 'Inv 1' });
    expect(
      within(inventoryCell).getByRole('link', { name: 'Inv 1' })
    ).toBeInTheDocument();
  });
});
