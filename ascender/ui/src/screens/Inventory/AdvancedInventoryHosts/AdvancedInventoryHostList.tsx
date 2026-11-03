import type { AnyInventory } from 'types/api';
import React, { useEffect, useCallback, useState } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import DataListToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
} from 'components/PaginatedTable';
import useRequest from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { getQSConfig, parseQueryString } from 'util/qs';
import { InventoriesAPI } from 'api';
import RunSelectionMenu from 'components/JobList/RunSelectionMenu';
import AdvancedInventoryHostListItem from './AdvancedInventoryHostListItem';

const QS_CONFIG = getQSConfig('host', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

export interface AdvancedInventoryHostListProps {
  inventory: AnyInventory;
  [key: string]: unknown;
}

function AdvancedInventoryHostList({
  inventory,
}: AdvancedInventoryHostListProps) {
  const { t } = useLingui();
  const location = useLocation();
  const [isAdHocLaunchLoading, setIsAdHocLaunchLoading] = useState(false);
  const {
    result: { hosts, count, moduleOptions },
    error: contentError,
    isLoading,
    request: fetchHosts,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        {
          data: { results, count: hostCount },
        },
        adHocOptions,
      ] = await Promise.all([
        InventoriesAPI.readHosts(inventory.id, params),
        InventoriesAPI.readAdHocOptions(inventory.id),
      ]);

      return {
        hosts: results,
        count: hostCount,
        moduleOptions:
          adHocOptions.data.actions.GET?.module_name?.choices ?? [],
      };
    }, [location.search, inventory.id]),
    {
      hosts: [],
      count: 0,
      moduleOptions: [],
    }
  );

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(hosts);

  useEffect(() => {
    fetchHosts();
  }, [fetchHosts]);
  const kindToInventoryType = {
    constructed: 'constructed_inventory',
    federated: 'federated_inventory',
  };
  const inventoryType =
    kindToInventoryType[inventory.kind as keyof typeof kindToInventoryType] ||
    'smart_inventory';
  return (
    <PaginatedTable
      contentError={contentError}
      hasContentLoading={isLoading || isAdHocLaunchLoading}
      items={hosts}
      itemCount={count}
      pluralizedItemName={t`Hosts`}
      qsConfig={QS_CONFIG}
      clearSelected={clearSelected}
      toolbarSearchColumns={[
        {
          name: t`Name`,
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: t`Created By (Username)`,
          key: 'created_by__username__icontains',
        },
        {
          name: t`Modified By (Username)`,
          key: 'modified_by__username__icontains',
        },
      ]}
      renderToolbar={(props) => (
        <DataListToolbar
          {...props}
          isAllSelected={isAllSelected}
          onSelectAll={selectAll}
          qsConfig={QS_CONFIG}
          additionalControls={[
            <RunSelectionMenu
              key="run"
              ouiaId="advanced-inventory-host-list-run-menu"
              items={selected}
              inventoryId={inventory?.id}
              moduleOptions={moduleOptions}
              onLaunchLoading={setIsAdHocLaunchLoading}
              canRunCommand={Boolean(
                inventory?.summary_fields?.user_capabilities?.adhoc
              )}
            />,
          ]}
        />
      )}
      headerRow={
        <HeaderRow qsConfig={QS_CONFIG}>
          <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
          <HeaderCell>{t`Activity`}</HeaderCell>
          <HeaderCell>{t`Inventory`}</HeaderCell>
        </HeaderRow>
      }
      renderRow={(host, index) => (
        <AdvancedInventoryHostListItem
          key={host.id}
          host={host}
          inventoryType={inventoryType}
          detailUrl={`/inventories/${inventoryType}/${inventory.id}/hosts/${host.id}/details`}
          isSelected={selected.some((row) => row.id === host.id)}
          onSelect={() => handleSelect(host)}
          rowIndex={index}
        />
      )}
    />
  );
}

export default AdvancedInventoryHostList;
