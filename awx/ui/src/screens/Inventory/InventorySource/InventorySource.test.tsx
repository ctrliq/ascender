import type {
  Inventory,
  InventorySource as InventorySourceModel,
} from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InventoriesAPI, OrganizationsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockInventorySourceJson from '../shared/data.inventory_source.json';
import InventorySource from './InventorySource';

vi.mock('../../../api/models/Inventories');
vi.mock('../../../api/models/Organizations');
vi.mock('../../../api/models/InventorySources');

/** The fixture as the screen takes it, which is what the api sends. */
const mockInventorySource =
  mockInventorySourceJson as unknown as InventorySourceModel;

const mockInventory = {
  id: 2,
  name: 'Mock Inventory',
} as unknown as Inventory;

// InventorySource reads :sourceId via useParams and uses relative routes, so
// mount it under its real ".../sources/:sourceId/*" parent route at a concrete
// URL.
function renderInventorySource(initialEntry: string, props = {}) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/inventory/:id/sources/:sourceId/*"
        element={
          <InventorySource
            inventory={mockInventory}
            me={{ is_system_auditor: false }}
            setBreadcrumb={() => {}}
            {...props}
          />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventorySource />', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.readSourceDetail).mockResolvedValue({
      ...mockInventorySource,
    });
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { results: [{ id: 1, name: 'isNotifAdmin' }] },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render expected tabs', async () => {
    renderInventorySource('/inventories/inventory/2/sources/123/details');
    await screen.findByRole('tab', { name: 'Details' });
    const expectedTabs = [
      'Back to Sources',
      'Details',
      'Schedules',
      'Notifications',
    ];
    expectedTabs.forEach((name) =>
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    );
  });

  test('should show content error when api throws error on initial render', async () => {
    vi.mocked(InventoriesAPI.readSourceDetail).mockRejectedValueOnce(
      new Error()
    );
    renderInventorySource('/inventories/inventory/2/sources/123/details');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderInventorySource('/inventories/inventory/2/sources/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });

  test('should call api', async () => {
    renderInventorySource('/inventories/inventory/2/sources/123/details');
    await waitFor(() =>
      expect(InventoriesAPI.readSourceDetail).toHaveBeenCalledWith(2, '123')
    );
    expect(OrganizationsAPI.read).toHaveBeenCalled();
  });

  test('should not render notifications tab', async () => {
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { results: [] },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    renderInventorySource('/inventories/inventory/2/sources/123/details');
    await screen.findByRole('tab', { name: 'Details' });
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });
});
