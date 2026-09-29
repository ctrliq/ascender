import React from 'react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { screen, waitFor, within } from '@testing-library/react';
import {
  InventoriesAPI,
  InventorySourcesAPI,
  WorkflowJobTemplateNodesAPI,
} from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { TestUser } from '../../../../testUtils/rtlContexts';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import InventorySourceList from './InventorySourceList';

vi.mock('../../../api/models/InventorySources');
vi.mock('../../../api/models/Inventories');
vi.mock('../../../api/models/InventoryUpdates');
vi.mock('../../../api/models/WorkflowJobTemplateNodes');

const sources = {
  data: {
    results: [
      {
        id: 1,
        name: 'Source Foo',
        status: '',
        source: 'ec2',
        url: '/api/v2/inventory_sources/56/',
        summary_fields: {
          user_capabilities: {
            edit: true,
            delete: true,
            start: true,
            schedule: true,
          },
        },
      },
      {
        id: 2,
        name: 'Source Bar',
        status: '',
        source: 'scm',
        url: '/api/v2/inventory_sources/57/',
        summary_fields: {
          user_capabilities: {
            edit: true,
            delete: true,
            start: true,
            schedule: true,
          },
        },
      },
    ],
    count: 1,
  },
};

function renderList(initialEntry = '/inventories/inventory/1/sources') {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/sources/*"
        element={<InventorySourceList />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventorySourceList />', () => {
  let user: TestUser;
  let debug: typeof global.console.debug;

  beforeEach(async () => {
    debug = global.console.debug;
    global.console.debug = () => {};
    vi.mocked(InventoriesAPI.readSources).mockResolvedValue(
      sources as unknown as ResponseOf<typeof InventoriesAPI.readSources>
    );
    vi.mocked(InventoriesAPI.updateSources).mockResolvedValue({
      data: [{ inventory_source: 1 }],
    } as unknown as ResponseOf<typeof InventoriesAPI.updateSources>);
    vi.mocked(InventorySourcesAPI.readGroups).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readGroups>);
    vi.mocked(InventorySourcesAPI.readHosts).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readHosts>);
    vi.mocked(WorkflowJobTemplateNodesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof WorkflowJobTemplateNodesAPI.read>);
    vi.mocked(InventorySourcesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {
            source: {
              choices: [
                ['scm', 'SCM'],
                ['ec2', 'EC2'],
              ],
            },
          },
          POST: {},
        },
      },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readOptions>);
    ({ user } = renderList());
    await screen.findByRole('link', { name: 'Source Foo' });
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.console.debug = debug;
  });

  test('api calls should be made on mount', async () => {
    expect(InventoriesAPI.readSources).toHaveBeenCalledWith('1', {
      order_by: 'name',
      page: 1,
      page_size: 20,
    });
    expect(InventorySourcesAPI.readOptions).toHaveBeenCalled();
  });

  test('finds a source by part of its name, in any case', async () => {
    await user.type(
      screen.getByRole('searchbox', { name: 'Search text input' }),
      'FOO'
    );
    await user.click(
      screen.getByRole('button', { name: 'Search submit button' })
    );
    await waitFor(() =>
      expect(InventoriesAPI.readSources).toHaveBeenLastCalledWith(
        '1',
        expect.objectContaining({ name__icontains: 'FOO' })
      )
    );
    await settleTooltips();
  });

  test('source data should render properly', async () => {
    expect(
      screen.getByRole('link', { name: 'Source Foo' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Source Bar' })
    ).toBeInTheDocument();
  });

  test('add button is not disabled and delete button is disabled', async () => {
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('delete button becomes enabled and properly calls api to delete', async () => {
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    const row = screen.getByRole('link', { name: 'Source Foo' }).closest('tr');
    const checkbox = within(row!).getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(InventorySourcesAPI.destroy).toHaveBeenCalledWith(1)
    );
    expect(InventorySourcesAPI.destroyHosts).toHaveBeenCalledWith(1);
    expect(InventorySourcesAPI.destroyGroups).toHaveBeenCalledWith(1);
  });

  test('should throw error after deletion failure', async () => {
    vi.mocked(InventorySourcesAPI.destroy).mockRejectedValue(new Error());

    const row = screen.getByRole('link', { name: 'Source Foo' }).closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });

  test('syncs every source where nothing is ticked', async () => {
    const syncAllButton = screen.getByRole('button', { name: 'Sync All' });
    await user.click(syncAllButton);
    await settleTooltips();
    await waitFor(() =>
      expect(InventorySourcesAPI.createSyncStart).toHaveBeenCalledTimes(2)
    );
    expect(InventorySourcesAPI.createSyncStart).toHaveBeenCalledWith(1);
    expect(InventorySourcesAPI.createSyncStart).toHaveBeenCalledWith(2);
  });

  test('syncs only what is ticked, and says Sync once a row is', async () => {
    const row = screen.getByRole('link', { name: 'Source Foo' }).closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Sync' }));
    await settleTooltips();
    await waitFor(() =>
      expect(InventorySourcesAPI.createSyncStart).toHaveBeenCalledWith(1)
    );
    expect(InventorySourcesAPI.createSyncStart).toHaveBeenCalledTimes(1);
  });

  test('names the sources the api refused to sync', async () => {
    vi.mocked(InventorySourcesAPI.createSyncStart).mockRejectedValue(
      new Error()
    );
    await user.click(screen.getByRole('button', { name: 'Sync All' }));
    expect(
      await screen.findByText('Not started: Source Foo, Source Bar')
    ).toBeInTheDocument();
    await settleTooltips();
  });
});

describe('<InventorySourceList /> error handling', () => {
  let debug: typeof global.console.debug;

  beforeEach(() => {
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.console.debug = debug;
  });

  test('displays error after unsuccessful read sources fetch', async () => {
    vi.mocked(InventorySourcesAPI.readOptions).mockRejectedValue(new Error());
    vi.mocked(InventoriesAPI.readSources).mockRejectedValue(new Error());

    renderList();

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('displays error after unsuccessful read options fetch', async () => {
    vi.mocked(InventoriesAPI.readSources).mockResolvedValue(
      sources as unknown as ResponseOf<typeof InventoriesAPI.readSources>
    );
    vi.mocked(InventorySourcesAPI.readOptions).mockRejectedValue(new Error());

    renderList();

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});

describe('<InventorySourceList /> RBAC testing', () => {
  let debug: typeof global.console.debug;

  beforeEach(() => {
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.console.debug = debug;
  });

  test('should not render add button', async () => {
    sources.data.results[0]!.summary_fields.user_capabilities = {
      edit: true,
      delete: true,
      start: true,
      schedule: true,
    };
    vi.mocked(InventoriesAPI.readSources).mockResolvedValue(
      sources as unknown as ResponseOf<typeof InventoriesAPI.readSources>
    );
    vi.mocked(InventorySourcesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {
            source: {
              choices: [
                ['scm', 'SCM'],
                ['ec2', 'EC2'],
              ],
            },
          },
        },
      },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readOptions>);

    renderList('/inventories/inventory/2/sources');
    await screen.findByRole('link', { name: 'Source Foo' });

    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });

  /** The fixture with each source's start capability set as given. */
  function mockSourcesStartable(...starts: boolean[]) {
    vi.mocked(InventoriesAPI.readSources).mockResolvedValue({
      ...sources,
      data: {
        ...sources.data,
        results: sources.data.results.map((source, index) => ({
          ...source,
          summary_fields: {
            ...source.summary_fields,
            user_capabilities: {
              ...source.summary_fields.user_capabilities,
              start: starts[index],
            },
          },
        })),
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.readSources>);
    vi.mocked(InventorySourcesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {
            source: {
              choices: [
                ['scm', 'SCM'],
                ['ec2', 'EC2'],
              ],
            },
          },
          POST: {},
        },
      },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readOptions>);
  }

  test('should disable Sync All where no source can be started', async () => {
    mockSourcesStartable(false, false);

    const { user } = renderList('/inventories/inventory/2/sources');
    await screen.findByRole('link', { name: 'Source Foo' });

    const button = screen.getByRole('button', { name: 'Sync All' });
    expect(button).toBeDisabled();
    await user.hover(button);
    expect(
      await screen.findByText(
        'You do not have permission to sync any of these.'
      )
    ).toBeInTheDocument();
  });

  test('should render Sync All where any source can be started', async () => {
    mockSourcesStartable(false, true);

    renderList('/inventories/inventory/2/sources');
    await screen.findByRole('link', { name: 'Source Foo' });

    expect(
      screen.getByRole('button', { name: 'Sync All' })
    ).toBeInTheDocument();
  });
});

/*
 * The counts that enable Sync All come from the searched list, so what it
 * syncs is every source that search matches rather than every source in the
 * inventory.
 */
describe('<InventorySourceList /> Sync All under a search', () => {
  let debug: typeof global.console.debug;
  const searched =
    '/inventories/inventory/1/sources?inventory-sources.name__icontains=foo';

  beforeEach(() => {
    debug = global.console.debug;
    global.console.debug = () => {};
    vi.mocked(InventorySourcesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: { source: { choices: [['ec2', 'EC2']] } },
          POST: {},
        },
      },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.console.debug = debug;
  });

  test('syncs every source the search matches', async () => {
    vi.mocked(InventoriesAPI.readSources).mockResolvedValue(
      sources as unknown as ResponseOf<typeof InventoriesAPI.readSources>
    );
    const { user } = renderList(searched);
    await screen.findByRole('link', { name: 'Source Foo' });

    const button = screen.getByRole('button', { name: 'Sync All' });
    await user.hover(button);
    expect(
      await screen.findByText(
        'Sync all Inventory Sources matching the current search'
      )
    ).toBeInTheDocument();

    await user.click(button);
    await settleTooltips();
    await waitFor(() =>
      expect(InventoriesAPI.readSources).toHaveBeenLastCalledWith('1', {
        name__icontains: 'foo',
        page: 1,
        page_size: 200,
        order_by: 'name',
      })
    );
  });

  test('reads every page the search matches, not only the first', async () => {
    /* The first read is the list itself; the next two are Sync All, whose
       first page says there is another. */
    const [first, second] = sources.data.results;
    vi.mocked(InventoriesAPI.readSources)
      .mockResolvedValueOnce(
        sources as unknown as ResponseOf<typeof InventoriesAPI.readSources>
      )
      .mockResolvedValueOnce({
        data: { results: [first], count: 2, next: '/page=2' },
      } as unknown as ResponseOf<typeof InventoriesAPI.readSources>)
      .mockResolvedValueOnce({
        data: { results: [second], count: 2, next: null },
      } as unknown as ResponseOf<typeof InventoriesAPI.readSources>);
    const { user } = renderList(searched);
    await screen.findByRole('link', { name: 'Source Foo' });

    await user.click(screen.getByRole('button', { name: 'Sync All' }));
    await waitFor(() =>
      expect(InventorySourcesAPI.createSyncStart).toHaveBeenCalledTimes(2)
    );
    expect(InventoriesAPI.readSources).toHaveBeenLastCalledWith('1', {
      name__icontains: 'foo',
      page: 2,
      page_size: 200,
      order_by: 'name',
    });
    expect(InventorySourcesAPI.createSyncStart).toHaveBeenCalledWith(1);
    expect(InventorySourcesAPI.createSyncStart).toHaveBeenCalledWith(2);
  });

  test('says nothing matches where the search finds no source', async () => {
    vi.mocked(InventoriesAPI.readSources).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof InventoriesAPI.readSources>);
    const { user } = renderList(searched);

    const button = await screen.findByRole('button', { name: 'Sync All' });
    expect(button).toBeDisabled();
    await user.hover(button);
    expect(
      await screen.findByText('No inventory sources match the current search.')
    ).toBeInTheDocument();
  });
});
