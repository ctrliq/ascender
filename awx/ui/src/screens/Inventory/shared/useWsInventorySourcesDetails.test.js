import React from 'react';
import { act, waitFor } from '@testing-library/react';
import WS from 'jest-websocket-mock';
import { InventorySourcesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import useWsInventorySourceDetails from './useWsInventorySourcesDetails';

jest.mock('../../../api/models/InventorySources');

function Test({ inventorySource }) {
  const synced = useWsInventorySourceDetails(inventorySource);
  // expose the hook result as JSON so the test can assert on it via the DOM
  return <div data-testid="result">{JSON.stringify(synced)}</div>;
}

function readResult(container) {
  return JSON.parse(container.querySelector('[data-testid="result"]').textContent);
}

describe('useWsInventorySourceDetails', () => {
  afterEach(() => {
    WS.clean();
  });

  test('should return inventory source detail', async () => {
    const inventorySource = { id: 1 };
    const { container } = renderWithContexts(
      <Test inventorySource={inventorySource} />
    );

    expect(readResult(container)).toEqual(inventorySource);
  });

  test('should establish websocket connection', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');

    const inventorySource = { id: 1 };
    renderWithContexts(<Test inventorySource={inventorySource} />);

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(
      JSON.stringify({
        xrftoken: 'abc123',
        groups: {
          jobs: ['status_changed'],
          control: ['limit_reached_1'],
        },
      })
    );
  });

  test('should update inventory source status', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');

    const inventorySource = {
      id: 1,
      summary_fields: {
        current_job: {
          id: 1,
          status: 'running',
          finished: null,
        },
      },
    };
    const { container } = renderWithContexts(
      <Test inventorySource={inventorySource} />
    );

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(
      JSON.stringify({
        xrftoken: 'abc123',
        groups: {
          jobs: ['status_changed'],
          control: ['limit_reached_1'],
        },
      })
    );
    expect(readResult(container).summary_fields.current_job.status).toEqual(
      'running'
    );

    // an inventory_source-typed message is ignored by the hook
    await act(async () => {
      mockServer.send(
        JSON.stringify({
          group_name: 'jobs',
          inventory_id: 1,
          status: 'pending',
          type: 'inventory_source',
          unified_job_id: 2,
          unified_job_template_id: 1,
          inventory_source_id: 1,
        })
      );
    });

    expect(readResult(container).summary_fields.current_job).toEqual({
      id: 1,
      status: 'running',
      finished: null,
    });

    expect(InventorySourcesAPI.readDetail).toHaveBeenCalledTimes(0);
    InventorySourcesAPI.readDetail.mockResolvedValue({
      data: {},
    });
    // an inventory_update message in a terminal status triggers a detail refetch
    await act(async () => {
      mockServer.send(
        JSON.stringify({
          group_name: 'jobs',
          inventory_id: 1,
          status: 'successful',
          type: 'inventory_update',
          unified_job_id: 2,
          unified_job_template_id: 1,
          inventory_source_id: 1,
        })
      );
    });
    await waitFor(() =>
      expect(InventorySourcesAPI.readDetail).toHaveBeenCalledTimes(1)
    );

    jest.clearAllMocks();
  });
});
