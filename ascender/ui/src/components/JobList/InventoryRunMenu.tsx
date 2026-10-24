import React, { useCallback, useEffect, useState } from 'react';
import { InventoriesAPI } from 'api';
import useRequest from 'hooks/useRequest';
import type { AdHocItem } from 'components/AdHocCommands/types';
import RunSelectionMenu from './RunSelectionMenu';

export interface InventoryRunMenuProps {
  inventoryId: number;
  /**
   * What the run is aimed at: one host on a host's runs tab, nothing on an
   * inventory's, where nothing ticked means the whole inventory, as it does
   * on the inventory's own hosts list.
   */
  items?: AdHocItem[];
  ouiaId?: string;
  tooltip?: string;
}

/**
 * The hosts list's Run menu, for a runs tab that belongs to an inventory or a
 * host: a job, a workflow or a command, aimed at that inventory or host rather
 * than asking for one first. It reads what the inventory's command endpoint
 * offers, the modules for a command and whether this viewer may start one,
 * the same way the hosts list does.
 */
function InventoryRunMenu({
  inventoryId,
  items = [],
  ouiaId = 'inventory-run-menu',
  tooltip,
}: InventoryRunMenuProps) {
  const [, setIsLaunching] = useState(false);
  const {
    result: { moduleOptions, canRunCommand },
    request: readOptions,
  } = useRequest(
    useCallback(async () => {
      const { data } = await InventoriesAPI.readAdHocOptions(inventoryId);
      return {
        moduleOptions: data.actions.GET?.module_name?.choices ?? [],
        canRunCommand: Boolean(data.actions.POST),
      };
    }, [inventoryId]),
    { moduleOptions: [], canRunCommand: false }
  );

  useEffect(() => {
    readOptions();
  }, [readOptions]);

  return (
    <RunSelectionMenu
      ouiaId={ouiaId}
      items={items}
      inventoryId={inventoryId}
      moduleOptions={moduleOptions}
      onLaunchLoading={setIsLaunching}
      canRunCommand={canRunCommand}
      tooltip={tooltip}
    />
  );
}

export default InventoryRunMenu;
