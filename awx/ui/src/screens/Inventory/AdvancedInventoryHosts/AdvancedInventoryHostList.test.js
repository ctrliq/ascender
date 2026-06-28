import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import AdvancedInventoryHostList from './AdvancedInventoryHostList';
import mockInventory from '../shared/data.inventory.json';
import mockHosts from '../shared/data.hosts.json';

jest.mock('../../../api');

const clonedInventory = {
  ...mockInventory,
  summary_fields: {
    ...mockInventory.summary_fields,
    user_capabilities: {
      ...mockInventory.summary_fields.user_capabilities,
    },
  },
};

function renderList(inventory = clonedInventory) {
  const history = createMemoryHistory({
    initialEntries: ['/inventories/smart_inventory/1/hosts'],
  });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/hosts"
        element={<AdvancedInventoryHostList inventory={inventory} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<AdvancedInventoryHostList />', () => {
  beforeEach(() => {
    InventoriesAPI.readHosts.mockResolvedValue({ data: mockHosts });
    InventoriesAPI.readAdHocOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {
            module_name: {
              choices: [
                ['command', 'command'],
                ['shell', 'shell'],
              ],
            },
          },
          POST: {},
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch hosts from api and render them in the list', async () => {
    renderList();
    await screen.findAllByRole('link', { name: /dummy/ });
    expect(InventoriesAPI.readHosts).toHaveBeenCalled();
    // three hosts each render a selectable row checkbox
    expect(screen.getAllByRole('checkbox', { name: /select row/i })).toHaveLength(
      3
    );
  });

  test('should select and deselect all items', async () => {
    const { user } = renderList();
    await screen.findAllByRole('link', { name: /dummy/ });
    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen.getAllByRole('checkbox', {
      name: /select row/i,
    });

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
  });

  test('should show content error when api throws an error', async () => {
    InventoriesAPI.readHosts.mockRejectedValue(new Error());
    renderList(mockInventory);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
