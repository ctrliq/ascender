import type { JobEvent } from './useJobEvents';

/**
 * What the job websocket pushes down. Two groups share the one socket: the
 * jobs group, which reports a job's status, and the per type events group,
 * whose messages are job events with the group name added.
 */
export type JobSocketMessage = JobEvent & {
  group_name?: string;
  unified_job_id?: number;
  final_counter?: number;
  status?: string;
};

/** The job the socket subscribes for: its type names the events group. */
export interface JobSocketTarget {
  type?: string | null;
  id?: number;
}

export default function connectJobSocket(
  { type, id }: JobSocketTarget,
  onMessage: (message: JobSocketMessage) => void
) {
  const ws = new WebSocket(
    `${window.location.protocol === 'http:' ? 'ws:' : 'wss:'}//${
      window.location.host
    }${window.location.pathname}websocket/`
  );

  ws.onopen = () => {
    const xrftoken = `; ${document.cookie}`
      .split('; csrftoken=')
      .pop()
      ?.split(';')
      .shift();
    const eventGroup = `${type}_events`;
    ws.send(
      JSON.stringify({
        xrftoken,
        groups: { jobs: ['summary', 'status_changed'], [eventGroup]: [id] },
      })
    );
  };

  ws.onmessage = (e) => {
    onMessage(JSON.parse(e.data as string) as JobSocketMessage);
  };

  ws.onclose = (e) => {
    if (e.code !== 1000) {
      // eslint-disable-next-line no-console
      console.debug('Socket closed. Reconnecting...', e);
      setTimeout(() => {
        connectJobSocket({ type, id }, onMessage);
      }, 1000);
    }
  };

  ws.onerror = (err) => {
    // eslint-disable-next-line no-console
    console.debug('Socket error: ', err, 'Disconnecting...');
    ws.close();
  };

  return ws; // Return the ws instance so the caller can manage it
}

export function closeWebSocket(ws: WebSocket | null) {
  if (ws) {
    ws.close();
  }
}
