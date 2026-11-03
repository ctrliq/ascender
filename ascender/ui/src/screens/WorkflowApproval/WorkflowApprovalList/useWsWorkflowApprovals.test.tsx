import type { WorkflowApproval } from 'types/api';
import React from 'react';
import { act } from '@testing-library/react';
import WS from 'vitest-websocket-mock';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import useWsWorkflowApprovals from './useWsWorkflowApprovals';

function Test({
  workflowApprovals,
  fetchWorkflowApprovals,
}: {
  // The fixtures carry the id the hook matches messages against and the
  // status it updates in place.
  workflowApprovals: { id: number; status?: string }[];
  fetchWorkflowApprovals: Parameters<typeof useWsWorkflowApprovals>[1];
}) {
  const updatedWorkflowApprovals = useWsWorkflowApprovals(
    workflowApprovals as unknown as WorkflowApproval[],
    fetchWorkflowApprovals
  );
  return (
    <div data-testid="result">{JSON.stringify(updatedWorkflowApprovals)}</div>
  );
}

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

/*
Every state setter in this file is wrapped so that a setter called while a
functional updater is running is counted. An updater has to be pure: React may
run it twice, or later during render, so asking for a reload from inside one
fired at times nothing could predict. The wrapper is otherwise transparent, and
its one extra hook is called on every render, so hook order is unchanged.
*/
const purity = vi.hoisted(() => ({ depth: 0, setsInsideUpdater: 0 }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  function useState<S>(initial: S | (() => S)) {
    const [state, setState] = actual.useState(initial);
    const wrapped = actual.useRef<React.Dispatch<
      React.SetStateAction<S>
    > | null>(null);
    if (!wrapped.current) {
      wrapped.current = (action) => {
        if (purity.depth > 0) {
          purity.setsInsideUpdater += 1;
        }
        if (typeof action !== 'function') {
          setState(action);
          return;
        }
        setState((previous) => {
          purity.depth += 1;
          try {
            return (action as (prev: S) => S)(previous);
          } finally {
            purity.depth -= 1;
          }
        });
      };
    }
    return [state, wrapped.current] as const;
  }
  return { ...actual, default: { ...actual, useState }, useState };
});

describe('useWsWorkflowApprovals hook', () => {
  let debug: typeof global.console.debug;
  beforeEach(() => {
    debug = global.console.debug;
    global.console.debug = () => {};
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
    const fetchWorkflowApprovals = vi.fn(() => []);
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
    const fetchWorkflowApprovals = vi.fn(() => []);
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
    const fetchWorkflowApprovals = vi.fn(() => []);
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

  test('should ask for a reload without a side effect in a state updater', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const fetchWorkflowApprovals = vi.fn(() => []);
    purity.setsInsideUpdater = 0;
    await act(async () => {
      renderWithContexts(
        <Test
          workflowApprovals={[{ id: 1, status: 'pending' }]}
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
    expect(purity.setsInsideUpdater).toBe(0);
  });
});
