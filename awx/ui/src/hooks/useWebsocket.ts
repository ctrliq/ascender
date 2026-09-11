import { useState, useEffect, useRef } from 'react';

/** The group subscription the API expects on connect. */
export type SubscribeGroups = Record<string, string[]>;

export default function useWebsocket(
  subscribeGroups: SubscribeGroups
): Record<string, unknown> | null {
  const [lastMessage, setLastMessage] = useState<Record<
    string,
    unknown
  > | null>(null);
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
