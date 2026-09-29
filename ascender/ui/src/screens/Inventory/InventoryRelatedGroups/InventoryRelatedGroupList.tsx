import type { ApiEntity, Group } from 'types/api';
import React, { useCallback, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useLocation, useNavigate, useParams } from 'react-router';

import { GroupsAPI, InventoriesAPI } from 'api';
import useCachedRequest from 'hooks/useCachedRequest';
import { useDismissableError } from 'hooks/useRequest';
import {
  getQSConfig,
  parseQueryString,
  mergeParams,
  updateQueryString,
} from 'util/qs';
import useSelected from 'hooks/useSelected';

import DataListToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import RunSelectionMenu from 'components/JobList/RunSelectionMenu';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import AssociateModal from 'components/AssociateModal';
import DisassociateButton from 'components/DisassociateButton';
import type { QSParams } from 'util/qs';
import InventoryGroupRelatedGroupListItem from './InventoryRelatedGroupListItem';
import { isReadOnlyInventoryType } from '../shared/utils';

const QS_CONFIG = getQSConfig('group', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});
export interface InventoryRelatedGroupListProps {
  /**
   * The group this list sits under, which a run with nothing ticked is
   * aimed at rather than at the whole inventory.
   */
  inventoryGroup?: Group;
}

function InventoryRelatedGroupList({
  inventoryGroup,
}: InventoryRelatedGroupListProps = {}) {
  const { t } = useLingui();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdHocLaunchLoading, setIsAdHocLaunchLoading] = useState(false);
  const [associateError, setAssociateError] = useState<unknown>(null);
  const [disassociateError, setDisassociateError] = useState<unknown>(null);
  const {
    id: inventoryId,
    groupId,
    inventoryType,
  } = useParams() as { id: string; groupId: string; inventoryType: string };
  const navigate = useNavigate();
  const location = useLocation();

  const {
    request: fetchRelated,
    result: {
      groups,
      itemCount,
      relatedSearchableKeys,
      searchableKeys,
      canAdd,
      moduleOptions,
      isAdHocDisabled,
    },
    isLoading,
    error: contentError,
  } = useCachedRequest(
    ['inventory-related-group-list', groupId, inventoryType, location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actions, adHocOptions] = await Promise.all([
        GroupsAPI.readChildren(groupId, params),
        InventoriesAPI.readGroupsOptions(inventoryId),
        InventoriesAPI.readAdHocOptions(inventoryId),
      ]);

      return {
        moduleOptions:
          adHocOptions.data.actions.GET?.module_name?.choices ?? [],
        isAdHocDisabled: !adHocOptions.data.actions.POST,
        groups: response.data.results,
        itemCount: response.data.count,
        relatedSearchableKeys: (actions?.data?.related_search_fields || []).map(
          (val) => val.slice(0, -8)
        ),
        searchableKeys: getSearchableKeys(actions.data.actions?.GET),
        canAdd:
          actions.data.actions &&
          Object.prototype.hasOwnProperty.call(actions.data.actions, 'POST') &&
          !isReadOnlyInventoryType(inventoryType),
      };
    }, [groupId, location.search, inventoryType, inventoryId]),
    {
      relatedSearchableKeys: [],
      searchableKeys: [],
      groups: [],
      itemCount: 0,
      canAdd: false,
      moduleOptions: [],
      isAdHocDisabled: true,
    }
  );
  const fetchGroupsToAssociate = useCallback(
    (params: QSParams) =>
      GroupsAPI.readPotentialGroups(
        groupId,
        mergeParams(params, { not__id: groupId, not__parents: groupId })
      ),
    [groupId]
  );

  const associateGroup = useCallback(
    async (selectedGroups: ApiEntity[]) => {
      try {
        await Promise.all(
          selectedGroups.map((selected) =>
            GroupsAPI.associateChildGroup(groupId, selected.id as number)
          )
        );
      } catch (err) {
        setAssociateError(err);
      }
      fetchRelated();
    },
    [groupId, fetchRelated]
  );

  const { selected, isAllSelected, handleSelect, setSelected, clearSelected } =
    useSelected(groups);

  const disassociateGroups = useCallback(async () => {
    try {
      await Promise.all(
        selected.map(({ id: childId }) =>
          GroupsAPI.disassociateChildGroup(parseInt(groupId, 10), childId)
        )
      );
    } catch (err) {
      setDisassociateError(err);
      fetchRelated();
      setSelected([]);
      return;
    }
    setSelected([]);
    /*
     * Taking every group off a page past the first would leave it empty, so
     * step back one instead, the way useDeleteItems does for the other lists.
     * The new address fetches the list by itself.
     */
    const page = Number(parseQueryString(QS_CONFIG, location.search).page ?? 1);
    if (page > 1 && isAllSelected) {
      const qs = updateQueryString(QS_CONFIG, location.search, {
        page: page - 1,
      });
      navigate(`${location.pathname}?${qs}`);
      return;
    }
    fetchRelated();
  }, [
    groupId,
    selected,
    setSelected,
    fetchRelated,
    isAllSelected,
    location.pathname,
    location.search,
    navigate,
  ]);

  const fetchGroupsOptions = useCallback(
    () => InventoriesAPI.readGroupsOptions(inventoryId),
    [inventoryId]
  );

  const { error, dismissError } = useDismissableError(
    associateError || disassociateError
  );

  const addFormUrl = `/inventories/inventory/${inventoryId}/groups/${groupId}/nested_groups/add`;

  /*
   * Two buttons rather than one menu, each saying what it does: Add makes a
   * new group in this group, Associate puts an existing one in it.
   */
  const addButtons = [
    <ToolbarAddButton
      key="add"
      ouiaId="related-groups-add-button"
      tooltip={t`Add Group`}
      linkTo={addFormUrl}
    />,
    <ToolbarAddButton
      key="associate"
      ouiaId="related-groups-associate-button"
      defaultLabel={t`Associate`}
      tooltip={t`Associate Group`}
      onClick={() => setIsModalOpen(true)}
    />,
  ];
  const isNotReadOnlyInventory = !isReadOnlyInventoryType(inventoryType);
  return (
    <>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading || isAdHocLaunchLoading}
        items={groups}
        itemCount={itemCount}
        pluralizedItemName={t`Related Groups`}
        qsConfig={QS_CONFIG}
        clearSelected={clearSelected}
        onRowClick={handleSelect}
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
        toolbarSortColumns={[
          {
            name: t`Name`,
            key: 'name',
          },
        ]}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={(isSelected) =>
              setSelected(isSelected ? [...groups] : [])
            }
            qsConfig={QS_CONFIG}
            additionalControls={[
              <RunSelectionMenu
                key="run"
                ouiaId="inventory-related-group-list-run-menu"
                items={selected}
                inventoryId={inventoryId}
                moduleOptions={moduleOptions}
                onLaunchLoading={setIsAdHocLaunchLoading}
                canRunCommand={!isAdHocDisabled}
                scope={
                  inventoryGroup && {
                    item: inventoryGroup,
                    label: t`Run on Group`,
                  }
                }
              />,
              ...(canAdd ? addButtons : []),

              ...(isNotReadOnlyInventory
                ? [
                    <DisassociateButton
                      key="disassociate"
                      onDisassociate={disassociateGroups}
                      itemsToDisassociate={selected}
                      modalTitle={t`Disassociate these related groups?`}
                    />,
                  ]
                : []),
            ]}
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            {isNotReadOnlyInventory && <HeaderCell>{t`Actions`}</HeaderCell>}
          </HeaderRow>
        }
        renderRow={(group, index) => (
          <InventoryGroupRelatedGroupListItem
            key={group.id}
            rowIndex={index}
            group={group}
            detailUrl={`/inventories/${inventoryType}/${inventoryId}/groups/${group.id}/details`}
            editUrl={`/inventories/${inventoryType}/${inventoryId}/groups/${group.id}/edit`}
            isSelected={selected.some((row) => row.id === group.id)}
            onSelect={() => handleSelect(group)}
          />
        )}
      />
      {isModalOpen && (
        <AssociateModal
          header={t`Groups`}
          fetchRequest={fetchGroupsToAssociate}
          optionsRequest={fetchGroupsOptions}
          isModalOpen={isModalOpen}
          onAssociate={associateGroup}
          onClose={() => setIsModalOpen(false)}
          title={t`Associate Groups`}
        />
      )}
      {error && (
        <AlertModal
          isOpen={error}
          onClose={dismissError}
          title={t`Error!`}
          variant="error"
        >
          {associateError
            ? t`Failed to associate one or more groups.`
            : t`Failed to disassociate one or more groups.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}
export default InventoryRelatedGroupList;
