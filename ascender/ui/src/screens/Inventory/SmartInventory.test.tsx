import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { act, screen, waitFor, within } from '@testing-library/react';
import { InventoriesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockSmartInventory from './shared/data.smart_inventory.json';
import SmartInventory from './SmartInventory';

vi.mock('../../api');

// SmartInventory uses relative routes and reads the id from useParams, so mount
// it under its v6 parent route at a concrete URL.
function renderAt(initialEntry: string) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const rendered = renderWithContexts(
    <Routes>
      <Route
        path="/inventories/smart_inventory/:id/*"
        element={<SmartInventory setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
  return { ...rendered, history };
}

describe('<SmartInventory />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockReads() {
    vi.mocked(InventoriesAPI.readDetail).mockResolvedValue({
      data: mockSmartInventory,
    } as unknown as ResponseOf<typeof InventoriesAPI.readDetail>);
    vi.mocked(InventoriesAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: true } },
    } as unknown as ResponseOf<typeof InventoriesAPI.readOptions>);
    vi.mocked(InventoriesAPI.readInstanceGroups).mockResolvedValue({
      data: { results: [] },
    } as unknown as ResponseOf<typeof InventoriesAPI.readInstanceGroups>);
  }

  /*
   * What the edit form draws with is read by this screen, so the form has one
   * loading state, but only on the edit route: not with every change of tab.
   */
  test('does not read what the edit form draws with on other tabs', async () => {
    mockReads();
    const { history } = renderAt('/inventories/smart_inventory/1/details');
    await screen.findByRole('tablist');

    act(() => history.push('/inventories/smart_inventory/1/foobar'));
    await screen.findByText('Not Found');
    act(() => history.push('/inventories/smart_inventory/1/details'));
    await waitFor(() =>
      expect(InventoriesAPI.readDetail).toHaveBeenCalledTimes(3)
    );

    expect(InventoriesAPI.readOptions).not.toHaveBeenCalled();
    // The details read the groups themselves, by the inventory's own id; the
    // screen's read for the form goes by the id in the address.
    expect(InventoriesAPI.readInstanceGroups).not.toHaveBeenCalledWith('1');
  });

  test('reads what the edit form draws with on the edit route', async () => {
    mockReads();
    renderAt('/inventories/smart_inventory/1/edit');

    await waitFor(() =>
      expect(InventoriesAPI.readInstanceGroups).toHaveBeenCalledWith('1')
    );
    // The form's own lookups read options too, so only that it was read.
    expect(InventoriesAPI.readOptions).toHaveBeenCalled();
  });

  test('keeps the page on screen while a change of tab re-reads it', async () => {
    mockReads();
    const { history } = renderAt('/inventories/smart_inventory/1/details');
    await screen.findByRole('tablist');

    // The next read never answers, so the page is caught mid-read.
    vi.mocked(InventoriesAPI.readDetail).mockReturnValue(
      new Promise(() => {}) as ReturnType<typeof InventoriesAPI.readDetail>
    );
    act(() => history.push('/inventories/smart_inventory/1/job_templates'));
    await waitFor(() =>
      expect(InventoriesAPI.readDetail).toHaveBeenCalledTimes(2)
    );

    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  test('should render expected tabs', async () => {
    vi.mocked(InventoriesAPI.readDetail).mockResolvedValue({
      data: mockSmartInventory,
    } as unknown as ResponseOf<typeof InventoriesAPI.readDetail>);
    vi.mocked(InventoriesAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: true } },
    } as unknown as ResponseOf<typeof InventoriesAPI.readOptions>);
    vi.mocked(InventoriesAPI.readInstanceGroups).mockResolvedValue({
      data: { results: [] },
    } as unknown as ResponseOf<typeof InventoriesAPI.readInstanceGroups>);
    const expectedTabs = [
      'Back to Inventories',
      'Details',
      'Access',
      'Hosts',
      'Job Templates',
      'Runs',
    ];
    renderAt('/inventories/smart_inventory/1/details');
    const tablist = await screen.findByRole('tablist');
    // In this order, Runs last as on every screen.
    expect(
      within(tablist)
        .getAllByRole('tab')
        .map((tab) => tab.textContent?.trim())
    ).toEqual(expectedTabs);
  });

  test('should show content error when api throws an error', async () => {
    const error = Object.assign(new Error(), {
      response: { status: 404 },
    });
    vi.mocked(InventoriesAPI.readDetail).mockRejectedValueOnce(error);
    renderAt('/inventories/smart_inventory/1/details');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
    expect(InventoriesAPI.readDetail).toHaveBeenCalledTimes(1);
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    vi.mocked(InventoriesAPI.readDetail).mockResolvedValue({
      data: mockSmartInventory,
    } as unknown as ResponseOf<typeof InventoriesAPI.readDetail>);
    vi.mocked(InventoriesAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: true } },
    } as unknown as ResponseOf<typeof InventoriesAPI.readOptions>);
    vi.mocked(InventoriesAPI.readInstanceGroups).mockResolvedValue({
      data: { results: [] },
    } as unknown as ResponseOf<typeof InventoriesAPI.readInstanceGroups>);
    renderAt('/inventories/smart_inventory/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });
});
