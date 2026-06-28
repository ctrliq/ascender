import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockHost from '../shared/data.host.json';
import AdvancedInventoryHosts from './AdvancedInventoryHosts';

jest.mock('../../../api');

// Mock the leaf list so we only assert routing/dispatch here.
jest.mock('./AdvancedInventoryHostList', () => {
  const AdvancedInventoryHostList = () => (
    <div aria-label="mock-advanced-host-list" />
  );
  return { __esModule: true, default: AdvancedInventoryHostList };
});

// AdvancedInventoryHosts uses relative routes; mount it under its v6 parent.
function renderUnder(initialEntry, props) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/hosts/*"
        element={<AdvancedInventoryHosts {...props} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<AdvancedInventoryHosts />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render smart inventory host list', () => {
    renderUnder('/inventories/smart_inventory/1/hosts', {
      inventory: { id: 1 },
    });
    expect(
      screen.getByLabelText('mock-advanced-host-list')
    ).toBeInTheDocument();
  });

  test('should render smart inventory host details', async () => {
    InventoriesAPI.readHostDetail.mockResolvedValue({ ...mockHost });
    renderUnder('/inventories/smart_inventory/1/hosts/2', {
      inventory: { id: 1 },
      setBreadcrumb: () => {},
    });
    // the host detail dispatcher renders RoutedTabs once the host loads
    expect(
      await screen.findByRole('tab', { name: 'Details' })
    ).toBeInTheDocument();
  });
});
