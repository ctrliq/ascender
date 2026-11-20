import type { AnyInventory } from 'types/api';
import type { QSConfig } from 'util/qs';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { parseQueryString, updateQueryString } from 'util/qs';
import useWebsocket from 'hooks/useWebsocket';
import type { WebsocketMessage } from 'hooks/useWebsocket';
import useThrottle from 'hooks/useThrottle';

export default function useWsInventories(
  initialInventories: AnyInventory[],
  fetchInventories: () => void,
  /** Re-reads the rows the socket says have changed, in one request. */
  fetchInventoriesById: (ids: number[]) => Promise<AnyInventory[]>,
  qsConfig: QSConfig
) {
  const location = useLocation();
  const navigate = useNavigate();
  const [inventories, setInventories] = useState(initialInventories);
  const [inventoriesToFetch, setInventoriesToFetch] = useState<number[]>([]);
  const throttledInventoriesToFetch = useThrottle(inventoriesToFetch, 5000);
  const messages = useWebsocket({
    inventories: ['status_changed'],
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setInventories(initialInventories);
  }, [initialInventories]);

  // Checked against the queue as it stands, so two messages for one
  // inventory in the same batch still queue it once.
  const enqueueId = (id: number) => {
    setInventoriesToFetch((ids) => (ids.includes(id) ? ids : ids.concat(id)));
  };
  useEffect(
    () => {
      (async () => {
        if (!throttledInventoriesToFetch.length) {
          return;
        }
        setInventoriesToFetch([]);
        const newInventories = await fetchInventoriesById(
          throttledInventoriesToFetch
        );
        const updated = [...inventories];
        newInventories.forEach((inventory) => {
          const index = inventories.findIndex((i) => i.id === inventory.id);
          if (index === -1) {
            return;
          }
          updated[index] = inventory;
        });
        setInventories(updated);
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [throttledInventoriesToFetch, fetchInventoriesById]
  );

  // Every message in the batch is applied, in order. Row updates go through
  // functional updates so each one lands on the rows the one before it left;
  // the render's rows only decide whether a message is about this page at all.
  useEffect(
    () => {
      messages.forEach((message) => {
        applyMessage(message);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps,
    [messages]
  );

  /**
   * Puts one socket message on the inventory it names.
   *
   * Args:
   *   message: an inventory or inventory source status change.
   */
  function applyMessage(message: WebsocketMessage) {
    const inventoryId = message.inventory_id;
    if (
      !inventoryId ||
      (message.type !== 'inventory_update' &&
        message.group_name !== 'inventories')
    ) {
      return;
    }
    if (!inventories.some((p) => p.id === inventoryId)) {
      return;
    }

    const params = parseQueryString(qsConfig, location.search);

    // pending_deletion is readonly on the model, so the row the list swaps
    // in is built with it rather than having it written on afterwards.
    const isPendingDeletion =
      message.group_name === 'inventories' &&
      (message.status as string) === 'pending_deletion';

    if (
      message.group_name === 'inventories' &&
      (message.status as string) === 'deleted' &&
      inventories.length === 1 &&
      Number(params.page) > 1
    ) {
      // We've deleted the last inventory on this page so we'll
      // try to navigate back to the previous page
      const qs = updateQueryString(qsConfig, location.search, {
        page: Number(params.page) - 1,
      });
      navigate(`${location.pathname}?${qs}`);
      return;
    }

    if (
      message.group_name === 'inventories' &&
      (message.status as string) === 'deleted'
    ) {
      fetchInventories();
      return;
    }

    if (
      !['pending', 'waiting', 'running', 'pending_deletion'].includes(
        message.status as string
      )
    ) {
      enqueueId(inventoryId);
      return;
    }

    setInventories((current) =>
      current.map((inventory) =>
        inventory.id === inventoryId
          ? ({
              ...inventory,
              ...(isPendingDeletion ? { pending_deletion: true } : {}),
              ...(message.group_name !== 'inventories'
                ? { isSourceSyncRunning: true }
                : {}),
            } as AnyInventory)
          : inventory
      )
    );
  }

  return inventories;
}
