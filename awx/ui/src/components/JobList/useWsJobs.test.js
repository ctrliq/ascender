import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import WS from 'jest-websocket-mock';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import useWsJobs from './useWsJobs';

// RTL 12 has no renderHook, so we drive the hook through a test component that
// serializes its result into a data-testid node we can read back.
function Test({ jobs, fetch }) {
  const qsConfig = {};
  const syncedJobs = useWsJobs(jobs, fetch, qsConfig);
  return <div data-testid="jobs">{JSON.stringify(syncedJobs)}</div>;
}

function getJobs() {
  return JSON.parse(screen.getByTestId('jobs').textContent);
}

describe('useWsJobs hook', () => {
  let debug;
  let mockServer;

  beforeEach(() => {
    /*
      Jest mock timers don’t play well with jest-websocket-mock,
      so we'll stub out throttling to resolve immediately
    */
    jest.mock('../../hooks/useThrottle', () => ({
      __esModule: true,
      default: jest.fn((val) => val),
    }));
    debug = global.console.debug;
    global.console.debug = () => {};

    WS.clean();
  });

  afterEach(() => {
    global.console.debug = debug;
    jest.clearAllMocks();

    if (mockServer) {
      mockServer.close();
      mockServer = null;
    }
    WS.clean();
  });

  test('should return jobs list', () => {
    const jobs = [{ id: 1 }];
    renderWithContexts(<Test jobs={jobs} />);

    expect(getJobs()).toEqual(jobs);
    WS.clean();
  });

  test('should establish websocket connection', async () => {
    global.document.cookie = 'csrftoken=abc123';
    mockServer = new WS('ws://localhost/websocket/');

    const jobs = [{ id: 1 }];
    await act(async () => {
      renderWithContexts(<Test jobs={jobs} />);
    });

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(
      JSON.stringify({
        xrftoken: 'abc123',
        groups: {
          jobs: ['status_changed'],
          schedules: ['changed'],
          control: ['limit_reached_1'],
        },
      })
    );
    mockServer.close();
    mockServer = null;
  });

  test('should update job status', async () => {
    global.document.cookie = 'csrftoken=abc123';
    mockServer = new WS('ws://localhost/websocket/');

    const jobs = [{ id: 1, status: 'running' }];
    await act(async () => {
      renderWithContexts(<Test jobs={jobs} />);
    });

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(
      JSON.stringify({
        xrftoken: 'abc123',
        groups: {
          jobs: ['status_changed'],
          schedules: ['changed'],
          control: ['limit_reached_1'],
        },
      })
    );
    expect(getJobs()[0].status).toEqual('running');

    await act(async () => {
      mockServer.send(
        JSON.stringify({
          unified_job_id: 1,
          type: 'job',
          status: 'successful',
        })
      );
    });

    await waitFor(() => expect(getJobs()[0].status).toEqual('successful'));
    mockServer.close();
    mockServer = null;
  });

  test('should fetch new job', async () => {
    global.document.cookie = 'csrftoken=abc123';
    mockServer = new WS('ws://localhost/websocket/');
    const jobs = [{ id: 1 }];
    const fetch = jest.fn(() => []);
    await act(async () => {
      renderWithContexts(<Test jobs={jobs} fetch={fetch} />);
    });

    await mockServer.connected;
    await act(async () => {
      mockServer.send(
        JSON.stringify({
          unified_job_id: 2,
          type: 'job',
          status: 'running',
        })
      );
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith([2]));
    mockServer.close();
    mockServer = null;
  });
});
