import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import WS from 'jest-websocket-mock';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import useWsInventorySources from './useWsInventorySources';

/*
  Jest mock timers don’t play well with jest-websocket-mock,
  so we'll stub out throttling to resolve immediately
*/
jest.mock('../../../hooks/useThrottle', () => ({
  __esModule: true,
  default: jest.fn((val) => val),
}));

// Render the hook's synced result as JSON so tests can read it from the DOM
// (RTL 12 has no renderHook, and the hook returns plain data).
function Test({ sources }) {
  const syncedSources = useWsInventorySources(sources);
  return <div data-testid="ws-result">{JSON.stringify(syncedSources)}</div>;
}

const getResult = () => JSON.parse(screen.getByTestId('ws-result').textContent);

const subscribeMessage = JSON.stringify({
  xrftoken: 'abc123',
  groups: {
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  },
});

describe('useWsInventorySources hook', () => {
  let debug;
  beforeEach(() => {
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    global.console.debug = debug;
    WS.clean();
  });

  test('should return sources list', () => {
    const sources = [{ id: 1 }];
    renderWithContexts(<Test sources={sources} />);

    expect(getResult()).toEqual(sources);
  });

  test('should establish websocket connection', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');

    const sources = [{ id: 1 }];
    await act(async () => {
      renderWithContexts(<Test sources={sources} />);
    });

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(subscribeMessage);
  });

  test('should update current job status', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');

    const sources = [
      {
        id: 3,
        status: 'running',
        summary_fields: {
          current_job: {
            id: 5,
            status: 'running',
          },
        },
      },
    ];
    await act(async () => {
      renderWithContexts(<Test sources={sources} />);
    });

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(subscribeMessage);
    act(() => {
      mockServer.send(
        JSON.stringify({
          unified_job_id: 5,
          inventory_source_id: 3,
          type: 'job',
          status: 'successful',
          finished: 'the_time',
        })
      );
    });

    await waitFor(() =>
      expect(getResult()[0]).toEqual({
        id: 3,
        status: 'successful',
        last_updated: 'the_time',
        summary_fields: {
          current_job: {
            id: 5,
            status: 'successful',
            finished: 'the_time',
          },
        },
      })
    );
  });
});
