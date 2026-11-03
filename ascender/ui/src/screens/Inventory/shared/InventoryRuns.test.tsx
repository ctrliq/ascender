import React from 'react';
import { Routes, Route } from 'react-router';
import { waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { InventorySourcesAPI, UnifiedJobsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import { getInventoryRunsParams, inventoryRunsRoutes } from './InventoryRuns';
import type { InventoryRunsOptions } from './InventoryRuns';

vi.mock('../../../api');

describe('getInventoryRunsParams', () => {
  test('counts the updates of the inventory sources among its runs', () => {
    expect(getInventoryRunsParams(7)).toEqual({
      or__job__inventory: 7,
      or__adhoccommand__inventory: 7,
      or__inventoryupdate__inventory_source__inventory: 7,
      or__workflowjob__inventory: 7,
    });
  });

  test('leaves source updates out for an inventory without sources', () => {
    expect(getInventoryRunsParams(7, { includeSourceUpdates: false })).toEqual({
      or__job__inventory: 7,
      or__adhoccommand__inventory: 7,
      or__workflowjob__inventory: 7,
    });
  });
});

describe('inventoryRunsRoutes', () => {
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

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderAt(path: string, options?: InventoryRunsOptions) {
    const history = createMemoryHistory({ initialEntries: [path] });
    renderWithContexts(
      <Routes>
        <Route
          path="/inventories/inventory/:id/*"
          element={<Routes>{inventoryRunsRoutes({ id: 7 }, options)}</Routes>}
        />
      </Routes>,
      { context: { router: { history } } }
    );
    return history;
  }

  test("lists the inventory's runs on the runs route", async () => {
    renderAt('/inventories/inventory/7/runs', { includeSourceUpdates: false });
    await waitFor(() =>
      expect(UnifiedJobsAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({
          or__job__inventory: 7,
          or__workflowjob__inventory: 7,
        })
      )
    );
    expect(UnifiedJobsAPI.read).not.toHaveBeenCalledWith(
      expect.objectContaining({
        or__inventoryupdate__inventory_source__inventory: 7,
      })
    );
  });

  test("sends the tab's old address on to the runs", async () => {
    const history = renderAt('/inventories/inventory/7/jobs');
    await waitFor(() =>
      expect(history.location.pathname).toBe('/inventories/inventory/7/runs')
    );
  });
});
