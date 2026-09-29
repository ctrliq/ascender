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

/** The batch handed back before anything has arrived, shared so it is stable. */
const NO_MESSAGES: WebsocketMessage[] = [];

/**
 * Subscribes to the given groups and hands back what the socket sends.
 *
 * Every message is delivered, in the order it arrived. Two messages landing in
 * the same tick (two jobs changing status together, two project syncs ending
 * at once) are rendered in one pass, so a hook that kept only the latest one
 * would lose the first. Instead the messages queue up until they are rendered,
 * and each render hands over the batch that arrived since the last one.
 *
 * A batch keeps its identity for as long as it is the one being rendered, so a
 * consumer reads it in an effect keyed on the array and loops over it; that
 * effect runs once per batch. Consumers that fold messages into their own state have to do
 * it with functional updates, since every message in a batch is applied
 * against the state the one before it left.
 *
 * Args:
 *   subscribeGroups: the groups to join, sent once the socket opens.
 *
 * Returns:
 *   The messages that arrived since the previous render, oldest first. Empty
 *   until the first one arrives, and again once a batch has been handed over.
 */
export default function useWebsocket(
  subscribeGroups: SubscribeGroups
): WebsocketMessage[] {
  const [messages, setMessages] = useState<WebsocketMessage[]>(NO_MESSAGES);
  const ws = useRef<WebSocket | null>(null);

  // Once a batch has been committed, and so seen by every effect reading it,
  // it is taken off the front of the queue. The update drops that batch only
  // when it still leads the queue: anything that arrived since stays for the
  // next render, and a second run of this effect (strict mode) drops nothing
  // further. Messages are fresh objects off JSON.parse, so the first one is
  // enough to recognise the batch by.
  useEffect(() => {
    if (!messages.length) {
      return;
    }
    const delivered = messages;
    setMessages((queued) => {
      if (queued[0] !== delivered[0]) {
        return queued;
      }
      const rest = queued.slice(delivered.length);
      return rest.length ? rest : NO_MESSAGES;
    });
  }, [messages]);

  useEffect(() => {
    let shouldReconnect = true;
    // The pending reconnect, kept so unmounting can cancel it. Left running, it
    // would open a fresh socket after cleanup had already closed the old one,
    // and nothing would ever close that orphan.
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

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
        const message = JSON.parse(e.data) as WebsocketMessage;
        // Appended rather than set, so a message that lands before React has
        // rendered the previous one waits beside it instead of replacing it.
        setMessages((queued) => [...queued, message]);
      };

      ws.current.onclose = (e: CloseEvent) => {
        if (shouldReconnect && e.code !== 1000) {
          // eslint-disable-next-line no-console
          console.debug('Socket closed. Reconnecting...', e);
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = undefined;
            if (shouldReconnect) {
              connect();
            }
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
      clearTimeout(reconnectTimeout);
      if (ws.current) {
        ws.current?.close();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return messages;
}
