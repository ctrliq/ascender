import type { Host, Inventory } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { HostsAPI, InventoriesAPI, UnifiedJobsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockHost from '../shared/data.host.json';
import AdvancedInventoryHost from './AdvancedInventoryHost';

vi.mock('../../../api');

const mockSmartInventory = {
  id: 1234,
  name: 'Mock Smart Inventory',
} as unknown as Inventory;

// AdvancedInventoryHost reads :inventoryType/:hostId via useParams and renders
// a nested v6 route tree, so mount it under its real parent route at a concrete
// URL.
function renderAt(url: string) {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/hosts/:hostId/*"
        element={
          <AdvancedInventoryHost
            inventory={mockSmartInventory}
            setBreadcrumb={() => {}}
          />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<AdvancedInventoryHost />', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.readHostDetail).mockResolvedValue(
      mockHost as unknown as Host
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render expected tabs', async () => {
    renderAt('/inventories/smart_inventory/1234/hosts/2/details');
    await screen.findByRole('tab', { name: 'Details' });
    expect(
      screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())
    ).toEqual(['Back to Hosts', 'Details', 'Facts', 'Runs']);
  });

  test('facts tab reads the host facts', async () => {
    vi.mocked(HostsAPI.readFacts).mockResolvedValue({
      data: { ansible_hostname: 'host-a' },
    } as unknown as ResponseOf<typeof HostsAPI.readFacts>);
    renderAt('/inventories/smart_inventory/1234/hosts/2/facts');
    await waitFor(() =>
      expect(HostsAPI.readFacts).toHaveBeenCalledWith(mockHost.id)
    );
  });

  test('runs tab lists the host runs, with a run on this host', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(UnifiedJobsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.readOptions>);
    renderAt('/inventories/smart_inventory/1234/hosts/2/runs');
    await waitFor(() =>
      expect(UnifiedJobsAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({ job__hosts: mockHost.id })
      )
    );
    expect(
      await screen.findByRole('button', { name: 'Run' })
    ).toBeInTheDocument();
  });

  test('sends the old jobs address on to the runs tab', async () => {
    vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
    vi.mocked(UnifiedJobsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof UnifiedJobsAPI.readOptions>);
    const { history } = renderAt(
      '/inventories/smart_inventory/1234/hosts/2/jobs'
    );
    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/inventories/smart_inventory/1234/hosts/2/runs'
      )
    );
    expect(
      screen.queryByText(/view smart inventory host details/i)
    ).not.toBeInTheDocument();
  });

  test('should show content error when api throws error on initial render', async () => {
    vi.mocked(InventoriesAPI.readHostDetail).mockRejectedValueOnce(new Error());
    renderAt('/inventories/smart_inventory/1234/hosts/2/details');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderAt('/inventories/smart_inventory/1234/hosts/2/foobar');
    await waitFor(() =>
      expect(
        screen.getByText(/view smart inventory host details/i)
      ).toBeInTheDocument()
    );
  });

  // Each kind of inventory this screen serves is named for what it is.
  test.each([
    ['constructed_inventory', 'View Constructed Inventory Host Details'],
    ['federated_inventory', 'View Federated Inventory Host Details'],
  ])('names a %s on its not found link', async (inventoryType, text) => {
    renderAt(`/inventories/${inventoryType}/1234/hosts/2/foobar`);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
