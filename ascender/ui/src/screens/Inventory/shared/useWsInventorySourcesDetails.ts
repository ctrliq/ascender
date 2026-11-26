import type { InventorySource } from 'types/api';
import type { WebsocketMessage } from 'hooks/useWebsocket';
import { useState, useEffect } from 'react';
import useWebsocket from 'hooks/useWebsocket';
import { InventorySourcesAPI } from 'api';

/**
 * Keeps one inventory source in step with the websocket.
 *
 * Args:
 *   initialSource: the source the screen last fetched.
 *
 * Returns:
 *   The same source, with the update it is running reported as it goes and
 *   re-read in full once that update settles.
 */
export default function useWsInventorySourcesDetails(
  initialSource: InventorySource
) {
  const [source, setSource] = useState(initialSource);
  const messages = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setSource(initialSource);
  }, [initialSource]);

  // Every message in the batch is applied, each on the source the one before
  // it left, so an update that starts and ends in one tick shows its end.
  // The jobs group carries every job the user can see, so only this source's
  // own updates count: another source's sync must not become current_job and
  // offer Cancel on a run that has nothing to do with the one on screen.
  useEffect(
    () => {
      messages.forEach((message) => {
        if (
          !message.unified_job_id ||
          message.type !== 'inventory_update' ||
          message.inventory_source_id !== source.id
        ) {
          return;
        }

        if (
          ['successful', 'failed', 'error', 'canceled'].includes(
            message.status as string
          )
        ) {
          fetchSource();
        }
        setSource((current) => updateSource(current, message));
      });
    },
    [messages] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function fetchSource() {
    const { data } = await InventorySourcesAPI.readDetail(source.id);
    setSource(data);
  }

  return source;
}

function updateSource(
  source: InventorySource,
  message: WebsocketMessage
): InventorySource {
  return {
    ...source,
    summary_fields: {
      ...source.summary_fields,
      current_job: {
        id: message.unified_job_id as number,
        status: message.status,
        finished: message.finished,
      },
    },
  };
}
