import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useLingui } from '@lingui/react/macro';

import { Card, PageSection } from '@patternfly/react-core';
import { HostsAPI, InventoriesAPI } from 'api';
import RunSelectionMenu from 'components/JobList/RunSelectionMenu';
import AlertModal from 'components/AlertModal';
import DataListToolbar from 'components/DataListToolbar';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import useCachedRequest from 'hooks/useCachedRequest';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import type { QSParams, QSParamValue } from 'util/qs';
import { encodeQueryString, getQSConfig, parseQueryString } from 'util/qs';

import HostListItem from './HostListItem';
import SmartInventoryButton from './SmartInventoryButton';

const QS_CONFIG = getQSConfig('host', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function HostList() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const location = useLocation();
  const parsedQueryStrings = parseQueryString(QS_CONFIG, location.search);
  const nonDefaultSearchParams: QSParams = {};

  Object.keys(parsedQueryStrings).forEach((key) => {
    if (!QS_CONFIG.defaultParams[key]) {
      nonDefaultSearchParams[key] = parsedQueryStrings[key] as QSParamValue;
    }
  });

  const hasAnsibleFactsKeys = () => {
    const nonDefaultSearchValues = Object.values(nonDefaultSearchParams);
    return (
      nonDefaultSearchValues.filter((value) =>
        String(value).includes('ansible_facts')
      ).length > 0
    );
  };

  const hasInvalidHostFilterKeys = () => {
    const nonDefaultSearchKeys = Object.keys(nonDefaultSearchParams);
    return (
      nonDefaultSearchKeys.filter((searchKey) => searchKey.startsWith('not__'))
        .length > 0 ||
      nonDefaultSearchKeys.filter((searchKey) => searchKey.endsWith('__search'))
        .length > 0
    );
  };

  const {
    result: { hosts, count, actions, relatedSearchableKeys, searchableKeys },
    error: contentError,
    isLoading,
    request: fetchHosts,
  } = useCachedRequest(
    ['host-list', location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const results = await Promise.all([
        HostsAPI.read({
          ...params,
          not__inventory__kind__in: 'smart,constructed,federated',
        }),
        HostsAPI.readOptions(),
      ]);
      return {
        hosts: results[0].data.results,
        count: results[0].data.count,
        actions: results[1].data.actions,
        relatedSearchableKeys: (
          results[1]?.data?.related_search_fields || []
        ).map((val) => (val.endsWith('search') ? val.slice(0, -8) : val)),
        searchableKeys: getSearchableKeys(results[1].data.actions?.GET),
      };
    }, [location]),
    {
      hosts: [],
      count: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(hosts);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteHosts,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () => Promise.all(selected.map((host) => HostsAPI.destroy(host.id))),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchHosts,
    }
  );

  const handleHostDelete = async () => {
    await deleteHosts();
    clearSelected();
  };

  /*
   * An ad hoc command runs against one inventory, and this list is every
   * inventory's hosts: the command is offered once the selection is from a
   * single inventory, and the limit it runs with is the hosts selected.
   */
  const [isAdHocLaunchLoading, setIsAdHocLaunchLoading] = useState(false);
  const selectedInventoryIds = [
    ...new Set(selected.map((host) => host.inventory)),
  ];
  const adHocInventoryId =
    selectedInventoryIds.length === 1 ? selectedInventoryIds[0] : null;

  const {
    result: { moduleOptions, isAdHocDisabled },
    request: fetchAdHocOptions,
  } = useRequest(
    useCallback(async () => {
      if (!adHocInventoryId) {
        return { moduleOptions: [], isAdHocDisabled: true };
      }
      const { data } = await InventoriesAPI.readAdHocOptions(
        adHocInventoryId as number
      );
      return {
        moduleOptions: data.actions.GET?.module_name?.choices ?? [],
        isAdHocDisabled: !data.actions.POST,
      };
    }, [adHocInventoryId]),
    { moduleOptions: [], isAdHocDisabled: true }
  );

  // Only once a selection names an inventory: there is nothing to ask the api
  // about until then, and the answer is the same as the value it starts with.
  useEffect(() => {
    if (adHocInventoryId) {
      fetchAdHocOptions();
    }
  }, [adHocInventoryId, fetchAdHocOptions]);

  const handleSmartInventoryClick = () => {
    navigate(
      `/inventories/smart_inventory/add?host_filter=${encodeURIComponent(
        encodeQueryString(nonDefaultSearchParams)
      )}`
    );
  };

  const canAdd =
    actions && Object.prototype.hasOwnProperty.call(actions, 'POST');

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <PaginatedTable
          contentError={contentError}
          hasContentLoading={
            isLoading || isDeleteLoading || isAdHocLaunchLoading
          }
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
              name: t`Description`,
              key: 'description__icontains',
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
          toolbarSearchableKeys={searchableKeys}
          toolbarRelatedSearchableKeys={relatedSearchableKeys}
          headerRow={
            <HeaderRow qsConfig={QS_CONFIG}>
              <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
              <HeaderCell>{t`Activity`}</HeaderCell>
              <HeaderCell sortKey="description">{t`Description`}</HeaderCell>
              <HeaderCell>{t`Inventory`}</HeaderCell>
              <HeaderCell>{t`Actions`}</HeaderCell>
            </HeaderRow>
          }
          renderToolbar={(props) => (
            <DataListToolbar
              {...props}
              isAllSelected={isAllSelected}
              onSelectAll={selectAll}
              qsConfig={QS_CONFIG}
              additionalControls={[
                <RunSelectionMenu
                  key="run"
                  ouiaId="host-list-run-menu"
                  items={selected}
                  inventoryId={adHocInventoryId}
                  moduleOptions={moduleOptions}
                  onLaunchLoading={setIsAdHocLaunchLoading}
                  /* Until the selection names an inventory there is nothing
                     to ask, so the command shows and says what it wants. */
                  canRunCommand={!adHocInventoryId || !isAdHocDisabled}
                  spansInventories={selectedInventoryIds.length > 1}
                />,
                ...(canAdd
                  ? [
                      <ToolbarAddButton
                        key="add"
                        linkTo="/hosts/add"
                        tooltip={t`Add Host`}
                      />,
                    ]
                  : []),
                <ToolbarDeleteButton
                  key="delete"
                  onDelete={handleHostDelete}
                  itemsToDelete={selected}
                  pluralizedItemName={t`Hosts`}
                />,
                ...(canAdd
                  ? [
                      <SmartInventoryButton
                        hasInvalidKeys={hasInvalidHostFilterKeys()}
                        hasAnsibleFactsKeys={hasAnsibleFactsKeys()}
                        isDisabled={
                          Object.keys(nonDefaultSearchParams).length === 0 ||
                          hasInvalidHostFilterKeys() ||
                          hasAnsibleFactsKeys()
                        }
                        onClick={() => handleSmartInventoryClick()}
                      />,
                    ]
                  : []),
              ]}
            />
          )}
          renderRow={(host, index) => (
            <HostListItem
              key={host.id}
              host={host}
              detailUrl={`/hosts/${host.id}/details`}
              isSelected={selected.some((row) => row.id === host.id)}
              onSelect={() => handleSelect(host)}
              rowIndex={index}
            />
          )}
        />
      </Card>
      {Boolean(deletionError) && (
        <AlertModal
          isOpen={Boolean(deletionError)}
          variant="error"
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to delete one or more hosts.`}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </PageSection>
  );
}

export default HostList;
