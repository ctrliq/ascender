import React from 'react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { screen, within } from '@testing-library/react';
import { InventoriesAPI, GroupsAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import InventoryGroupsList from './InventoryGroupsList';

jest.mock('../../../api');

function renderUnder(url) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const result = renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/*"
        element={<InventoryGroupsList />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
  return { ...result, history };
}

const mockGroups = [
  {
    id: 1,
    type: 'group',
    name: 'foo',
    inventory: 1,
    url: '/api/v2/groups/1',
    summary_fields: {
      user_capabilities: { delete: true, edit: true },
    },
  },
  {
    id: 2,
    type: 'group',
    name: 'bar',
    inventory: 1,
    url: '/api/v2/groups/2',
    summary_fields: {
      user_capabilities: { delete: true, edit: true },
    },
  },
  {
    id: 3,
    type: 'group',
    name: 'baz',
    inventory: 1,
    url: '/api/v2/groups/3',
    summary_fields: {
      user_capabilities: { delete: false, edit: false },
    },
  },
];

function mockSuccessfulApis() {
  InventoriesAPI.readGroups.mockResolvedValue({
    data: {
      count: mockGroups.length,
      results: mockGroups,
    },
  });
  InventoriesAPI.readGroupsOptions.mockResolvedValue({
    data: {
      actions: {
        GET: {},
        POST: {},
      },
    },
  });
  InventoriesAPI.readAdHocOptions.mockResolvedValue({
    data: {
      actions: {
        GET: {
          module_name: {
            choices: [
              ['command', 'command'],
              ['shell', 'shell'],
            ],
          },
        },
        POST: {},
      },
    },
  });
}

describe('<InventoryGroupsList />', () => {
  beforeEach(() => {
    mockSuccessfulApis();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch groups from api and render them in the list', async () => {
    renderUnder('/inventories/inventory/3/groups');
    expect(await screen.findByRole('link', { name: 'foo' })).toBeInTheDocument();
    expect(InventoriesAPI.readGroups).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'bar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'baz' })).toBeInTheDocument();
  });

  test('should render Run Commands button', async () => {
    renderUnder('/inventories/inventory/3/groups');
    expect(
      await screen.findByRole('button', { name: 'Run Command' })
    ).toBeInTheDocument();
  });

  test('should check and uncheck the row item', async () => {
    const { user } = renderUnder('/inventories/inventory/3/groups');
    const row = (await screen.findByRole('link', { name: 'foo' })).closest('tr');
    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('should check all row items when select all is checked', async () => {
    const { user } = renderUnder('/inventories/inventory/3/groups');
    await screen.findByRole('link', { name: 'foo' });
    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox')
      .filter((box) => box !== selectAll);

    expect(rowCheckboxes).toHaveLength(3);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
  });

  test('should not render ad hoc commands button', async () => {
    InventoriesAPI.readAdHocOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {
            module_name: {
              choices: [
                ['command', 'command'],
                ['shell', 'shell'],
              ],
            },
          },
        },
      },
    });
    renderUnder('/inventories/inventory/3/groups');
    await screen.findByRole('link', { name: 'foo' });
    expect(
      screen.queryByRole('button', { name: 'Run Command' })
    ).not.toBeInTheDocument();
  });
});

describe('<InventoryGroupsList/> error handling', () => {
  beforeEach(() => {
    mockSuccessfulApis();
    GroupsAPI.destroy.mockRejectedValue(new Error());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should show content error when api throws error on initial render', async () => {
    InventoriesAPI.readGroupsOptions.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    renderUnder('/inventories/inventory/3/groups');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show content error if groups are not successfully fetched from api', async () => {
    InventoriesAPI.readGroups.mockImplementation(() =>
      Promise.reject(new Error())
    );
    renderUnder('/inventories/inventory/3/groups');
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show error modal when group is not successfully deleted from api', async () => {
    const { user } = renderUnder('/inventories/inventory/3/groups');
    const row = (await screen.findByRole('link', { name: 'foo' })).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete Group?')).toBeInTheDocument();

    await user.click(
      screen.getByRole('radio', { name: 'Delete All Groups and Hosts' })
    );
    await user.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await settleTooltips();
  });
});

describe('Constructed Inventory group', () => {
  beforeEach(() => {
    mockSuccessfulApis();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should not show add or delete buttons but still show ad hoc commands', async () => {
    renderUnder('/inventories/constructed_inventory/3/groups');
    expect(
      await screen.findByRole('button', { name: 'Run Command' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });
});
