import React from 'react';
import { act, render } from '@testing-library/react';
import type { WebsocketMessage } from 'hooks/useWebsocket';
import useThrottledRefetch from './useThrottledRefetch';

const websocket = vi.hoisted(() => {
  type Message = Record<string, unknown> | null;
  const state = {
    message: null as Message,
    listeners: new Set<(message: Message) => void>(),
  };
  return {
    listeners: state.listeners,
    emit(message: Message) {
      state.message = message;
      state.listeners.forEach((listener) => listener(message));
    },
    reset() {
      state.message = null;
      state.listeners.clear();
    },
  };
});

vi.mock('hooks/useWebsocket', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  const useWebsocketMock = (_groups: unknown, enabled = true) => {
    const [lastMessage, setLastMessage] = ReactLib.useState<Record<
      string,
      unknown
    > | null>(null);
    ReactLib.useEffect(() => {
      if (!enabled) return () => {};
      const listener = (message: Record<string, unknown> | null) =>
        setLastMessage(message);
      websocket.listeners.add(listener);
      return () => {
        websocket.listeners.delete(listener);
      };
    }, [enabled]);
    return enabled ? lastMessage : null;
  };
  return { default: useWebsocketMock };
});

function Test({
  refetch,
  shouldRefetch = () => true,
  shouldEject = () => false,
  enabled = true,
  throttleMs = 2000,
  ejectionThrottleMs = 10000,
  safetyIntervalMs = 30000,
  safetyJitterMs = 0,
}: {
  refetch: () => Promise<unknown>;
  shouldRefetch?: (message: WebsocketMessage) => boolean;
  shouldEject?: (message: WebsocketMessage) => boolean;
  enabled?: boolean;
  throttleMs?: number;
  ejectionThrottleMs?: number;
  safetyIntervalMs?: number;
  safetyJitterMs?: number;
}) {
  useThrottledRefetch({
    refetch,
    shouldRefetch,
    shouldEject,
    enabled,
    throttleMs,
    ejectionThrottleMs,
    safetyIntervalMs,
    safetyJitterMs,
  });
  return <div />;
}

function emit(message: Record<string, unknown>) {
  websocket.emit(message);
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useThrottledRefetch', () => {
  const originalHidden = document.hidden;

  beforeEach(() => {
    websocket.reset();
    setHidden(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    setHidden(originalHidden);
  });

  test('refetches on the leading edge and coalesces the trailing edge', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    render(<Test refetch={refetch} throttleMs={2000} />);

    await act(async () => {
      emit({ unified_job_id: 1, status: 'running' });
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    // a message inside the two-second window only schedules a trailing fetch
    await act(async () => {
      emit({ unified_job_id: 2, status: 'running' });
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  test('never overlaps requests', async () => {
    let resolveFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const refetch = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue(undefined);

    render(<Test refetch={refetch} throttleMs={2000} />);

    await act(async () => {
      emit({ unified_job_id: 1, status: 'running' });
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    // messages that arrive while the first request is still open are coalesced
    await act(async () => {
      emit({ unified_job_id: 2, status: 'running' });
      emit({ unified_job_id: 3, status: 'running' });
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.();
      await Promise.resolve();
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  test('pauses while the tab is hidden and catches up when it becomes visible', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    render(<Test refetch={refetch} throttleMs={2000} />);

    setHidden(true);
    await act(async () => {
      emit({ unified_job_id: 1, status: 'running' });
    });
    expect(refetch).not.toHaveBeenCalled();

    setHidden(false);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test('skips messages that cannot change the page', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    const shouldRefetch = vi.fn(() => false);
    render(
      <Test refetch={refetch} shouldRefetch={shouldRefetch} throttleMs={2000} />
    );

    await act(async () => {
      emit({ unified_job_id: 1, status: 'successful' });
    });
    expect(shouldRefetch).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });

  test('runs a slow safety refetch for dropped messages', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    render(
      <Test refetch={refetch} throttleMs={2000} safetyIntervalMs={30000} />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test('does not refetch when disabled', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    render(<Test refetch={refetch} enabled={false} throttleMs={2000} />);

    await act(async () => {
      emit({ unified_job_id: 1, status: 'running' });
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(refetch).not.toHaveBeenCalled();
  });
  test('gives terminal ejections their own 10s throttle', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    const shouldRefetch = vi.fn(
      (message: WebsocketMessage) => message.status === 'running'
    );
    const shouldEject = vi.fn(
      (message: WebsocketMessage) => message.status === 'successful'
    );
    render(
      <Test
        refetch={refetch}
        shouldRefetch={shouldRefetch}
        shouldEject={shouldEject}
        ejectionThrottleMs={10000}
        safetyIntervalMs={60000}
        safetyJitterMs={0}
      />
    );

    await act(async () => {
      emit({ unified_job_id: 1, status: 'running' });
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      emit({ unified_job_id: 2, status: 'successful' });
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999);
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  test('lets a later full page satisfy a pending ejection', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    const shouldRefetch = vi.fn(
      (message: WebsocketMessage) => message.status === 'running'
    );
    const shouldEject = vi.fn(
      (message: WebsocketMessage) => message.status === 'successful'
    );
    render(
      <Test
        refetch={refetch}
        shouldRefetch={shouldRefetch}
        shouldEject={shouldEject}
        ejectionThrottleMs={10000}
        safetyIntervalMs={60000}
        safetyJitterMs={0}
      />
    );

    await act(async () => {
      emit({ unified_job_id: 1, status: 'running' });
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      emit({ unified_job_id: 2, status: 'successful' });
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    // A structural message inside the full-page throttle window schedules the
    // trailing page, which starts after the ejection message and includes it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      emit({ unified_job_id: 3, status: 'running' });
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(refetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  test('adds the configured jitter to the safety interval', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const refetch = vi.fn().mockResolvedValue(undefined);
    render(
      <Test refetch={refetch} safetyIntervalMs={30000} safetyJitterMs={10000} />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(34999);
    });
    expect(refetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    random.mockRestore();
  });
});
