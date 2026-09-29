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
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import AssociateModal from 'components/AssociateModal';
import DisassociateButton from 'components/DisassociateButton';
import DataListToolbar from 'components/DataListToolbar';
import RunSelectionMenu from 'components/JobList/RunSelectionMenu';
import type { QSParams } from 'util/qs';
import {
  getInventoryType,
  isReadOnlyInventoryType,
} from 'screens/Inventory/shared/utils';
import HostGroupItem from './HostGroupItem';

const QS_CONFIG = getQSConfig('group', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

export interface HostGroupsListProps {
  host: Host;
  [key: string]: unknown;
}

function HostGroupsList({ host }: HostGroupsListProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { id: hostId } = useParams() as { id: string };
  const { search } = useLocation();
  // The list is mounted under an inventory, so the host it lists is in one.
  const invId = host.summary_fields.inventory?.id as number;
  /*
   * A constructed or federated inventory builds its groups from its sources,
   * so they are not linked or unlinked by hand, as on the same list under
   * the inventory.
   */
  const isReadOnlyInventory = isReadOnlyInventoryType(
    getInventoryType(host.summary_fields.inventory?.kind)
  );
  const [isAdHocLaunchLoading, setIsAdHocLaunchLoading] = useState(false);

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
    ['host-groups-list', hostId, search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, search);

      const [
        {
          data: { count, results },
        },
        actionsResponse,
        adHocOptions,
      ] = await Promise.all([
        HostsAPI.readAllGroups(hostId, params),
        HostsAPI.readGroupsOptions(hostId),
        // What the run menu offers for a command on the host's inventory.
        InventoriesAPI.readAdHocOptions(invId),
      ]);

      return {
        moduleOptions:
          adHocOptions.data.actions.GET?.module_name?.choices ?? [],
        isAdHocDisabled: !adHocOptions.data.actions.POST,
        groups: results,
        itemCount: count,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [hostId, invId, search]),
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
    !isReadOnlyInventory &&
    actions &&
    Object.prototype.hasOwnProperty.call(actions, 'POST');

  const { t } = useLingui();

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
            {/* Its rows have nothing to offer under a read-only inventory. */}
            {!isReadOnlyInventory && <HeaderCell>{t`Actions`}</HeaderCell>}
          </HeaderRow>
        }
        renderRow={(item, index) => (
          <HostGroupItem
            key={item.id}
            group={item}
            hostId={hostId}
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
                ouiaId="host-groups-list-run-menu"
                items={selected}
                inventoryId={invId}
                moduleOptions={moduleOptions}
                onLaunchLoading={setIsAdHocLaunchLoading}
                canRunCommand={!isAdHocDisabled}
                /* Nothing ticked is this host, as on the host's other tabs,
                   rather than every host in its inventory. */
                scope={{ item: host, label: t`Run on Host` }}
              />,
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      defaultLabel={t`Associate`}
                      tooltip={t`Associate Group`}
                      ouiaId="host-groups-add-button"
                      key="add"
                      onClick={() => setIsModalOpen(true)}
                    />,
                  ]
                : []),
              ...(isReadOnlyInventory
                ? []
                : [
                    <DisassociateButton
                      key="disassociate"
                      onDisassociate={handleDisassociate}
                      itemsToDisassociate={selected}
                      modalTitle={t`Disassociate the host from these groups?`}
                      modalNote={t`Note that you may still see the group in the list after disassociating it if the host is also a member of that group’s children.  This list shows all groups the host is associated with directly and indirectly.`}
                    />,
                  ]),
            ]}
          />
        )}
      />
      {isModalOpen && (
        <AssociateModal
          ouiaId="associate-modal"
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
export default HostGroupsList;
