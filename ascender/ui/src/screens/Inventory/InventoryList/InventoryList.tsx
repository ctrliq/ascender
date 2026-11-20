import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Plural, useLingui } from '@lingui/react/macro';
import { Card, PageSection, DropdownItem } from '@patternfly/react-core';

import { InventoriesAPI } from 'api';
import useCachedRequest from 'hooks/useCachedRequest';
import { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import useToast, { AlertVariant } from 'hooks/useToast';
import AlertModal from 'components/AlertModal';
import DatalistToolbar from 'components/DataListToolbar';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarDeleteButton,
  ToolbarSyncButton,
  getSearchableKeys,
  getSearchFilters,
  readEveryPage,
} from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import AddDropDownButton from 'components/AddDropDownButton';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import useWsInventories from './useWsInventories';
import InventoryListItem from './InventoryListItem';

const QS_CONFIG = getQSConfig('inventory', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function InventoryList() {
  const location = useLocation();
  const navigate = useNavigate();
  const { addToast, Toast, toastProps } = useToast();
  const { t } = useLingui();

  const {
    result: {
      results,
      itemCount,
      sourcedCount,
      syncableCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
    error: contentError,
    isLoading,
    request: fetchInventories,
  } = useCachedRequest(
    ['inventory-list', location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      /* The counts are taken within the search, as Sync All reads within
         it, so the button never offers what the list in front of the reader
         has filtered out. */
      const searchFilters = getSearchFilters(QS_CONFIG, location.search);
      const [response, actionsResponse, sourced, syncable] = await Promise.all([
        InventoriesAPI.read(params),
        InventoriesAPI.readOptions(),
        /* How many have a source to read at all, which is what says
             whether the sync button does anything: an inventory whose hosts
             were typed in has none, and a new installation has no
             inventories. */
        InventoriesAPI.read({
          ...searchFilters,
          has_inventory_sources: true,
          page_size: 1,
        }),
        /* And how many of those this reader may sync. The api checks the
             inventory's update role before syncing its sources, and that
             role is not among the user_capabilities an inventory carries:
             edit is its admin role and adhoc its ad hoc role, and a reader
             given only the update role has neither. So it is asked of the
             api by role instead. */
        InventoriesAPI.read({
          ...searchFilters,
          has_inventory_sources: true,
          role_level: 'update_role',
          page_size: 1,
        }),
      ]);
      return {
        results: response.data.results,
        itemCount: response.data.count,
        sourcedCount: sourced.data.count,
        syncableCount: syncable.data.count,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location]),
    {
      results: [],
      itemCount: 0,
      sourcedCount: 0,
      syncableCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const fetchInventoriesById = useCallback(
    async (ids: number[]) => {
      const params = { ...parseQueryString(QS_CONFIG, location.search) };
      params.id__in = ids.join(',');
      const { data } = await InventoriesAPI.read(params);
      return data.results;
    },
    [location.search]
  );

  const inventories = useWsInventories(
    results,
    fetchInventories,
    fetchInventoriesById,
    QS_CONFIG
  );

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(inventories);

  /*
   * The update role question again, for the rows ticked, which is what says
   * whether a ticked one may be synced. It is asked only once a row with a
   * source is ticked, and once per row, rather than after every read of the
   * list: asked there it made each page wait on a second round trip for an
   * answer only a sync of ticked rows ever uses.
   */
  const [updatable, setUpdatable] = useState<Record<number, boolean>>({});
  const askedUpdatable = useRef(new Set<number>());

  useEffect(() => {
    const ids = selected
      .filter(
        ({ id, has_inventory_sources }) =>
          has_inventory_sources && !askedUpdatable.current.has(id)
      )
      .map(({ id }) => id);
    if (!ids.length) {
      return;
    }
    ids.forEach((id) => askedUpdatable.current.add(id));
    InventoriesAPI.read({
      id__in: ids.join(','),
      role_level: 'update_role',
      page_size: ids.length,
    })
      .then(({ data }) => {
        const allowed = new Set(data.results.map(({ id }) => id));
        setUpdatable((current) => ({
          ...current,
          ...Object.fromEntries(ids.map((id) => [id, allowed.has(id)])),
        }));
      })
      .catch(() => {
        // Without an answer the api decides when Sync is clicked, which
        // refuses with its own reason, rather than the row being called
        // refused here. It is asked again the next time the ticks change.
        ids.forEach((id) => askedUpdatable.current.delete(id));
        setUpdatable((current) => ({
          ...current,
          ...Object.fromEntries(ids.map((id) => [id, true])),
        }));
      });
  }, [selected]);

  // A ticked row with a source whose answer has not arrived yet.
  const isCheckingUpdatable = selected.some(
    ({ id, has_inventory_sources }) =>
      has_inventory_sources && updatable[id] === undefined
  );

  // The search in force, which Sync All and its counts read within.
  const searchFilters = getSearchFilters(QS_CONFIG, location.search);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteInventories,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(selected.map((team) => InventoriesAPI.destroy(team.id))),
      [selected]
    ),
    {
      allItemsSelected: isAllSelected,
    }
  );

  const handleInventoryDelete = async () => {
    await deleteInventories();
    clearSelected();
  };

  const handleCopy = useCallback(
    (newInventoryId: number) => {
      addToast({
        id: newInventoryId,
        title: t`Inventory copied successfully`,
        variant: AlertVariant.success,
        hasTimeout: true,
      });
    },
    [addToast, t]
  );

  const hasContentLoading = isDeleteLoading || isLoading;
  const canAdd = actions && actions.POST;

  const deleteDetailsRequests = relatedResourceDeleteRequests.inventory(
    selected[0]
  );

  const addInventory = t`Add Inventory`;
  const addSmartInventory = t`Add Smart Inventory`;
  const addConstructedInventory = t`Add Constructed Inventory`;
  const addFederatedInventory = t`Add Federated Inventory`;
  const addButton = (
    <AddDropDownButton
      ouiaId="add-inventory-button"
      key="add"
      dropdownItems={[
        <DropdownItem
          ouiaId="add-inventory-item"
          onClick={() => navigate('/inventories/inventory/add/')}
          key={addInventory}
          aria-label={addInventory}
        >
          {addInventory}
        </DropdownItem>,
        <DropdownItem
          ouiaId="add-smart-inventory-item"
          onClick={() => navigate('/inventories/smart_inventory/add/')}
          key={addSmartInventory}
          aria-label={addSmartInventory}
        >
          {addSmartInventory}
        </DropdownItem>,
        <DropdownItem
          ouiaId="add-constructed-inventory-item"
          onClick={() => navigate('/inventories/constructed_inventory/add/')}
          key={addConstructedInventory}
          aria-label={addConstructedInventory}
        >
          {addConstructedInventory}
        </DropdownItem>,
        <DropdownItem
          ouiaId="add-federated-inventory-item"
          onClick={() => navigate('/inventories/federated_inventory/add/')}
          key={addFederatedInventory}
          aria-label={addFederatedInventory}
        >
          {addFederatedInventory}
        </DropdownItem>,
      ]}
    />
  );

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Card>
          <PaginatedTable
            contentError={contentError}
            hasContentLoading={hasContentLoading}
            items={inventories}
            itemCount={itemCount}
            pluralizedItemName={t`Inventories`}
            qsConfig={QS_CONFIG}
            toolbarSearchColumns={[
              {
                name: t`Name`,
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: t`Inventory Type`,
                key: 'or__kind',
                options: [
                  ['', t`Inventory`],
                  ['smart', t`Smart Inventory`],
                  ['constructed', t`Constructed Inventory`],
                  ['federated', t`Federated Inventory`],
                ],
              },
              {
                name: t`Organization`,
                key: 'organization__name',
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
            toolbarSortColumns={[
              {
                name: t`Name`,
                key: 'name',
              },
            ]}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
            clearSelected={clearSelected}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
                <HeaderCell>{t`Sync Status`}</HeaderCell>
                <HeaderCell>{t`Type`}</HeaderCell>
                <HeaderCell>{t`Organization`}</HeaderCell>
                <HeaderCell>{t`Actions`}</HeaderCell>
              </HeaderRow>
            }
            renderToolbar={(props) => (
              <DatalistToolbar
                {...props}
                isAllSelected={isAllSelected}
                onSelectAll={selectAll}
                qsConfig={QS_CONFIG}
                additionalControls={[
                  ...(canAdd ? [addButton] : []),
                  <ToolbarDeleteButton
                    key="delete"
                    onDelete={handleInventoryDelete}
                    itemsToDelete={selected}
                    pluralizedItemName={t`Inventories`}
                    deleteDetailsRequests={deleteDetailsRequests}
                    deleteMessage={
                      <Plural
                        value={selected.length}
                        one="This inventory is currently being used by some templates. Are you sure you want to delete it?"
                        other="Deleting these inventories could impact some templates that rely on them. Are you sure you want to delete anyway?"
                      />
                    }
                    warningMessage={
                      <Plural
                        value={selected.length}
                        one="The inventory will be in a pending status until the final delete is processed."
                        other="The inventories will be in a pending status until the final delete is processed."
                      />
                    }
                  />,
                  <ToolbarSyncButton
                    isChecking={isCheckingUpdatable}
                    key="sync"
                    itemsToSync={selected}
                    syncableCount={syncableCount}
                    sourcedCount={sourcedCount}
                    hasSource={(inventory) =>
                      Boolean(inventory.has_inventory_sources)
                    }
                    canSync={(inventory) =>
                      Boolean(inventory.has_inventory_sources) &&
                      Boolean(updatable[inventory.id])
                    }
                    /* Every inventory the search matches that this reader
                       may sync, every page of it, not only the first. */
                    readSyncable={() =>
                      readEveryPage((params) => InventoriesAPI.read(params), {
                        ...searchFilters,
                        has_inventory_sources: true,
                        role_level: 'update_role',
                      })
                    }
                    isSearched={Object.keys(searchFilters).length > 0}
                    /* One call syncs every source the inventory holds, which
                       is what its own sources tab does with its Sync all. */
                    sync={(inventory) =>
                      InventoriesAPI.syncAllSources(inventory.id)
                    }
                    pluralizedItemName={t`Inventories`}
                  />,
                ]}
              />
            )}
            renderRow={(inventory, index) => (
              <InventoryListItem
                key={inventory.id}
                value={inventory.name}
                inventory={inventory}
                rowIndex={index}
                fetchInventories={fetchInventories}
                onSelect={() => {
                  if (!inventory.pending_deletion) {
                    handleSelect(inventory);
                  }
                }}
                onCopy={handleCopy}
                isSelected={selected.some((row) => row.id === inventory.id)}
              />
            )}
          />
        </Card>
        <AlertModal
          isOpen={Boolean(deletionError)}
          variant="error"
          aria-label={t`Deletion Error`}
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to delete one or more inventories.`}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      </PageSection>
      <Toast {...toastProps} />
    </>
  );
}

export default InventoryList;
