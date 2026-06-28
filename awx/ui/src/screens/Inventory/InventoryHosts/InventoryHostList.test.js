import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { InventoriesAPI, HostsAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import InventoryHostList from './InventoryHostList';

jest.mock('../../../api');

const mockHosts = [
  {
    id: 1,
    name: 'Host 1',
    url: '/api/v2/hosts/1',
    inventory: 1,
    enabled: true,
    summary_fields: {
      inventory: { id: 1, name: 'inv 1' },
      user_capabilities: { delete: true, update: true },
      recent_jobs: [],
    },
  },
  {
    id: 2,
    name: 'Host 2',
    url: '/api/v2/hosts/2',
    inventory: 1,
    enabled: true,
    summary_fields: {
      inventory: { id: 1, name: 'inv 1' },
      user_capabilities: { edit: true, delete: true, update: true },
      recent_jobs: [],
    },
  },
  {
    id: 3,
    name: 'Host 3',
    url: '/api/v2/hosts/3',
    inventory: 1,
    enabled: true,
    summary_fields: {
      inventory: { id: 1, name: 'inv 1' },
      user_capabilities: { delete: false, update: false },
      recent_jobs: [
        {
          id: 123,
          name: 'Recent Job',
          status: 'success',
          finished: '2020-01-27T19:40:36.208728Z',
        },
      ],
    },
  },
];

function renderUnder(url = '/inventories/inventory/1/hosts') {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/inventory/:id/hosts"
        element={<InventoryHostList />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

const toggleFor = (hostId) =>
  document.getElementById(`host-${hostId}-toggle`);

describe('<InventoryHostList />', () => {
  beforeEach(() => {
    InventoriesAPI.readHosts.mockResolvedValue({
      data: { count: mockHosts.length, results: mockHosts },
    });
    InventoriesAPI.readHostsOptions.mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: ['first_key__search', 'ansible_facts'],
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch hosts from api and render them in the list', async () => {
    renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    expect(InventoriesAPI.readHosts).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Host 2' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Host 3' })).toBeInTheDocument();
  });

  test('should render Run Commands button', async () => {
    renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    expect(
      screen.getByRole('button', { name: 'Run Command' })
    ).toBeInTheDocument();
  });

  test('should check and uncheck the row item', async () => {
    const { user } = renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    const row = screen.getByRole('link', { name: 'Host 1' }).closest('tr');
    const checkbox = within(row).getByRole('checkbox', { name: /select/i });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('should check all row items when select all is checked', async () => {
    const { user } = renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox', { name: /select row/i });
    expect(rowCheckboxes).toHaveLength(3);
    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());
    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
  });

  test('should call api if host toggle is clicked', async () => {
    HostsAPI.update.mockResolvedValueOnce({
      data: { ...mockHosts[1], enabled: false },
    });
    const { user } = renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    const toggle = toggleFor(2);
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(HostsAPI.update).toHaveBeenCalledTimes(1));
  });

  test('should show error modal if host is not successfully toggled', async () => {
    HostsAPI.update.mockImplementationOnce(() => Promise.reject(new Error()));
    const { user } = renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    await user.click(toggleFor(2));
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });

  test('delete button is disabled if user does not have delete capabilities on a selected host', async () => {
    const { user } = renderUnder();
    await screen.findByRole('link', { name: 'Host 3' });
    const row = screen.getByRole('link', { name: 'Host 3' }).closest('tr');
    await user.click(within(row).getByRole('checkbox', { name: /select/i }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('should call api delete hosts for each selected host', async () => {
    HostsAPI.destroy.mockResolvedValue({});
    const { user } = renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    const row = screen.getByRole('link', { name: 'Host 1' }).closest('tr');
    await user.click(within(row).getByRole('checkbox', { name: /select/i }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );
    await waitFor(() => expect(HostsAPI.destroy).toHaveBeenCalledTimes(1));
  });

  test('should show error modal when host is not successfully deleted from api', async () => {
    HostsAPI.destroy.mockRejectedValue(new Error());
    const { user } = renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    const row = screen.getByRole('link', { name: 'Host 1' }).closest('tr');
    await user.click(within(row).getByRole('checkbox', { name: /select/i }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });

  test('should show content error if hosts are not successfully fetched from api', async () => {
    InventoriesAPI.readHosts.mockRejectedValue(new Error());
    renderUnder();
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show Add button for users with ability to POST', async () => {
    renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });

  test('should hide Add button for users without ability to POST', async () => {
    InventoriesAPI.readHostsOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });

  test('should show content error when api throws error on initial render', async () => {
    InventoriesAPI.readHostsOptions.mockRejectedValue(new Error());
    renderUnder();
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should not render Run Commands button', async () => {
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
    renderUnder();
    await screen.findByRole('link', { name: 'Host 1' });
    expect(
      screen.queryByRole('button', { name: 'Run Command' })
    ).not.toBeInTheDocument();
  });
});
