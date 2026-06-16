import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryListItem from './InventoryListItem';

jest.mock('../../../api/models/Inventories');

const baseInventory = {
  id: 1,
  name: 'Inventory',
  kind: '',
  has_active_failures: true,
  total_hosts: 10,
  hosts_with_active_failures: 4,
  has_inventory_sources: true,
  total_inventory_sources: 4,
  inventory_sources_with_failures: 5,
  summary_fields: {
    organization: {
      id: 1,
      name: 'Default',
    },
    user_capabilities: {
      edit: true,
    },
  },
};

function renderItem(inventory) {
  return renderWithContexts(
    <table>
      <tbody>
        <InventoryListItem
          inventory={inventory}
          detailUrl="/inventories/inventory/1"
          isSelected
          onSelect={() => {}}
          rowIndex={0}
        />
      </tbody>
    </table>
  );
}

describe('<InventoryListItem />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', () => {
    renderItem(baseInventory);
    expect(screen.getByRole('link', { name: 'Inventory' })).toBeInTheDocument();
  });

  test('should render not configured tooltip', async () => {
    const { user } = renderItem({
      ...baseInventory,
      has_inventory_sources: false,
    });
    await user.hover(screen.getByText('Disabled'));
    expect(
      await screen.findByText('Not configured for inventory sync.')
    ).toBeInTheDocument();
  });

  test('should render success tooltip', async () => {
    const { user } = renderItem({
      ...baseInventory,
      inventory_sources_with_failures: 0,
    });
    await user.hover(screen.getByText('Success'));
    expect(
      await screen.findByText('No inventory sync failures.')
    ).toBeInTheDocument();
  });

  test('should render prompt list item data', () => {
    renderItem(baseInventory);
    const row = screen.getByRole('link', { name: 'Inventory' }).closest('tr');
    const cells = within(row).getAllByRole('cell');
    const nameCell = cells.find((c) => c.getAttribute('data-label') === 'Name');
    const statusCell = cells.find(
      (c) => c.getAttribute('data-label') === 'Status'
    );
    const typeCell = cells.find((c) => c.getAttribute('data-label') === 'Type');
    const orgCell = cells.find(
      (c) => c.getAttribute('data-label') === 'Organization'
    );
    expect(nameCell).toHaveTextContent('Inventory');
    expect(statusCell).toHaveTextContent('Error');
    expect(typeCell).toHaveTextContent('Inventory');
    expect(orgCell).toHaveTextContent('Default');
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem(baseInventory);
    expect(
      screen.getByRole('link', { name: 'Edit Inventory' })
    ).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem({
      id: 1,
      name: 'Inventory',
      summary_fields: {
        organization: { id: 1, name: 'Default' },
        user_capabilities: { edit: false },
      },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit Inventory' })
    ).not.toBeInTheDocument();
  });

  test('should call api to copy inventory', async () => {
    InventoriesAPI.copy.mockResolvedValue();

    const { user } = renderWithContexts(
      <table>
        <tbody>
          <InventoryListItem
            inventory={{
              id: 1,
              name: 'Inventory',
              summary_fields: {
                organization: { id: 1, name: 'Default' },
                user_capabilities: { edit: false, copy: true },
              },
            }}
            detailUrl="/inventories/inventory/1"
            isSelected
            onSelect={() => {}}
            onCopy={() => {}}
            fetchInventories={() => {}}
            rowIndex={0}
          />
        </tbody>
      </table>
    );

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(InventoriesAPI.copy).toHaveBeenCalled());
  });

  test('should render proper alert modal on copy error', async () => {
    InventoriesAPI.copy.mockRejectedValue(new Error());

    const { user } = renderWithContexts(
      <table>
        <tbody>
          <InventoryListItem
            inventory={{
              id: 1,
              name: 'Inventory',
              summary_fields: {
                organization: { id: 1, name: 'Default' },
                user_capabilities: { edit: false, copy: true },
              },
            }}
            detailUrl="/inventories/inventory/1"
            isSelected
            onSelect={() => {}}
            onCopy={() => {}}
            fetchInventories={() => {}}
            rowIndex={0}
          />
        </tbody>
      </table>
    );
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  test('should not render copy button', () => {
    renderItem({
      id: 1,
      name: 'Inventory',
      summary_fields: {
        organization: { id: 1, name: 'Default' },
        user_capabilities: { edit: false, copy: false },
      },
    });
    expect(
      screen.queryByRole('button', { name: 'Copy' })
    ).not.toBeInTheDocument();
  });
});
