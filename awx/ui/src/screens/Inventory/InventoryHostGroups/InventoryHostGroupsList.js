import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useLingui } from '@lingui/react';

import { msg } from '@lingui/macro';
import { getQSConfig, parseQueryString, mergeParams } from 'util/qs';
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
import AdHocCommands from 'components/AdHocCommands/AdHocCommands';
import InventoryHostGroupItem from './InventoryHostGroupItem';

const QS_CONFIG = getQSConfig('group', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function InventoryHostGroupsList() {
  const { i18n } = useLingui();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdHocLaunchLoading, setIsAdHocLaunchLoading] = useState(false);
  const { hostId, id: invId } = useParams();
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
  } = useRequest(
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
        moduleOptions: adHocOptions.data.actions.GET.module_name.choices,
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

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

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
    (params) =>
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
      async (groupsToAssociate) => {
        await Promise.all(
          groupsToAssociate.map((group) =>
            HostsAPI.associateGroup(hostId, group.id)
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
            name: i18n._(msg`Name`),
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: i18n._(msg`Created By (Username)`),
            key: 'created_by__username__icontains',
          },
          {
            name: i18n._(msg`Modified By (Username)`),
            key: 'modified_by__username__icontains',
          },
        ]}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
            <HeaderCell>{i18n._(msg`Actions`)}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(item, index) => (
          <InventoryHostGroupItem
            key={item.id}
            group={item}
            inventoryId={item.summary_fields.inventory.id}
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
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      key="add"
                      onClick={() => setIsModalOpen(true)}
                    />,
                  ]
                : []),
              ...(!isAdHocDisabled
                ? [
                    <AdHocCommands
                      adHocItems={selected}
                      hasListItems={itemCount > 0}
                      moduleOptions={moduleOptions}
                      onLaunchLoading={setIsAdHocLaunchLoading}
                    />,
                  ]
                : []),
              <DisassociateButton
                key="disassociate"
                onDisassociate={handleDisassociate}
                itemsToDisassociate={selected}
                modalTitle={i18n._(msg`Disassociate group from host?`)}
                modalNote={i18n._(
                  msg`Note that you may still see the group in the list after disassociating if the host is also a member of that group’s children.  This list shows all groups the host is associated with directly and indirectly.`
                )}
              />,
            ]}
          />
        )}
        emptyStateControls={
          canAdd ? (
            <ToolbarAddButton key="add" onClick={() => setIsModalOpen(true)} />
          ) : null
        }
      />
      {isModalOpen && (
        <AssociateModal
          header={i18n._(msg`Groups`)}
          fetchRequest={fetchGroupsToAssociate}
          optionsRequest={fetchGroupsOptions}
          isModalOpen={isModalOpen}
          onAssociate={handleAssociate}
          onClose={() => setIsModalOpen(false)}
          title={i18n._(msg`Select Groups`)}
        />
      )}
      {error && (
        <AlertModal
          isOpen={error}
          onClose={dismissError}
          title={i18n._(msg`Error!`)}
          variant="error"
        >
          {associateError
            ? i18n._(msg`Failed to associate.`)
            : i18n._(msg`Failed to disassociate one or more groups.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}
export default InventoryHostGroupsList;
