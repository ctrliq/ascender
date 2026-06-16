import React from 'react';
import { act } from 'react-dom/test-utils';
import WS from 'jest-websocket-mock';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import useWsWorkflowApprovals from './useWsWorkflowApprovals';

function Test({ workflowApprovals, fetchWorkflowApprovals }) {
  const updatedWorkflowApprovals = useWsWorkflowApprovals(
    workflowApprovals,
    fetchWorkflowApprovals
  );
  return (
    <div data-testid="result">{JSON.stringify(updatedWorkflowApprovals)}</div>
  );
}

describe('useWsWorkflowApprovals hook', () => {
  let debug;
  beforeEach(() => {
    debug = global.console.debug; // eslint-disable-line prefer-destructuring
    global.console.debug = () => {};
    /*
    Jest mock timers don’t play well with jest-websocket-mock,
    so we'll stub out throttling to resolve immediately
    */
    jest.mock('../../../hooks/useThrottle', () => ({
      __esModule: true,
      default: jest.fn((val) => val),
    }));
  });

  afterEach(() => {
    global.console.debug = debug;
    WS.clean();
  });

  test('should return workflow approvals list', () => {
    const workflowApprovals = [{ id: 1, status: 'successful' }];
    const { getByTestId } = renderWithContexts(
      <Test
        workflowApprovals={workflowApprovals}
        fetchWorkflowApprovals={() => {}}
      />
    );

    expect(JSON.parse(getByTestId('result').textContent)).toEqual(
      workflowApprovals
    );
  });

  test('should establish websocket connection', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');

    const workflowApprovals = [{ id: 1, status: 'successful' }];
    await act(async () => {
      renderWithContexts(
        <Test
          workflowApprovals={workflowApprovals}
          fetchWorkflowApprovals={() => {}}
        />
      );
    });

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

  test('should refetch after new approval job is created', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const workflowApprovals = [{ id: 1, status: 'successful' }];
    const fetchWorkflowApprovals = jest.fn(() => []);
    await act(async () => {
      renderWithContexts(
        <Test
          workflowApprovals={workflowApprovals}
          fetchWorkflowApprovals={fetchWorkflowApprovals}
        />
      );
    });

    await mockServer.connected;
    await act(async () => {
      mockServer.send(
        JSON.stringify({
          unified_job_id: 2,
          type: 'workflow_approval',
          status: 'pending',
        })
      );
    });

    expect(fetchWorkflowApprovals).toHaveBeenCalledTimes(1);
  });

  test('should refetch after approval job in current list is updated', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const workflowApprovals = [{ id: 1, status: 'pending' }];
    const fetchWorkflowApprovals = jest.fn(() => []);
    await act(async () => {
      renderWithContexts(
        <Test
          workflowApprovals={workflowApprovals}
          fetchWorkflowApprovals={fetchWorkflowApprovals}
        />
      );
    });

    await mockServer.connected;
    await act(async () => {
      mockServer.send(
        JSON.stringify({
          unified_job_id: 1,
          type: 'workflow_approval',
          status: 'successful',
        })
      );
    });

    expect(fetchWorkflowApprovals).toHaveBeenCalledTimes(1);
  });

  test('should not refetch when message is not workflow approval', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const workflowApprovals = [{ id: 1, status: 'successful' }];
    const fetchWorkflowApprovals = jest.fn(() => []);
    await act(async () => {
      renderWithContexts(
        <Test
          workflowApprovals={workflowApprovals}
          fetchWorkflowApprovals={fetchWorkflowApprovals}
        />
      );
    });

    await mockServer.connected;
    await act(async () => {
      mockServer.send(
        JSON.stringify({
          unified_job_id: 1,
          type: 'job',
          status: 'successful',
        })
      );
    });

    expect(fetchWorkflowApprovals).toHaveBeenCalledTimes(0);
  });
});
