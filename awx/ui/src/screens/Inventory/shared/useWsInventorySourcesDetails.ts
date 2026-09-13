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
  const lastMessage = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setSource(initialSource);
  }, [initialSource]);

  useEffect(
    () => {
      if (
        !lastMessage?.unified_job_id ||
        !lastMessage?.inventory_source_id ||
        lastMessage.type !== 'inventory_update'
      ) {
        return;
      }

      if (
        ['successful', 'failed', 'error', 'canceled'].includes(
          lastMessage.status as string
        )
      ) {
        fetchSource();
      }
      setSource(updateSource(source, lastMessage));
    },
    [lastMessage] // eslint-disable-line react-hooks/exhaustive-deps
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
