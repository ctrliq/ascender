import React, { useEffect, useCallback } from 'react';
import { useLocation, useRouteMatch, Link } from 'react-router-dom';

import { msg, Plural } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { Card, PageSection, DropdownItem } from '@patternfly/react-core';

import { InstanceGroupsAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarDeleteButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import DatalistToolbar from 'components/DataListToolbar';
import AddDropDownButton from 'components/AddDropDownButton';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import InstanceGroupListItem from './InstanceGroupListItem';

const QS_CONFIG = getQSConfig('instance-group', {
  page: 1,
  page_size: 20,
});

function InstanceGroupList() {
  const { i18n } = useLingui();
  const location = useLocation();
  const match = useRouteMatch();

  const {
    error: contentError,
    isLoading,
    request: fetchInstanceGroups,
    result: {
      instanceGroups,
      instanceGroupsCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);

      const [response, responseActions] = await Promise.all([
        InstanceGroupsAPI.read(params),
        InstanceGroupsAPI.readOptions(),
      ]);

      return {
        instanceGroups: response.data.results,
        instanceGroupsCount: response.data.count,
        actions: responseActions.data.actions,
        relatedSearchableKeys: (
          responseActions?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(responseActions.data.actions?.GET),
      };
    }, [location]),
    {
      instanceGroups: [],
      instanceGroupsCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchInstanceGroups();
  }, [fetchInstanceGroups]);

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(instanceGroups);

  const {
    isLoading: deleteLoading,
    deletionError,
    deleteItems: deleteInstanceGroups,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(selected.map(({ id }) => InstanceGroupsAPI.destroy(id))),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchInstanceGroups,
    }
  );

  const handleDelete = async () => {
    await deleteInstanceGroups();
    clearSelected();
  };

  const canAdd = actions && actions.POST;

  const cannotDelete = (item) => !item.summary_fields.user_capabilities.delete;

  const pluralizedItemName = i18n._(msg`Instance Groups`);
  const addContainerGroup = i18n._(msg`Add container group`);
  const addInstanceGroup = i18n._(msg`Add instance group`);

  const addButton = (
    <AddDropDownButton
      ouiaId="add-instance-group-button"
      key="add"
      dropdownItems={[
        <DropdownItem
          ouiaId="add-container-group-item"
          to="/instance_groups/container_group/add"
          component={Link}
          key={addContainerGroup}
          aria-label={addContainerGroup}
        >
          {addContainerGroup}
        </DropdownItem>,
        <DropdownItem
          ouiaId="add-instance-group-item"
          to="/instance_groups/add"
          component={Link}
          key={addInstanceGroup}
          aria-label={addInstanceGroup}
        >
          {addInstanceGroup}
        </DropdownItem>,
      ]}
    />
  );

  const getDetailUrl = (item) =>
    item.is_container_group
      ? `${match.url}/container_group/${item.id}/details`
      : `${match.url}/${item.id}/details`;
  const deleteDetailsRequests = relatedResourceDeleteRequests.instanceGroup(
    selected[0]
  );
  return (
    <>
      <PageSection>
        <Card>
          <PaginatedTable
            contentError={contentError}
            hasContentLoading={isLoading || deleteLoading}
            items={instanceGroups}
            itemCount={instanceGroupsCount}
            pluralizedItemName={pluralizedItemName}
            qsConfig={QS_CONFIG}
            clearSelected={clearSelected}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
            toolbarSearchColumns={[
              {
                name: i18n._(msg`Name`),
                key: 'name__icontains',
                isDefault: true,
              },
            ]}
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
                    onDelete={handleDelete}
                    cannotDelete={cannotDelete}
                    itemsToDelete={selected}
                    pluralizedItemName={pluralizedItemName}
                    deleteDetailsRequests={deleteDetailsRequests}
                    deleteMessage={
                      <Plural
                        value={selected.length}
                        one={i18n._(
                          msg`This instance group is currently being by other resources. Are you sure you want to delete it?`
                        )}
                        other={i18n._(
                          msg`Deleting these instance groups could impact other resources that rely on them. Are you sure you want to delete anyway?`
                        )}
                      />
                    }
                  />,
                ]}
              />
            )}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Type`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Running Jobs`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Total Jobs`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Instances`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Capacity`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Actions`)}</HeaderCell>
              </HeaderRow>
            }
            renderRow={(instanceGroup, index) => (
              <InstanceGroupListItem
                key={instanceGroup.id}
                value={instanceGroup.name}
                instanceGroup={instanceGroup}
                detailUrl={getDetailUrl(instanceGroup)}
                onSelect={() => handleSelect(instanceGroup)}
                isSelected={selected.some((row) => row.id === instanceGroup.id)}
                rowIndex={index}
              />
            )}
            emptyStateControls={canAdd && addButton}
          />
        </Card>
      </PageSection>
      <AlertModal
        aria-label={i18n._(msg`Deletion error`)}
        isOpen={deletionError}
        onClose={clearDeletionError}
        title={i18n._(msg`Error`)}
        variant="error"
      >
        {i18n._(msg`Failed to delete one or more instance groups.`)}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export default InstanceGroupList;
