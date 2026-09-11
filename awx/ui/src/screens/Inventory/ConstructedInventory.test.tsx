import type { Untyped } from 'types/api';
import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { screen, within } from '@testing-library/react';
import { ConstructedInventoriesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockInventory from './shared/data.inventory.json';
import ConstructedInventory from './ConstructedInventory';

vi.mock('../../api');

// ConstructedInventory reads the id from useParams, so mount it under its v6
// parent route at a concrete URL rather than mocking the router.
function renderAt(initialEntry: Untyped) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/*"
        element={<ConstructedInventory setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<ConstructedInventory />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render expected tabs', async () => {
    vi.mocked(ConstructedInventoriesAPI.readDetail).mockResolvedValue({
      data: { ...mockInventory, kind: 'constructed' },
    } as unknown as ResponseOf<typeof ConstructedInventoriesAPI.readDetail>);
    const expectedTabs = [
      'Back to Inventories',
      'Details',
      'Access',
      'Hosts',
      'Groups',
      'Jobs',
      'Job Templates',
    ];
    renderAt('/inventories/constructed_inventory/1/details');
    const tablist = await screen.findByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(expectedTabs.length);
    expectedTabs.forEach((label) => {
      expect(within(tablist).getByText(label)).toBeInTheDocument();
    });
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    vi.mocked(ConstructedInventoriesAPI.readDetail).mockResolvedValue({
      data: { ...mockInventory, kind: 'constructed' },
    } as unknown as ResponseOf<typeof ConstructedInventoriesAPI.readDetail>);
    renderAt('/inventories/constructed_inventory/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });
});
