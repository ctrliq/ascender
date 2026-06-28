import React from 'react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { screen, waitFor, within } from '@testing-library/react';
import {
  InventoriesAPI,
  InventorySourcesAPI,
  WorkflowJobTemplateNodesAPI,
} from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import InventorySourceList from './InventorySourceList';

jest.mock('../../../api/models/InventorySources');
jest.mock('../../../api/models/Inventories');
jest.mock('../../../api/models/InventoryUpdates');
jest.mock('../../../api/models/WorkflowJobTemplateNodes');

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
  let user;
  let debug;

  beforeEach(async () => {
    debug = global.console.debug;
    global.console.debug = () => {};
    InventoriesAPI.readSources.mockResolvedValue(sources);
    InventoriesAPI.updateSources.mockResolvedValue({
      data: [{ inventory_source: 1 }],
    });
    InventorySourcesAPI.readGroups.mockResolvedValue({ data: { count: 0 } });
    InventorySourcesAPI.readHosts.mockResolvedValue({ data: { count: 0 } });
    WorkflowJobTemplateNodesAPI.read.mockResolvedValue({ data: { count: 0 } });
    InventorySourcesAPI.readOptions.mockResolvedValue({
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
    });
    ({ user } = renderList());
    await screen.findByRole('link', { name: 'Source Foo' });
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  test('source data should render properly', async () => {
    expect(screen.getByRole('link', { name: 'Source Foo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source Bar' })).toBeInTheDocument();
  });

  test('add button is not disabled and delete button is disabled', async () => {
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('delete button becomes enabled and properly calls api to delete', async () => {
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    const row = screen.getByRole('link', { name: 'Source Foo' }).closest('tr');
    const checkbox = within(row).getByRole('checkbox');
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
    InventorySourcesAPI.destroy.mockRejectedValue(new Error());

    const row = screen.getByRole('link', { name: 'Source Foo' }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });

  test('should render sync all button and make api call to start sync for all', async () => {
    const syncAllButton = screen.getByRole('button', { name: 'Sync all' });
    expect(syncAllButton).toBeInTheDocument();
    await user.click(syncAllButton);
    await settleTooltips();
    expect(InventoriesAPI.syncAllSources).toHaveBeenCalled();
    expect(InventoriesAPI.readSources).toHaveBeenCalled();
  });

  test('displays error after unsuccessful sync all button', async () => {
    InventoriesAPI.syncAllSources.mockRejectedValue(new Error());
    await user.click(screen.getByRole('button', { name: 'Sync all' }));
    await waitFor(() =>
      expect(InventoriesAPI.syncAllSources).toHaveBeenCalled()
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });
});

describe('<InventorySourceList /> error handling', () => {
  let debug;

  beforeEach(() => {
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.console.debug = debug;
  });

  test('displays error after unsuccessful read sources fetch', async () => {
    InventorySourcesAPI.readOptions.mockRejectedValue(new Error());
    InventoriesAPI.readSources.mockRejectedValue(new Error());

    renderList();

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('displays error after unsuccessful read options fetch', async () => {
    InventoriesAPI.readSources.mockResolvedValue(sources);
    InventorySourcesAPI.readOptions.mockRejectedValue(new Error());

    renderList();

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});

describe('<InventorySourceList /> RBAC testing', () => {
  let debug;

  beforeEach(() => {
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.console.debug = debug;
  });

  test('should not render add button', async () => {
    sources.data.results[0].summary_fields.user_capabilities = {
      edit: true,
      delete: true,
      start: true,
      schedule: true,
    };
    InventoriesAPI.readSources.mockResolvedValue(sources);
    InventorySourcesAPI.readOptions.mockResolvedValue({
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
    });

    renderList('/inventories/inventory/2/sources');
    await screen.findByRole('link', { name: 'Source Foo' });

    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });

  test('should not render Sync all button', async () => {
    sources.data.results[0].summary_fields.user_capabilities = {
      edit: true,
      delete: true,
      start: false,
      schedule: true,
    };
    InventoriesAPI.readSources.mockResolvedValue(sources);
    InventorySourcesAPI.readOptions.mockResolvedValue({
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
    });

    renderList('/inventories/inventory/2/sources');
    await screen.findByRole('link', { name: 'Source Foo' });

    expect(
      screen.queryByRole('button', { name: 'Sync all' })
    ).not.toBeInTheDocument();
  });
});
