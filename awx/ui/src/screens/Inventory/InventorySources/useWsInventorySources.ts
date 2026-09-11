import type { InventorySource } from 'types/api';
import { useState, useEffect } from 'react';
import useWebsocket from 'hooks/useWebsocket';
import type { WebsocketMessage } from 'hooks/useWebsocket';

export default function useWsInventorySources(
  initialSources: InventorySource[]
) {
  const [sources, setSources] = useState(initialSources);
  const lastMessage = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setSources(initialSources);
  }, [initialSources]);

  useEffect(() => {
    if (!lastMessage?.unified_job_id || !lastMessage?.inventory_source_id) {
      return;
    }

    const sourceId = lastMessage.inventory_source_id;
    setSources((currentSources) => {
      const index = currentSources.findIndex((s) => s.id === sourceId);
      if (index > -1) {
        return updateSource(currentSources, index, lastMessage);
      }
      return currentSources;
    });
  }, [lastMessage]);

  return sources;
}

/** The row the socket's message describes, with what it reports put on it. */
function updateSource(
  sources: InventorySource[],
  index: number,
  message: WebsocketMessage
): InventorySource[] {
  const current = sources[index] as InventorySource;
  const source: InventorySource = {
    ...current,
    status: message.status as InventorySource['status'],
    last_updated: message.finished ?? '',
    summary_fields: {
      ...current.summary_fields,
      current_job: {
        id: message.unified_job_id as number,
        status: message.status,
        finished: message.finished,
      },
    },
  };
  return [...sources.slice(0, index), source, ...sources.slice(index + 1)];
}
