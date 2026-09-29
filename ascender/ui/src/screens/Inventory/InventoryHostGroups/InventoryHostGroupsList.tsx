import type { ApiEntity, Host } from 'types/api';
import React, { useState, useCallback } from 'react';
import { useLocation, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import { getQSConfig, parseQueryString, mergeParams } from 'util/qs';
import useCachedRequest from 'hooks/useCachedRequest';
import useRequest, {
  useDismissableError,
  useDeleteItems,
} from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { HostsAPI, InventoriesAPI } from 'api';
import DataListToolbar from 'components/DataListToolbar';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import AssociateModal from 'components/AssociateModal';
import DisassociateButton from 'components/DisassociateButton';
import RunSelectionMenu from 'components/JobList/RunSelectionMenu';
import type { QSParams } from 'util/qs';
import InventoryHostGroupItem from './InventoryHostGroupItem';

const QS_CONFIG = getQSConfig('group', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

export interface InventoryHostGroupsListProps {
  /**
   * The host this list sits under, which a run with nothing ticked is aimed
   * at rather than at the whole inventory.
   */
  host?: Host;
}

function InventoryHostGroupsList({ host }: InventoryHostGroupsListProps = {}) {
  const { t } = useLingui();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdHocLaunchLoading, setIsAdHocLaunchLoading] = useState(false);
  const { hostId, id: invId } = useParams() as { hostId: string; id: string };
  const { search } = useLocation();

  const {
    result: {
      groups,
      itemCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
      moduleOptions,
      isAdHocDisabled,
    },
    error: contentError,
    isLoading,
    request: fetchGroups,
  } = useCachedRequest(
    ['inventory-host-groups-list', hostId, search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, search);

      const [
        {
          data: { count, results },
        },
        hostGroupOptions,
        adHocOptions,
      ] = await Promise.all([
        HostsAPI.readAllGroups(hostId, params),
        HostsAPI.readGroupsOptions(hostId),
        InventoriesAPI.readAdHocOptions(invId),
      ]);

      return {
        moduleOptions:
          adHocOptions.data.actions.GET?.module_name?.choices ?? [],
        isAdHocDisabled: !adHocOptions.data.actions.POST,
        groups: results,
        itemCount: count,
        actions: hostGroupOptions.data.actions,
        relatedSearchableKeys: (
          hostGroupOptions?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(hostGroupOptions.data.actions?.GET),
      };
    }, [hostId, search]), // eslint-disable-line react-hooks/exhaustive-deps
    {
      groups: [],
      itemCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
      moduleOptions: [],
      isAdHocDisabled: true,
    }
  );

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(groups);

  const {
    isLoading: isDisassociateLoading,
    deleteItems: disassociateHosts,
    deletionError: disassociateError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map((group) => HostsAPI.disassociateGroup(hostId, group))
        ),
      [hostId, selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchGroups,
    }
  );

  const handleDisassociate = async () => {
    await disassociateHosts();
    clearSelected();
  };

  const fetchGroupsToAssociate = useCallback(
    (params: QSParams) =>
      InventoriesAPI.readGroups(
        invId,
        mergeParams(params, { not__hosts: hostId })
      ),
    [invId, hostId]
  );

  const fetchGroupsOptions = useCallback(
    () => InventoriesAPI.readGroupsOptions(invId),
    [invId]
  );

  const { request: handleAssociate, error: associateError } = useRequest(
    useCallback(
      async (groupsToAssociate: ApiEntity[]) => {
        await Promise.all(
          groupsToAssociate.map((group) =>
            HostsAPI.associateGroup(hostId, group.id as number)
          )
        );
        fetchGroups();
      },
      [hostId, fetchGroups]
    )
  );

  const { error, dismissError } = useDismissableError(
    associateError || disassociateError
  );

  const canAdd =
    actions && Object.prototype.hasOwnProperty.call(actions, 'POST');

  return (
    <>
      <PaginatedTable
        pluralizedItemName={t`Groups`}
        contentError={contentError}
        hasContentLoading={
          isLoading || isDisassociateLoading || isAdHocLaunchLoading
        }
        items={groups}
        itemCount={itemCount}
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
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell>{t`Actions`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(item, index) => (
          <InventoryHostGroupItem
            key={item.id}
            group={item}
            inventoryId={item.summary_fields.inventory?.id}
            isSelected={selected.some((row) => row.id === item.id)}
            onSelect={() => handleSelect(item)}
            rowIndex={index}
          />
        )}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              <RunSelectionMenu
                key="run"
                ouiaId="inventory-host-groups-list-run-menu"
                items={selected}
                inventoryId={invId}
                moduleOptions={moduleOptions}
                onLaunchLoading={setIsAdHocLaunchLoading}
                canRunCommand={!isAdHocDisabled}
                scope={host && { item: host, label: t`Run on Host` }}
              />,
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      defaultLabel={t`Associate`}
                      tooltip={t`Associate Group`}
                      key="add"
                      onClick={() => setIsModalOpen(true)}
                    />,
                  ]
                : []),
              <DisassociateButton
                key="disassociate"
                onDisassociate={handleDisassociate}
                itemsToDisassociate={selected}
                modalTitle={t`Disassociate the host from these groups?`}
                modalNote={t`Note that you may still see the group in the list after disassociating it if the host is also a member of that group’s children.  This list shows all groups the host is associated with directly and indirectly.`}
              />,
            ]}
          />
        )}
      />
      {isModalOpen && (
        <AssociateModal
          header={t`Groups`}
          fetchRequest={fetchGroupsToAssociate}
          optionsRequest={fetchGroupsOptions}
          isModalOpen={isModalOpen}
          onAssociate={handleAssociate}
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
export default InventoryHostGroupsList;
