import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { InventoriesAPI, JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import InventoryList from './InventoryList';

jest.mock('../../../api/models/Inventories');
jest.mock('../../../api/models/JobTemplates');
jest.mock('../../../api/models/WorkflowJobTemplates');

const mockInventories = [
  {
    id: 1,
    type: 'inventory',
    url: '/api/v2/inventories/1/',
    summary_fields: {
      organization: { id: 1, name: 'Default', description: '' },
      user_capabilities: { edit: true, delete: true, copy: true, adhoc: true },
    },
    created: '2019-10-04T16:56:48.025455Z',
    modified: '2019-10-04T16:56:48.025468Z',
    name: 'Inv no hosts',
    description: '',
    organization: 1,
    kind: '',
    host_filter: null,
    variables: '---',
    has_active_failures: false,
    total_hosts: 0,
    hosts_with_active_failures: 0,
    total_groups: 0,
    groups_with_active_failures: 0,
    has_inventory_sources: false,
    total_inventory_sources: 0,
    inventory_sources_with_failures: 0,
    pending_deletion: false,
  },
  {
    id: 2,
    type: 'inventory',
    url: '/api/v2/inventories/2/',
    summary_fields: {
      organization: { id: 1, name: 'Default', description: '' },
      user_capabilities: { edit: true, delete: true, copy: true, adhoc: true },
    },
    created: '2019-10-04T14:28:04.765571Z',
    modified: '2019-10-04T14:28:04.765594Z',
    name: "Mike's Inventory",
    description: '',
    organization: 1,
    kind: '',
    host_filter: null,
    variables: '---',
    has_active_failures: false,
    total_hosts: 1,
    hosts_with_active_failures: 0,
    total_groups: 0,
    groups_with_active_failures: 0,
    has_inventory_sources: false,
    total_inventory_sources: 0,
    inventory_sources_with_failures: 0,
    pending_deletion: false,
  },
  {
    id: 3,
    type: 'inventory',
    url: '/api/v2/inventories/3/',
    summary_fields: {
      organization: { id: 1, name: 'Default', description: '' },
      user_capabilities: { edit: true, delete: false, copy: true, adhoc: true },
    },
    created: '2019-10-04T15:29:11.542911Z',
    modified: '2019-10-04T15:29:11.542924Z',
    name: 'Smart Inv',
    description: '',
    organization: 1,
    kind: 'smart',
    host_filter: 'search=local',
    variables: '',
    has_active_failures: false,
    total_hosts: 1,
    hosts_with_active_failures: 0,
    total_groups: 0,
    groups_with_active_failures: 0,
    has_inventory_sources: false,
    total_inventory_sources: 0,
    inventory_sources_with_failures: 0,
    pending_deletion: false,
  },
];

describe('<InventoryList />', () => {
  let debug;
  beforeEach(() => {
    InventoriesAPI.read.mockResolvedValue({
      data: {
        count: mockInventories.length,
        results: mockInventories,
      },
    });

    InventoriesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
      },
    });
    JobTemplatesAPI.read.mockResolvedValue({ data: { count: 0 } });
    WorkflowJobTemplatesAPI.read.mockResolvedValue({ data: { count: 0 } });
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.console.debug = debug;
  });

  test('should load and render inventories', async () => {
    renderWithContexts(<InventoryList />);
    expect(
      await screen.findByRole('link', { name: 'Inv no hosts' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Mike's Inventory" })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Smart Inv' })).toBeInTheDocument();
  });

  test('should select inventory when checked', async () => {
    const { user } = renderWithContexts(<InventoryList />);
    const row = (await screen.findByRole('link', { name: 'Inv no hosts' })).closest(
      'tr'
    );
    const checkbox = within(row).getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  test('should select all', async () => {
    const { user } = renderWithContexts(<InventoryList />);
    await screen.findByRole('link', { name: 'Inv no hosts' });

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox')
      .filter((box) => box !== selectAll);

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());
  });

  test('should disable delete button when item without delete capability selected', async () => {
    const { user } = renderWithContexts(<InventoryList />);
    const row = (await screen.findByRole('link', { name: 'Smart Inv' })).closest(
      'tr'
    );
    await user.click(within(row).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await settleTooltips();
  });

  test('should call delete api', async () => {
    InventoriesAPI.destroy.mockResolvedValue({});
    const { user } = renderWithContexts(<InventoryList />);
    const row = (
      await screen.findByRole('link', { name: 'Inv no hosts' })
    ).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(InventoriesAPI.destroy).toHaveBeenCalledTimes(1)
    );
    await settleTooltips();
  });

  test('should show deletion error', async () => {
    InventoriesAPI.destroy.mockRejectedValue(new Error());
    const { user } = renderWithContexts(<InventoryList />);
    const row = (
      await screen.findByRole('link', { name: 'Inv no hosts' })
    ).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });

  test('Add button shown for users with ability to POST', async () => {
    renderWithContexts(<InventoryList />);
    await screen.findByRole('link', { name: 'Inv no hosts' });
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  test('Add button hidden for users without ability to POST', async () => {
    InventoriesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
        },
      },
    });
    renderWithContexts(<InventoryList />);
    await screen.findByRole('link', { name: 'Inv no hosts' });
    expect(
      screen.queryByRole('button', { name: 'Add' })
    ).not.toBeInTheDocument();
  });
});
