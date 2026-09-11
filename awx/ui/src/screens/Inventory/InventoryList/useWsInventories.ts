import type { Untyped } from 'types/api';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { parseQueryString, updateQueryString } from 'util/qs';
import useWebsocket from 'hooks/useWebsocket';
import useThrottle from 'hooks/useThrottle';

export default function useWsInventories(
  initialInventories: Untyped,
  fetchInventories: Untyped,
  fetchInventoriesById: Untyped,
  qsConfig: Untyped
) {
  const location = useLocation();
  const navigate = useNavigate();
  const [inventories, setInventories] = useState(initialInventories);
  const [inventoriesToFetch, setInventoriesToFetch] = useState<Untyped[]>([]);
  const throttledInventoriesToFetch = useThrottle(inventoriesToFetch, 5000);
  const lastMessage = useWebsocket({
    inventories: ['status_changed'],
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setInventories(initialInventories);
  }, [initialInventories]);

  const enqueueId = (id: Untyped) => {
    if (!inventoriesToFetch.includes(id)) {
      setInventoriesToFetch((ids) => ids.concat(id));
    }
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
        newInventories.forEach((inventory: Untyped) => {
          const index = inventories.findIndex(
            (i: Untyped) => i.id === inventory.id
          );
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

  useEffect(
    () => {
      if (
        !lastMessage?.inventory_id ||
        (lastMessage.type !== 'inventory_update' &&
          lastMessage.group_name !== 'inventories')
      ) {
        return;
      }
      const index = inventories.findIndex(
        (p: Untyped) => p.id === lastMessage.inventory_id
      );
      if (index === -1) {
        return;
      }

      const params = parseQueryString(qsConfig, location.search);

      const inventory = inventories[index];
      const updatedInventory = {
        ...inventory,
      };

      if (
        lastMessage.group_name === 'inventories' &&
        (lastMessage.status as string) === 'deleted' &&
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
        lastMessage.group_name === 'inventories' &&
        (lastMessage.status as string) === 'deleted'
      ) {
        fetchInventories();
        return;
      }

      if (
        !['pending', 'waiting', 'running', 'pending_deletion'].includes(
          lastMessage.status as string
        )
      ) {
        enqueueId(lastMessage.inventory_id);
        return;
      }

      if (
        lastMessage.group_name === 'inventories' &&
        (lastMessage.status as string) === 'pending_deletion'
      ) {
        updatedInventory.pending_deletion = true;
      }

      if (lastMessage.group_name !== 'inventories') {
        updatedInventory.isSourceSyncRunning = true;
      }

      setInventories([
        ...inventories.slice(0, index),
        updatedInventory,
        ...inventories.slice(index + 1),
      ]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps,
    [lastMessage]
  );

  return inventories;
}
