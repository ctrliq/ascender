import type { InstanceGroup } from 'types/api';
import type { DeletableItem } from 'components/PaginatedTable';
import React, { useCallback } from 'react';
import { useLocation } from 'react-router';

import { Plural, useLingui } from '@lingui/react/macro';

import { Card, PageSection } from '@patternfly/react-core';

import { InstanceGroupsAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import useCachedRequest from 'hooks/useCachedRequest';
import { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import DatalistToolbar from 'components/DataListToolbar';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import ResourceTabs from 'components/ResourceTabs';
import { useUserProfile } from 'contexts/Config';
import { getInstanceTabs } from '../../Instances/tabs';
import InstanceGroupListItem from './InstanceGroupListItem';

const QS_CONFIGS = {
  instance: getQSConfig('instance-group', { page: 1, page_size: 20 }),
  container: getQSConfig('container-group', { page: 1, page_size: 20 }),
};

export interface InstanceGroupListProps {
  /** Container groups rather than instance groups: the other tab's list. */
  isContainerGroup?: boolean;
}

/**
 * The groups a job can be sent to, of one kind or the other.
 *
 * The two kinds are one endpoint told apart by a flag, and they were one table
 * with a type column saying which row was which. They are a tab each now, so
 * the table says only what differs between rows of the same kind, and the add
 * button adds the kind the tab names.
 */
function InstanceGroupList({
  isContainerGroup = false,
}: InstanceGroupListProps) {
  const { t, i18n } = useLingui();
  const userProfile = useUserProfile();
  const location = useLocation();
  const QS_CONFIG = isContainerGroup
    ? QS_CONFIGS.container
    : QS_CONFIGS.instance;

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
  } = useCachedRequest(
    // The kind is part of the key: the two tabs read the same endpoint with
    // opposite filters, and one cached under the other's name showed the
    // wrong groups on a tab switch.
    ['instance-group-list', String(isContainerGroup), location.search],
    useCallback(async () => {
      const params = {
        ...parseQueryString(QS_CONFIG, location.search),
        is_container_group: isContainerGroup,
      };

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
    }, [location, QS_CONFIG, isContainerGroup]),
    {
      instanceGroups: [],
      instanceGroupsCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected<InstanceGroup>(instanceGroups);

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

  const cannotDelete = (item: DeletableItem) =>
    !item.summary_fields?.user_capabilities?.delete;

  const pluralizedItemName = isContainerGroup
    ? t`Container Groups`
    : t`Instance Groups`;

  const addButton = (
    <ToolbarAddButton
      ouiaId="add-instance-group-button"
      key="add"
      linkTo={
        isContainerGroup ? '/container_groups/add' : '/instance_groups/add'
      }
      tooltip={
        isContainerGroup ? t`Add Container Group` : t`Add Instance Group`
      }
    />
  );

  const getDetailUrl = (item: InstanceGroup) =>
    item.is_container_group
      ? `/container_groups/${item.id}/details`
      : `/instance_groups/${item.id}/details`;
  const deleteDetailsRequests = relatedResourceDeleteRequests.instanceGroup(
    selected[0]
  );
  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Card>
          {/* The same strip the instances and the topology carry: one screen,
              four lists of the machinery a job runs on. */}
          <ResourceTabs
            aria-label={t`Instance tabs`}
            ouiaId="instance-tabs"
            tabs={getInstanceTabs(userProfile).map(({ label, path }) => ({
              label: i18n._(label),
              path,
            }))}
          />
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
                name: t`Name`,
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
                      isContainerGroup ? (
                        <Plural
                          value={selected.length}
                          one="This container group is currently being used by other resources. Are you sure you want to delete it?"
                          other="Deleting these container groups could impact other resources that rely on them. Are you sure you want to delete anyway?"
                        />
                      ) : (
                        <Plural
                          value={selected.length}
                          one="This instance group is currently being used by other resources. Are you sure you want to delete it?"
                          other="Deleting these instance groups could impact other resources that rely on them. Are you sure you want to delete anyway?"
                        />
                      )
                    }
                  />,
                ]}
              />
            )}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
                <HeaderCell>{t`Running Jobs`}</HeaderCell>
                <HeaderCell>{t`Total Jobs`}</HeaderCell>
                <HeaderCell>{t`Instances`}</HeaderCell>
                <HeaderCell>{t`Capacity`}</HeaderCell>
                <HeaderCell>{t`Actions`}</HeaderCell>
              </HeaderRow>
            }
            renderRow={(instanceGroup: InstanceGroup, index: number) => (
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
          />
        </Card>
      </PageSection>
      <AlertModal
        aria-label={t`Deletion error`}
        isOpen={Boolean(deletionError)}
        onClose={clearDeletionError}
        title={t`Error!`}
        variant="error"
      >
        {isContainerGroup
          ? t`Failed to delete one or more container groups.`
          : t`Failed to delete one or more instance groups.`}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export default InstanceGroupList;
