import type { Instance, InstanceGroup, SetBreadcrumb } from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useLocation, useParams } from 'react-router';

import { InstancesAPI, InstanceGroupsAPI } from 'api';
import { useConfig } from 'contexts/Config';
import { CardBody } from 'components/Card';
import DataListToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import DisassociateButton from 'components/DisassociateButton';
import AssociateModal from 'components/AssociateModal';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import useRequest, {
  useDeleteItems,
  useDismissableError,
} from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { getQSConfig, parseQueryString, mergeParams } from 'util/qs';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import type { QSParams } from 'util/qs';
import InstanceGroupListItem from '../../InstanceGroup/InstanceGroupList/InstanceGroupListItem';
import { DEFAULT_QUEUE_NAMES } from '../../InstanceGroup/shared/queueNames';

const QS_CONFIG = getQSConfig('instance_group', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

export interface InstanceInstanceGroupListProps {
  /**
   * The instance whose groups these are, as the instance screen read it. Taken
   * from there rather than read again, since nothing a search or a page turn
   * here does changes it.
   */
  instance: Partial<Instance>;
  /**
   * The group a hybrid node is never taken out of: the api refuses to take a
   * hybrid node out of the control plane group, whichever end the request
   * comes from, and the instance group's own list holds the same row back.
   * Named by the api's DEFAULT_CONTROL_PLANE_QUEUE_NAME setting.
   */
  controlPlaneName?: string;
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

/**
 * The instance groups an instance belongs to: the instance group's Instances
 * tab seen from the other end, with the same associate and disassociate.
 */
function InstanceInstanceGroupList({
  instance,
  controlPlaneName = DEFAULT_QUEUE_NAMES.controlPlane,
  setBreadcrumb,
}: InstanceInstanceGroupListProps) {
  const { t } = useLingui();
  const config = useConfig();
  const location = useLocation();
  const { id } = useParams() as { id: string };
  const [isModalOpen, setIsModalOpen] = useState(false);

  const policyRulesDocsLink = `${getDocsBaseUrl(
    config
  )}/html/administration/containers_instance_groups.html#ag-instance-group-policies`;

  /*
   * What the list may be searched by. It depends on the instance alone, so it
   * is read once rather than again with every search and page turn.
   */
  const {
    result: { relatedSearchableKeys, searchableKeys },
    error: optionsError,
    request: fetchOptions,
  } = useRequest(
    useCallback(async () => {
      const { data } = await InstancesAPI.readInstanceGroupOptions(id);
      return {
        relatedSearchableKeys: (data.related_search_fields || []).map((val) =>
          val.slice(0, -8)
        ),
        searchableKeys: getSearchableKeys(data.actions?.GET),
      };
    }, [id]),
    {
      relatedSearchableKeys: [] as string[],
      searchableKeys: [] as ReturnType<typeof getSearchableKeys>,
    }
  );

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const {
    result: { instanceGroups, count },
    error: listError,
    isLoading,
    request: fetchInstanceGroups,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const response = await InstancesAPI.readInstanceGroups(id, params);
      return {
        instanceGroups: response.data.results,
        count: response.data.count,
      };
    }, [id, location.search]),
    {
      instanceGroups: [] as InstanceGroup[],
      count: 0,
    }
  );
  const contentError = listError || optionsError;

  useEffect(() => {
    fetchInstanceGroups();
  }, [fetchInstanceGroups]);

  useEffect(() => {
    if (instance?.id) {
      setBreadcrumb(instance);
    }
  }, [instance, setBreadcrumb]);

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected<InstanceGroup>(instanceGroups);

  /*
   * The api's own rule for this end: a hybrid node stays in the control plane
   * group.
   * Control and hop nodes are refused outright, which canEditMembership below
   * already settles by offering no membership changes for them at all.
   */
  const isHeldByControlPlane = useCallback(
    (group: { name?: string | null }) =>
      instance.node_type === 'hybrid' && group.name === controlPlaneName,
    [instance.node_type, controlPlaneName]
  );

  const {
    isLoading: isDisassociateLoading,
    deleteItems: disassociateInstanceGroups,
    deletionError: disassociateError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected
            .filter((group) => !isHeldByControlPlane(group))
            .map((group) =>
              InstancesAPI.disassociateInstanceGroup(id, group.id)
            )
        ),
      [id, selected, isHeldByControlPlane]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchInstanceGroups,
    }
  );

  const { request: handleAssociate, error: associateError } = useRequest(
    useCallback(
      async (groupsToAssociate: InstanceGroup[]) => {
        await Promise.all(
          groupsToAssociate.map((group) =>
            InstancesAPI.associateInstanceGroup(id, group.id)
          )
        );
        fetchInstanceGroups();
      },
      [id, fetchInstanceGroups]
    )
  );

  const handleDisassociate = async () => {
    await disassociateInstanceGroups();
    clearSelected();
  };

  const { error, dismissError } = useDismissableError(
    associateError || disassociateError
  );

  /*
   * Only a superuser changes membership, as on the group's side, and the api
   * refuses it outright for control and hop nodes, which belong where the
   * install put them.
   */
  const canEditMembership =
    Boolean(config?.me?.is_superuser) &&
    (instance.node_type === 'execution' || instance.node_type === 'hybrid');

  // A container group runs jobs on a cluster rather than on instances, and a
  // group already holding this instance has nothing to gain from it.
  const fetchInstanceGroupsToAssociate = useCallback(
    (params: QSParams) =>
      InstanceGroupsAPI.read(
        mergeParams(params, {
          not__instances__id: id,
          is_container_group: false,
        })
      ),
    [id]
  );

  const readInstanceGroupsOptions = useCallback(
    () => InstanceGroupsAPI.readOptions(),
    []
  );

  /*
   * Membership is already limited to superusers above, so what holds a row
   * back is the group rather than the viewer's rights. The button's own check
   * reads the delete capability, which a superuser lacks on default as well,
   * yet default is one an instance can leave, so only the control plane group
   * is named, and in the words the group's side uses for the same refusal.
   */
  const cannotDisassociateReason = (group: { name?: string | null }) =>
    isHeldByControlPlane(group)
      ? t`Hybrid nodes cannot be disassociated from ${controlPlaneName}`
      : null;

  const associateButton = (
    <ToolbarAddButton
      defaultLabel={t`Associate`}
      tooltip={t`Associate Instance Group`}
      key="associate"
      onClick={() => setIsModalOpen(true)}
    />
  );

  return (
    <CardBody>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading || isDisassociateLoading}
        items={instanceGroups}
        itemCount={count}
        pluralizedItemName={t`Instance Groups`}
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
        toolbarSortColumns={[
          {
            name: t`Name`,
            key: 'name',
          },
        ]}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            // A selection is only ever for disassociating, so where membership
            // cannot change there is nothing to select either.
            onSelectAll={canEditMembership ? selectAll : undefined}
            qsConfig={QS_CONFIG}
            // Left out rather than passed as false: the toolbar wraps each
            // control in an item keyed by it, and two falses share no key.
            additionalControls={
              canEditMembership
                ? [
                    associateButton,
                    <DisassociateButton
                      key="disassociate"
                      onDisassociate={handleDisassociate}
                      itemsToDisassociate={selected}
                      cannotDisassociateReason={cannotDisassociateReason}
                      modalTitle={t`Disassociate this instance from these instance groups?`}
                      modalNote={
                        instance.managed_by_policy ? (
                          <Trans>
                            <b>
                              Note: This instance may be re-associated with
                              these instance groups if it is managed by{' '}
                              <a
                                href={policyRulesDocsLink}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                policy rules.
                              </a>
                            </b>
                          </Trans>
                        ) : null
                      }
                    />,
                  ]
                : []
            }
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG} isSelectable={canEditMembership}>
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
            instanceGroup={instanceGroup}
            detailUrl={`/instance_groups/${instanceGroup.id}/details`}
            onSelect={() => handleSelect(instanceGroup)}
            isSelected={selected.some((row) => row.id === instanceGroup.id)}
            isSelectable={canEditMembership}
            rowIndex={index}
          />
        )}
      />
      {isModalOpen && (
        <AssociateModal
          header={t`Instance Groups`}
          fetchRequest={fetchInstanceGroupsToAssociate}
          isModalOpen={isModalOpen}
          onAssociate={handleAssociate}
          onClose={() => setIsModalOpen(false)}
          title={t`Associate Instance Groups`}
          optionsRequest={readInstanceGroupsOptions}
          columns={[{ key: 'name', name: t`Name` }]}
          modalNote={
            <Trans>
              <b>
                Note: Manually associated instances may be automatically
                disassociated from an instance group if the instance is managed
                by{' '}
                <a
                  href={policyRulesDocsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  policy rules.
                </a>
              </b>
            </Trans>
          }
        />
      )}
      {Boolean(error) && (
        <AlertModal
          isOpen={Boolean(error)}
          onClose={dismissError}
          title={t`Error!`}
          variant="error"
        >
          {Boolean(associateError) &&
            t`Failed to associate one or more instance groups.`}
          {Boolean(disassociateError) &&
            t`Failed to disassociate one or more instance groups.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default InstanceInstanceGroupList;
