import React, { useEffect, useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';

import DataListToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
} from 'components/PaginatedTable';
import useRequest from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { getQSConfig, parseQueryString } from 'util/qs';
import { InventoriesAPI } from 'api';
import { Inventory } from 'types';
import AdHocCommands from 'components/AdHocCommands/AdHocCommands';
import AdvancedInventoryHostListItem from './AdvancedInventoryHostListItem';

const QS_CONFIG = getQSConfig('host', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function AdvancedInventoryHostList({ inventory }) {
  const { i18n } = useLingui();
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
        moduleOptions: adHocOptions.data.actions.GET.module_name.choices,
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
  const inventoryType =
    inventory.kind === 'constructed'
      ? 'constructed_inventory'
      : 'smart_inventory';
  return (
    <PaginatedTable
      contentError={contentError}
      hasContentLoading={isLoading || isAdHocLaunchLoading}
      items={hosts}
      itemCount={count}
      pluralizedItemName={i18n._(t`Hosts`)}
      qsConfig={QS_CONFIG}
      clearSelected={clearSelected}
      toolbarSearchColumns={[
        {
          name: i18n._(t`Name`),
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: i18n._(t`Created by (username)`),
          key: 'created_by__username',
        },
        {
          name: i18n._(t`Modified by (username)`),
          key: 'modified_by__username',
        },
      ]}
      renderToolbar={(props) => (
        <DataListToolbar
          {...props}
          isAllSelected={isAllSelected}
          onSelectAll={selectAll}
          qsConfig={QS_CONFIG}
          additionalControls={
            inventory?.summary_fields?.user_capabilities?.adhoc
              ? [
                  <AdHocCommands
                    adHocItems={selected}
                    hasListItems={count > 0}
                    onLaunchLoading={setIsAdHocLaunchLoading}
                    moduleOptions={moduleOptions}
                  />,
                ]
              : []
          }
        />
      )}
      headerRow={
        <HeaderRow qsConfig={QS_CONFIG}>
          <HeaderCell sortKey="name">{i18n._(t`Name`)}</HeaderCell>
          <HeaderCell>{i18n._(t`Recent jobs`)}</HeaderCell>
          <HeaderCell>{i18n._(t`Inventory`)}</HeaderCell>
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

AdvancedInventoryHostList.propTypes = {
  inventory: Inventory.isRequired,
};

export default AdvancedInventoryHostList;
