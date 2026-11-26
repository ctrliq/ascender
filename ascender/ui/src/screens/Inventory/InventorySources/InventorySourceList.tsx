import type { InventorySource } from 'types/api';
import React, { useCallback } from 'react';
import { useLocation, useParams } from 'react-router';
import { Plural, useLingui } from '@lingui/react/macro';

import useCachedRequest from 'hooks/useCachedRequest';
import { useDeleteItems } from 'hooks/useRequest';
import { getQSConfig, parseQueryString } from 'util/qs';
import { InventoriesAPI, InventorySourcesAPI } from 'api';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  ToolbarSyncButton,
  getSearchableKeys,
  getSearchFilters,
  readEveryPage,
} from 'components/PaginatedTable';
import useSelected from 'hooks/useSelected';
import DatalistToolbar from 'components/DataListToolbar';
import AlertModal from 'components/AlertModal/AlertModal';
import ErrorDetail from 'components/ErrorDetail/ErrorDetail';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import InventorySourceListItem from './InventorySourceListItem';
import useWsInventorySources from './useWsInventorySources';

const QS_CONFIG = getQSConfig('inventory-sources', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function InventorySourceList() {
  const { t } = useLingui();
  const { inventoryType, id } = useParams() as {
    inventoryType: string;
    id: string;
  };
  const { search } = useLocation();

  const {
    isLoading,
    error: fetchError,
    result: {
      result,
      sourceCount,
      sourceChoices,
      sourceChoicesOptions,
      searchableKeys,
      relatedSearchableKeys,
    },
    request: fetchSources,
  } = useCachedRequest(
    ['inventory-source-list', id, search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, search);
      const [sources, options] = await Promise.all([
        InventoriesAPI.readSources(id, params),
        InventorySourcesAPI.readOptions(),
      ]);
      return {
        result: sources.data.results,
        sourceCount: sources.data.count,
        sourceChoices: options.data.actions.GET?.source?.choices ?? [],
        sourceChoicesOptions: options.data.actions,
        searchableKeys: getSearchableKeys(options.data.actions.GET),
        relatedSearchableKeys: (options.data.related_search_fields || []).map(
          (val) => val.slice(0, -8)
        ),
      };
    }, [id, search]),
    {
      sourceChoicesOptions: null,
      result: [],
      sourceCount: 0,
      sourceChoices: [],
      searchableKeys: [],
      relatedSearchableKeys: [],
    }
  );

  const sources = useWsInventorySources(result);

  /* The search in force, without the paging, so that Sync All reads the
     same sources the counts on this page were taken from: every source that
     matches, not only the ones on this page, and not ones the search leaves
     out. */
  const searchFilters = getSearchFilters(QS_CONFIG, search);
  const isSearched = Object.keys(searchFilters).length > 0;

  /* Whether the reader may start a sync here. Every source reads it from
     the same place, the inventory's update role, so what one row on the page
     says holds for the whole list; a source has no roles of its own for the
     api to filter the list by. */
  const canSyncSources = sources.some(
    (source) => source.summary_fields.user_capabilities?.start
  );

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(sources);

  const {
    isLoading: isDeleteLoading,
    deleteItems: handleDeleteSources,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map(({ id: sourceId }) =>
            InventorySourcesAPI.destroy(sourceId)
          )
        ),
      [selected]
    ),
    {
      fetchItems: fetchSources,
      allItemsSelected: isAllSelected,
      qsConfig: QS_CONFIG,
    }
  );
  const deleteRelatedInventoryResources = (resourceId: number) => [
    InventorySourcesAPI.destroyHosts(resourceId),
    InventorySourcesAPI.destroyGroups(resourceId),
  ];

  const {
    isLoading: deleteRelatedResourcesLoading,
    deletionError: deleteRelatedResourcesError,
    deleteItems: handleDeleteRelatedResources,
  } = useDeleteItems(
    useCallback(
      async () =>
        Promise.all(
          selected
            .map(({ id: resourceId }) =>
              deleteRelatedInventoryResources(resourceId)
            )
            .flat()
        ),
      [selected]
    )
  );

  const handleDelete = async () => {
    await handleDeleteRelatedResources();
    if (!deleteRelatedResourcesError) {
      await handleDeleteSources();
    }
    clearSelected();
  };
  const canAdd =
    sourceChoicesOptions &&
    Object.prototype.hasOwnProperty.call(sourceChoicesOptions, 'POST');
  const listUrl = `/inventories/${inventoryType}/${id}/sources/`;

  const deleteDetailsRequests = relatedResourceDeleteRequests.inventorySource(
    selected[0]?.id
  );
  return (
    <>
      <PaginatedTable
        contentError={fetchError}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        hasContentLoading={
          isLoading || isDeleteLoading || deleteRelatedResourcesLoading
        }
        items={sources}
        itemCount={sourceCount}
        pluralizedItemName={t`Inventory Sources`}
        qsConfig={QS_CONFIG}
        clearSelected={clearSelected}
        // Its own columns, as every other list has: without them the box
        // searched the exact name, so part of a name, or a name typed in
        // another case, found nothing.
        toolbarSearchColumns={[
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Source`,
            key: 'or__source',
            options: sourceChoices
              .filter(([value]) => value !== null && value !== '')
              .map(([value, label]) => [String(value), String(label)]),
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
          <DatalistToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      tooltip={t`Add Source`}
                      key="add"
                      linkTo={`${listUrl}add`}
                    />,
                  ]
                : []),
              <ToolbarDeleteButton
                key="delete"
                onDelete={handleDelete}
                itemsToDelete={selected}
                pluralizedItemName={t`Inventory Sources`}
                deleteDetailsRequests={deleteDetailsRequests}
                deleteMessage={
                  <Plural
                    value={selected.length}
                    one="This inventory source is currently being used by other resources that rely on it. Are you sure you want to delete it?"
                    other="Deleting these inventory sources could impact other resources that rely on them. Are you sure you want to delete them anyway?"
                  />
                }
              />,
              /* Shown to every reader, as on the projects and inventories
                 lists, and disabled with a tooltip saying why where the
                 reader may start none of these. */
              <ToolbarSyncButton
                key="sync"
                itemsToSync={selected}
                syncableCount={canSyncSources ? sourceCount : 0}
                sourcedCount={sourceCount}
                canSync={(source) =>
                  Boolean(source.summary_fields.user_capabilities?.start)
                }
                /* Nothing ticked is every source the search matches, read
                   from the api rather than off the page in front of the
                   reader, and every page of it. */
                readSyncable={() =>
                  readEveryPage(
                    (params) => InventoriesAPI.readSources(id, params),
                    searchFilters
                  )
                }
                /* Every inventory source has a source, so a list with none
                   to sync is an empty one, or one the search has emptied. */
                emptyTooltip={
                  isSearched
                    ? t`No inventory sources match the current search.`
                    : t`This inventory has no sources to sync.`
                }
                isSearched={isSearched}
                sync={(source) =>
                  InventorySourcesAPI.createSyncStart(source.id)
                }
                pluralizedItemName={t`Inventory Sources`}
              />,
            ]}
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell>{t`Status`}</HeaderCell>
            <HeaderCell>{t`Type`}</HeaderCell>
            <HeaderCell>{t`Actions`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(inventorySource: InventorySource, index: number) => {
          const label = sourceChoices.find(
            ([scMatch]) => inventorySource.source === scMatch
          );
          return (
            <InventorySourceListItem
              key={inventorySource.id}
              source={inventorySource}
              onSelect={() => handleSelect(inventorySource)}
              label={label?.[1]}
              detailUrl={`${listUrl}${inventorySource.id}`}
              isSelected={selected.some((row) => row.id === inventorySource.id)}
              rowIndex={index}
            />
          );
        }}
      />
      {(deletionError || deleteRelatedResourcesError) && (
        <AlertModal
          aria-label={t`Delete error`}
          isOpen={deletionError || deleteRelatedResourcesError}
          variant="error"
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to delete one or more inventory sources.`}
          <ErrorDetail error={deletionError || deleteRelatedResourcesError} />
        </AlertModal>
      )}
    </>
  );
}
export default InventorySourceList;
