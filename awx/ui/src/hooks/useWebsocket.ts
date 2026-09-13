import { useState, useEffect, useRef } from 'react';

/** The group subscription the API expects on connect. */
export type SubscribeGroups = Record<string, string[]>;

/**
 * One message off the socket, as the screens that watch it read them.
 *
 * Which fields a message carries depends on its group and on what changed, so
 * they are all optional; the index signature keeps the rest reachable.
 */
export interface WebsocketMessage {
  group_name?: string;
  type?: string;
  status?: string;
  finished?: string | null;
  unified_job_id?: number;
  unified_job_template_id?: number;
  project_id?: number;
  inventory_id?: number;
  inventory_source_id?: number;
  workflow_job_id?: number;
  workflow_node_id?: number;
  [key: string]: unknown;
}

export default function useWebsocket(
  subscribeGroups: SubscribeGroups
): WebsocketMessage | null {
  const [lastMessage, setLastMessage] = useState<WebsocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    let shouldReconnect = true;

    const connect = () => {
      ws.current = new WebSocket(
        `${window.location.protocol === 'http:' ? 'ws:' : 'wss:'}//${
          window.location.host
        }${window.location.pathname}websocket/`
      );

      ws.current.onopen = () => {
        // Each step can come back empty when the cookie is absent, which the
        // chained calls used to assume away.
        const xrftoken = `; ${document.cookie}`
          .split('; csrftoken=')
          .pop()
          ?.split(';')
          .shift();
        ws.current?.send(
          JSON.stringify({
            xrftoken,
            groups: subscribeGroups,
          })
        );
      };

      ws.current.onmessage = (e: MessageEvent<string>) => {
        setLastMessage(JSON.parse(e.data) as Record<string, unknown>);
      };

      ws.current.onclose = (e: CloseEvent) => {
        if (shouldReconnect && e.code !== 1000) {
          // eslint-disable-next-line no-console
          console.debug('Socket closed. Reconnecting...', e);
          setTimeout(() => {
            connect();
          }, 1000);
        }
      };

      ws.current.onerror = (err: Event) => {
        // eslint-disable-next-line no-console
        console.debug('Socket error: ', err, 'Disconnecting...');
        ws.current?.close();
      };
    };

    // Delay initial connection by 50ms
    const initialTimeout = setTimeout(connect, 50);

    return () => {
      shouldReconnect = false;
      clearTimeout(initialTimeout);
      if (ws.current) {
        ws.current?.close();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return lastMessage;
}
