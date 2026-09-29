import type {
  Inventory,
  InventorySource as InventorySourceModel,
} from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import {
  InventoriesAPI,
  InventorySourcesAPI,
  OrganizationsAPI,
  UnifiedJobsAPI,
} from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockInventorySourceJson from '../shared/data.inventory_source.json';
import InventorySource from './InventorySource';

vi.mock('../../../api/models/Inventories');
vi.mock('../../../api/models/Organizations');
vi.mock('../../../api/models/InventorySources');
vi.mock('../../../api/models/UnifiedJobs');

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
    // The same order as a template's or a project's tabs.
    expect(
      screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())
    ).toEqual([
      'Back to Sources',
      'Details',
      'Notifications',
      'Schedules',
      'Runs',
    ]);
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

  describe('runs tab', () => {
    beforeEach(() => {
      vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
        data: { count: 0, results: [] },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
      vi.mocked(UnifiedJobsAPI.readOptions).mockResolvedValue({
        data: { actions: { GET: {} }, related_search_fields: [] },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.readOptions>);
      vi.mocked(InventorySourcesAPI.readOptions).mockResolvedValue({
        data: { actions: { GET: {} } },
      } as unknown as ResponseOf<typeof InventorySourcesAPI.readOptions>);
    });

    test('offers a sync of this source to whoever may start one', async () => {
      const { user } = renderInventorySource(
        '/inventories/inventory/2/sources/123/runs'
      );
      const button = await screen.findByRole('button', { name: 'Run' });
      // Sync Source, as the row and the details of a source say.
      await user.hover(button);
      expect(await screen.findByText('Sync Source')).toBeInTheDocument();
    });

    test('offers no run control, not the general menu, to whoever may not', async () => {
      vi.mocked(InventoriesAPI.readSourceDetail).mockResolvedValue({
        ...mockInventorySource,
        summary_fields: {
          ...mockInventorySource.summary_fields,
          user_capabilities: {
            ...mockInventorySource.summary_fields.user_capabilities,
            start: false,
          },
        },
      } as InventorySourceModel);
      renderInventorySource('/inventories/inventory/2/sources/123/runs');
      await waitFor(() => expect(UnifiedJobsAPI.read).toHaveBeenCalled());
      await screen.findByRole('tab', { name: 'Runs' });
      expect(
        screen.queryByRole('button', { name: 'Run' })
      ).not.toBeInTheDocument();
    });
  });
});
