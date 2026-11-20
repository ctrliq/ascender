import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { screen, within } from '@testing-library/react';
import { ConstructedInventoriesAPI, JobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockInventory from './shared/data.inventory.json';
import ConstructedInventory from './ConstructedInventory';

vi.mock('../../api');

// ConstructedInventory reads the id from useParams, so mount it under its v6
// parent route at a concrete URL rather than mocking the router.
function renderAt(initialEntry: string) {
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
      'Groups',
      'Hosts',
      'Job Templates',
      'Runs',
    ];
    renderAt('/inventories/constructed_inventory/1/details');
    const tablist = await screen.findByRole('tablist');
    // Groups before Hosts, as on a regular inventory.
    expect(
      within(tablist)
        .getAllByRole('tab')
        .map((tab) => tab.textContent?.trim())
    ).toEqual(expectedTabs);
  });

  test('job templates tab fills in this inventory for a new template', async () => {
    vi.mocked(ConstructedInventoriesAPI.readDetail).mockResolvedValue({
      data: { ...mockInventory, kind: 'constructed' },
    } as unknown as ResponseOf<typeof ConstructedInventoriesAPI.readDetail>);
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {}, POST: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>);
    renderAt('/inventories/constructed_inventory/1/job_templates');

    const add = await screen.findByRole('link', { name: 'Add' });
    expect(add.getAttribute('href')).toContain(
      `resource_name=${encodeURIComponent(mockInventory.name)}`
    );
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    vi.mocked(ConstructedInventoriesAPI.readDetail).mockResolvedValue({
      data: { ...mockInventory, kind: 'constructed' },
    } as unknown as ResponseOf<typeof ConstructedInventoriesAPI.readDetail>);
    renderAt('/inventories/constructed_inventory/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });
});
