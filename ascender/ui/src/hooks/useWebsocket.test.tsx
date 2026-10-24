import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import useWebsocket from './useWebsocket';
import type { WebsocketMessage } from './useWebsocket';

/**
 * A stand-in socket that records every instance, so a test can close one with
 * an abnormal code and count whether another was opened afterwards.
 */
class FakeSocket {
  static instances: FakeSocket[] = [];

  onopen: (() => void) | null = null;

  onmessage: ((e: MessageEvent<string>) => void) | null = null;

  onclose: ((e: CloseEvent) => void) | null = null;

  onerror: ((e: Event) => void) | null = null;

  closed = false;

  sent: string[] = [];

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }
}

function Test() {
  useWebsocket({ jobs: ['status_changed'] });
  return <div />;
}

/**
 * Reads the hook the way the screens do, in an effect keyed on what it hands
 * back, and records every message it is given.
 */
function Recorder({ received }: { received: WebsocketMessage[] }) {
  const messages = useWebsocket({ jobs: ['status_changed'] });
  useEffect(() => {
    received.push(...messages);
  }, [messages, received]);
  return <div />;
}

/** Hands the socket a message the way the browser would. */
function deliver(socket: FakeSocket | undefined, message: WebsocketMessage) {
  socket?.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
}

describe('useWebsocket', () => {
  let debug: typeof global.console.debug;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    ({ debug } = global.console);
    global.console.debug = () => {};
  });

  afterEach(() => {
    global.console.debug = debug;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('reconnects after an abnormal close while mounted', () => {
    render(<Test />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(FakeSocket.instances).toHaveLength(1);

    act(() => {
      FakeSocket.instances[0]?.onclose?.({ code: 1006 } as CloseEvent);
      vi.advanceTimersByTime(1000);
    });
    expect(FakeSocket.instances).toHaveLength(2);
  });

  test('does not open a socket after unmount when a reconnect is pending', () => {
    const { unmount } = render(<Test />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(FakeSocket.instances).toHaveLength(1);

    act(() => {
      FakeSocket.instances[0]?.onclose?.({ code: 1006 } as CloseEvent);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('delivers two messages that arrive before a render, in order', () => {
    const received: WebsocketMessage[] = [];
    render(<Recorder received={received} />);
    act(() => {
      vi.advanceTimersByTime(50);
    });

    act(() => {
      deliver(FakeSocket.instances[0], {
        unified_job_id: 1,
        status: 'running',
      });
      deliver(FakeSocket.instances[0], { unified_job_id: 2, status: 'failed' });
    });

    expect(received).toEqual([
      { unified_job_id: 1, status: 'running' },
      { unified_job_id: 2, status: 'failed' },
    ]);
  });

  test('delivers each message once across batches', () => {
    const received: WebsocketMessage[] = [];
    render(<Recorder received={received} />);
    act(() => {
      vi.advanceTimersByTime(50);
    });

    act(() => {
      deliver(FakeSocket.instances[0], { unified_job_id: 1 });
      deliver(FakeSocket.instances[0], { unified_job_id: 2 });
    });
    act(() => {
      deliver(FakeSocket.instances[0], { unified_job_id: 3 });
    });

    expect(received.map((m) => m.unified_job_id)).toEqual([1, 2, 3]);
  });
});
