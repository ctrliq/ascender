import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import WS from 'vitest-websocket-mock';
import useWebsocket from './useWebsocket';

function Test({ enabled = true }: { enabled?: boolean }) {
  const message = useWebsocket({ jobs: ['status_changed'] }, enabled);
  return <div data-testid="message">{JSON.stringify(message)}</div>;
}

function getMessage() {
  return JSON.parse(
    document.querySelector('[data-testid="message"]')!.textContent as string
  );
}

describe('useWebsocket', () => {
  let debug: typeof global.console.debug;
  let mockServer: WS | null;

  beforeEach(() => {
    debug = global.console.debug;
    global.console.debug = () => {};
    global.document.cookie = 'csrftoken=abc123';
    WS.clean();
  });

  afterEach(() => {
    global.console.debug = debug;
    if (mockServer) {
      mockServer.close();
    }
    WS.clean();
  });

  test('clears the last message when disabled and does not replay it on re-enable', async () => {
    mockServer = new WS('ws://localhost/websocket/');
    const view = render(<Test />);

    await mockServer.connected;
    await act(async () => {
      mockServer!.send(
        JSON.stringify({ unified_job_id: 1, status: 'running' })
      );
    });
    await waitFor(() =>
      expect(getMessage()).toEqual({ unified_job_id: 1, status: 'running' })
    );

    view.rerender(<Test enabled={false} />);
    await waitFor(() => expect(getMessage()).toBeNull());

    view.rerender(<Test />);
    await waitFor(() => expect(getMessage()).toBeNull());
  });
});
