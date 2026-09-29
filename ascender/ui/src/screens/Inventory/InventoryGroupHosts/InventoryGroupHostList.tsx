import type { ApiEntity, Group } from 'types/api';
import React, { useCallback, useState } from 'react';
import { useLocation, useParams } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { getQSConfig, mergeParams, parseQueryString } from 'util/qs';
import { GroupsAPI, InventoriesAPI } from 'api';

import useCachedRequest from 'hooks/useCachedRequest';
import useRequest, {
  useDeleteItems,
  useDismissableError,
} from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import AlertModal from 'components/AlertModal';
import DataListToolbar from 'components/DataListToolbar';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import AssociateModal from 'components/AssociateModal';
import DisassociateButton from 'components/DisassociateButton';
import RunSelectionMenu from 'components/JobList/RunSelectionMenu';
import type { QSParams } from 'util/qs';
import InventoryGroupHostListItem from './InventoryGroupHostListItem';
import { isReadOnlyInventoryType } from '../shared/utils';

const QS_CONFIG = getQSConfig('host', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

export interface InventoryGroupHostListProps {
  /**
   * The group this list sits under, which a run with nothing ticked is
   * aimed at rather than at the whole inventory.
   */
  inventoryGroup?: Group;
}

function InventoryGroupHostList({
  inventoryGroup,
}: InventoryGroupHostListProps = {}) {
  const { t } = useLingui();
  const [isAdHocLaunchLoading, setIsAdHocLaunchLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    id: inventoryId,
    groupId,
    inventoryType,
  } = useParams() as { id: string; groupId: string; inventoryType: string };
  const location = useLocation();

  const {
    result: {
      hosts,
      hostCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
      moduleOptions,
      isAdHocDisabled,
    },
    error: contentError,
    isLoading,
    request: fetchHosts,
  } = useCachedRequest(
    ['inventory-group-host-list', groupId, location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse, options] = await Promise.all([
        GroupsAPI.readAllHosts(groupId, params),
        InventoriesAPI.readHostsOptions(inventoryId),
        InventoriesAPI.readAdHocOptions(inventoryId),
      ]);

      return {
        moduleOptions: options.data.actions.GET?.module_name?.choices ?? [],
        isAdHocDisabled: !options.data.actions.POST,
        hosts: response.data.results,
        hostCount: response.data.count,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [groupId, inventoryId, location.search]),
    {
      moduleOptions: [],
      isAdHocDisabled: true,
      hosts: [],
      hostCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const { selected, isAllSelected, handleSelect, setSelected, clearSelected } =
    useSelected(hosts);

  const {
    isLoading: isDisassociateLoading,
    deleteItems: disassociateHosts,
    deletionError: disassociateErr,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map((host) => GroupsAPI.disassociateHost(groupId, host))
        ),
      [groupId, selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchHosts,
    }
  );

  const handleDisassociate = async () => {
    await disassociateHosts();
    setSelected([]);
  };

  const fetchHostsToAssociate = useCallback(
    (params: QSParams) =>
      InventoriesAPI.readHosts(
        inventoryId,
        mergeParams(params, { not__groups: groupId })
      ),
    [groupId, inventoryId]
  );

  const fetchHostsOptions = useCallback(
    () => InventoriesAPI.readHostsOptions(inventoryId),
    [inventoryId]
  );

  const { request: handleAssociate, error: associateErr } = useRequest(
    useCallback(
      async (hostsToAssociate: ApiEntity[]) => {
        await Promise.all(
          hostsToAssociate.map((host) =>
            GroupsAPI.associateHost(groupId, host.id as number)
          )
        );
        fetchHosts();
      },
      [groupId, fetchHosts]
    )
  );

  const { error: associateError, dismissError: dismissAssociateError } =
    useDismissableError(associateErr);
  const { error: disassociateError, dismissError: dismissDisassociateError } =
    useDismissableError(disassociateErr);
  const isNotReadOnlyInventory = !isReadOnlyInventoryType(inventoryType);
  const canAdd =
    actions &&
    Object.prototype.hasOwnProperty.call(actions, 'POST') &&
    isNotReadOnlyInventory;
  const addFormUrl = `/inventories/inventory/${inventoryId}/groups/${groupId}/nested_hosts/add`;
  /*
   * Two buttons rather than one menu, each saying what it does: Add makes a
   * new host in this group, Associate puts an existing one in it.
   */
  const addButtons = [
    <ToolbarAddButton
      key="add"
      ouiaId="group-hosts-add-button"
      tooltip={t`Add Host`}
      linkTo={addFormUrl}
    />,
    <ToolbarAddButton
      key="associate"
      ouiaId="group-hosts-associate-button"
      defaultLabel={t`Associate`}
      tooltip={t`Associate Host`}
      onClick={() => setIsModalOpen(true)}
    />,
  ];
  return (
    <>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={
          isLoading || isDisassociateLoading || isAdHocLaunchLoading
        }
        items={hosts}
        itemCount={hostCount}
        pluralizedItemName={t`Hosts`}
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
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell sortKey="description">{t`Description`}</HeaderCell>
            <HeaderCell>{t`Activity`}</HeaderCell>
            <HeaderCell>{t`Actions`}</HeaderCell>
          </HeaderRow>
        }
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={(isSelected) =>
              setSelected(isSelected ? [...hosts] : [])
            }
            qsConfig={QS_CONFIG}
            additionalControls={[
              <RunSelectionMenu
                key="run"
                ouiaId="inventory-group-host-list-run-menu"
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
                      onDisassociate={handleDisassociate}
                      itemsToDisassociate={selected}
                      modalTitle={t`Disassociate these hosts from the group?`}
                      modalNote={t`
                        Note that only hosts directly in this group can
                        be disassociated. Hosts in sub-groups must be disassociated
                        directly from the sub-group level that they belong.
                      `}
                    />,
                  ]
                : []),
            ]}
          />
        )}
        renderRow={(host, index) => (
          <InventoryGroupHostListItem
            key={host.id}
            rowIndex={index}
            host={host}
            detailUrl={`/inventories/${inventoryType}/${inventoryId}/hosts/${host.id}/details`}
            editUrl={`/inventories/${inventoryType}/${inventoryId}/hosts/${host.id}/edit`}
            isSelected={selected.some((row) => row.id === host.id)}
            onSelect={() => handleSelect(host)}
          />
        )}
      />
      {isModalOpen && (
        <AssociateModal
          header={t`Hosts`}
          fetchRequest={fetchHostsToAssociate}
          optionsRequest={fetchHostsOptions}
          isModalOpen={isModalOpen}
          onAssociate={handleAssociate}
          onClose={() => setIsModalOpen(false)}
          title={t`Associate Hosts`}
        />
      )}
      {associateError && (
        <AlertModal
          isOpen={associateError}
          onClose={dismissAssociateError}
          title={t`Error!`}
          variant="error"
        >
          {t`Failed to associate one or more hosts.`}
          <ErrorDetail error={associateError} />
        </AlertModal>
      )}
      {disassociateError && (
        <AlertModal
          isOpen={disassociateError}
          onClose={dismissDisassociateError}
          title={t`Error!`}
          variant="error"
        >
          {t`Failed to disassociate one or more hosts.`}
          <ErrorDetail error={disassociateError} />
        </AlertModal>
      )}
    </>
  );
}

export default InventoryGroupHostList;
