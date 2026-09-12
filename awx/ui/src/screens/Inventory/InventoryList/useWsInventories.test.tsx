import type { Untyped } from 'types/api';
import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import WS from 'vitest-websocket-mock';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import useWsInventories from './useWsInventories';

// Render the hook's synced result as JSON so tests can read it from the DOM
// (RTL 12 has no renderHook, and the hook returns plain data).
function Test({
  inventories,
  fetchInventories,
  fetchInventoriesById,
  qsConfig,
}: Untyped) {
  const syncedInventories = useWsInventories(
    inventories,
    fetchInventories,
    fetchInventoriesById,
    qsConfig
  );
  return <div data-testid="ws-result">{JSON.stringify(syncedInventories)}</div>;
}

const QS_CONFIG = {
  defaultParams: {},
};

const getResult = () => JSON.parse(screen.getByTestId('ws-result').textContent);

const subscribeMessage = JSON.stringify({
  xrftoken: 'abc123',
  groups: {
    inventories: ['status_changed'],
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  },
});

/*
Mock timers don’t play well with vitest-websocket-mock, so we stub out
throttling to resolve immediately. Declared at the top level because vitest
hoists module mocks, and it rejects one written inside a block on the grounds
that its apparent position would misrepresent when it runs.
*/
vi.mock('../../../hooks/useThrottle', () => ({
  __esModule: true,
  default: vi.fn((val) => val),
}));

describe('useWsInventories hook', () => {
  let debug: typeof global.console.debug;
  beforeEach(() => {
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    global.console.debug = debug;
    WS.clean();
    vi.clearAllMocks();
  });

  test('should return inventories list', () => {
    const fetchInventories = vi.fn(() => []);
    const fetchInventoriesById = vi.fn(() => []);
    const inventories = [{ id: 1 }];
    renderWithContexts(
      <Test
        inventories={inventories}
        fetchInventories={fetchInventories}
        fetchInventoriesById={fetchInventoriesById}
        qsConfig={QS_CONFIG}
      />
    );

    expect(getResult()).toEqual(inventories);
  });

  test('should establish websocket connection', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const fetchInventories = vi.fn(() => []);
    const fetchInventoriesById = vi.fn(() => []);

    const inventories = [{ id: 1 }];
    await act(async () => {
      renderWithContexts(
        <Test
          inventories={inventories}
          fetchInventories={fetchInventories}
          fetchInventoriesById={fetchInventoriesById}
          qsConfig={QS_CONFIG}
        />
      );
    });

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(subscribeMessage);
  });

  test('should update inventory sync status', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const fetchInventories = vi.fn(() => []);
    const fetchInventoriesById = vi.fn(() => []);

    const inventories = [{ id: 1 }];
    await act(async () => {
      renderWithContexts(
        <Test
          inventories={inventories}
          fetchInventories={fetchInventories}
          fetchInventoriesById={fetchInventoriesById}
          qsConfig={QS_CONFIG}
        />
      );
    });

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(subscribeMessage);
    act(() => {
      mockServer.send(
        JSON.stringify({
          inventory_id: 1,
          type: 'inventory_update',
          status: 'running',
        })
      );
    });

    await waitFor(() =>
      expect(getResult()[0].isSourceSyncRunning).toEqual(true)
    );
  });

  test('should fetch fresh inventory after sync runs', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const inventories = [{ id: 1 }];
    const fetchInventories = vi.fn(() => []);
    const fetchInventoriesById = vi.fn(() =>
      Promise.resolve([{ id: 1, updated: true }])
    );
    await act(async () => {
      renderWithContexts(
        <Test
          inventories={inventories}
          fetchInventories={fetchInventories}
          fetchInventoriesById={fetchInventoriesById}
          qsConfig={QS_CONFIG}
        />
      );
    });

    await mockServer.connected;
    await act(async () => {
      mockServer.send(
        JSON.stringify({
          inventory_id: 1,
          type: 'inventory_update',
          status: 'successful',
        })
      );
    });

    await waitFor(() => expect(fetchInventoriesById).toHaveBeenCalledWith([1]));
  });

  test('should update inventory pending_deletion', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const fetchInventories = vi.fn(() => []);
    const fetchInventoriesById = vi.fn(() => []);

    const inventories = [{ id: 1, pending_deletion: false }];
    await act(async () => {
      renderWithContexts(
        <Test
          inventories={inventories}
          fetchInventories={fetchInventories}
          fetchInventoriesById={fetchInventoriesById}
          qsConfig={QS_CONFIG}
        />
      );
    });

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(subscribeMessage);
    act(() => {
      mockServer.send(
        JSON.stringify({
          inventory_id: 1,
          group_name: 'inventories',
          status: 'pending_deletion',
        })
      );
    });

    await waitFor(() => expect(getResult()[0].pending_deletion).toEqual(true));
  });

  test('should refetch inventories after an inventory is deleted', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const inventories = [{ id: 1 }, { id: 2 }];
    const fetchInventories = vi.fn(() => []);
    const fetchInventoriesById = vi.fn(() => []);
    await act(async () => {
      renderWithContexts(
        <Test
          inventories={inventories}
          fetchInventories={fetchInventories}
          fetchInventoriesById={fetchInventoriesById}
          qsConfig={QS_CONFIG}
        />
      );
    });

    await mockServer.connected;
    await act(async () => {
      mockServer.send(
        JSON.stringify({
          inventory_id: 1,
          group_name: 'inventories',
          status: 'deleted',
        })
      );
    });

    await waitFor(() => expect(fetchInventories).toHaveBeenCalled());
  });
});
