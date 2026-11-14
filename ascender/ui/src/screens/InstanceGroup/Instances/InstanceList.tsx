import type { Instance, InstanceGroup } from 'types/api';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useLocation, useParams } from 'react-router';

import useExpanded from 'hooks/useExpanded';
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
import { InstanceGroupsAPI, InstancesAPI } from 'api';
import { getQSConfig, parseQueryString, mergeParams } from 'util/qs';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import HealthCheckButton from 'components/HealthCheckButton/HealthCheckButton';
import HealthCheckAlert from 'components/HealthCheckAlert';
import type { QSParams } from 'util/qs';
import InstanceListItem from './InstanceListItem';
import { DEFAULT_QUEUE_NAMES } from '../shared/queueNames';

const QS_CONFIG = getQSConfig('instance', {
  page: 1,
  page_size: 20,
  order_by: 'hostname',
});

export interface InstanceListProps {
  instanceGroup: InstanceGroup;
  /**
   * The group a hybrid node may not leave, by the name the api's
   * DEFAULT_CONTROL_PLANE_QUEUE_NAME setting gives it.
   */
  controlPlaneName?: string;
  [key: string]: unknown;
}

function InstanceList({
  instanceGroup,
  controlPlaneName = DEFAULT_QUEUE_NAMES.controlPlane,
}: InstanceListProps) {
  const { t } = useLingui();
  const config = useConfig();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showHealthCheckAlert, setShowHealthCheckAlert] = useState(false);
  const [pendingHealthCheck, setPendingHealthCheck] = useState(false);
  const location = useLocation();
  const { id: instanceGroupId } = useParams() as { id: string };
  const isMounted = useRef(false);

  const policyRulesDocsLink = `${getDocsBaseUrl(
    config
  )}/html/administration/containers_instance_groups.html#ag-instance-group-policies`;

  const {
    result: {
      instances,
      count,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
    error: contentError,
    isLoading,
    request: fetchInstances,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, responseActions] = await Promise.all([
        InstanceGroupsAPI.readInstances(instanceGroupId, params),
        InstanceGroupsAPI.readInstanceOptions(instanceGroupId),
      ]);
      const isPending = response.data.results.some(
        (i) => i.health_check_pending === true
      );
      if (isMounted.current) setPendingHealthCheck(isPending);
      return {
        instances: response.data.results,
        count: response.data.count,
        actions: responseActions.data.actions,
        relatedSearchableKeys: (
          responseActions?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(responseActions.data.actions?.GET),
      };
    }, [location.search, instanceGroupId]),
    {
      instances: [],
      count: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected<Instance>(instances);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const {
    error: healthCheckError,
    request: fetchHealthCheck,
    isLoading: isHealthCheckLoading,
  } = useRequest(
    useCallback(async () => {
      const [...response] = await Promise.all(
        selected
          .filter(({ node_type }) => node_type === 'execution')
          .map(({ id }) => InstancesAPI.healthCheck(id))
      );
      if (isMounted.current && response) {
        setShowHealthCheckAlert(true);
      }
    }, [selected])
  );

  // The request goes out for the execution nodes among the selection and
  // skips the rest, so one execution node is enough to make it worth sending.
  const canRunHealthCheck = selected.some(
    ({ node_type }) => node_type === 'execution'
  );

  const handleHealthCheck = async () => {
    await fetchHealthCheck();
    clearSelected();
  };

  const {
    isLoading: isDisassociateLoading,
    deleteItems: disassociateInstances,
    deletionError: disassociateError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected
            .filter((s) => s.node_type !== 'control')
            .map((instance) =>
              InstanceGroupsAPI.disassociateInstance(
                instanceGroupId,
                instance.id
              )
            )
        ),
      [instanceGroupId, selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchInstances,
    }
  );

  const { request: handleAssociate, error: associateError } = useRequest(
    useCallback(
      // Hop and control nodes are already left out of the list the modal
      // offers, by the query above; the filter that used to be here asked for
      // a node that was not control or not hop, which is every node.
      async (instancesToAssociate: Instance[]) => {
        await Promise.all(
          instancesToAssociate.map((instance) =>
            InstanceGroupsAPI.associateInstance(instanceGroupId, instance.id)
          )
        );
        fetchInstances();
      },
      [instanceGroupId, fetchInstances]
    )
  );

  const handleDisassociate = async () => {
    await disassociateInstances();
    clearSelected();
  };

  const { error, dismissError } = useDismissableError(
    associateError || disassociateError || healthCheckError
  );

  // The api offers POST here to an admin of the group, and the same admin
  // role is what it asks of both associating and disassociating an instance.
  const canAdd =
    actions && Object.prototype.hasOwnProperty.call(actions, 'POST');

  const isControlPlane = instanceGroup.name === controlPlaneName;

  // What holds a row back is the kind of node, which the api refuses to move,
  // rather than the viewer's rights, which canAdd has already settled.
  const cannotDisassociateReason = (item: { node_type?: string | null }) => {
    if (item.node_type === 'control') {
      return t`Control nodes cannot be disassociated`;
    }
    if (isControlPlane && item.node_type === 'hybrid') {
      return t`Hybrid nodes cannot be disassociated from ${controlPlaneName}`;
    }
    return null;
  };

  const fetchInstancesToAssociate = useCallback(
    (params: QSParams) =>
      InstancesAPI.read(
        mergeParams(params, {
          ...{ not__rampart_groups__id: instanceGroupId },
          ...{ not__node_type: ['hop', 'control'] },
        })
      ),
    [instanceGroupId]
  );

  const readInstancesOptions = useCallback(
    () => InstanceGroupsAPI.readInstanceOptions(instanceGroupId),
    [instanceGroupId]
  );

  const { expanded, isAllExpanded, handleExpand, expandAll } =
    useExpanded(instances);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return (
    <>
      {showHealthCheckAlert ? (
        <HealthCheckAlert onSetHealthCheckAlert={setShowHealthCheckAlert} />
      ) : null}
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={
          isLoading || isDisassociateLoading || isHealthCheckLoading
        }
        items={instances}
        itemCount={count}
        pluralizedItemName={t`Instances`}
        qsConfig={QS_CONFIG}
        clearSelected={clearSelected}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        toolbarSearchColumns={[
          {
            name: t`Name`,
            key: 'hostname__icontains',
            isDefault: true,
          },
          {
            name: t`Node Type`,
            key: `or__node_type`,
            options: [
              [`control`, t`Control`.toString()],
              [`execution`, t`Execution`.toString()],
              [`hybrid`, t`Hybrid`.toString()],
            ],
          },
        ]}
        toolbarSortColumns={[
          {
            name: t`Name`,
            key: 'hostname',
          },
        ]}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            isAllExpanded={isAllExpanded}
            onExpandAll={expandAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      defaultLabel={t`Associate`}
                      tooltip={t`Associate Instance`}
                      key="associate"
                      onClick={() => setIsModalOpen(true)}
                    />,
                    <DisassociateButton
                      verifyCannotDisassociate={false}
                      cannotDisassociateReason={cannotDisassociateReason}
                      key="disassociate"
                      onDisassociate={handleDisassociate}
                      itemsToDisassociate={selected}
                      modalTitle={t`Disassociate these instances from the instance group?`}
                      modalNote={
                        selected.some(
                          (instance) => instance.managed_by_policy === true
                        ) ? (
                          <Trans>
                            <b>
                              Note: Instances may be re-associated with this
                              instance group if they are managed by{' '}
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
                : []),
              // Starting a health check is a superuser action in the api,
              // whatever role the viewer holds on this group.
              ...(config?.me?.is_superuser
                ? [
                    <HealthCheckButton
                      key="healthCheck"
                      isDisabled={!canRunHealthCheck}
                      onClick={handleHealthCheck}
                      selectedItems={selected}
                      healthCheckPending={pendingHealthCheck}
                    />,
                  ]
                : []),
            ]}
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG} isExpandable>
            <HeaderCell
              tooltip={t`Health checks can only be run on execution nodes.`}
              sortKey="hostname"
            >
              {t`Name`}
            </HeaderCell>
            <HeaderCell sortKey="errors">{t`Status`}</HeaderCell>
            <HeaderCell sortKey="node_type">{t`Node Type`}</HeaderCell>
            <HeaderCell>{t`Capacity Adjustment`}</HeaderCell>
            <HeaderCell>{t`Used Capacity`}</HeaderCell>
            <HeaderCell>{t`Actions`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(instance: Instance, index: number) => (
          <InstanceListItem
            isExpanded={expanded.some((row) => row.id === instance.id)}
            onExpand={() => handleExpand(instance)}
            key={instance.id}
            value={instance.hostname}
            instance={instance}
            onSelect={() => handleSelect(instance)}
            isSelected={selected.some((row) => row.id === instance.id)}
            fetchInstances={fetchInstances}
            rowIndex={index}
          />
        )}
      />
      {isModalOpen && (
        <AssociateModal
          header={t`Instances`}
          fetchRequest={fetchInstancesToAssociate}
          isModalOpen={isModalOpen}
          onAssociate={handleAssociate}
          onClose={() => setIsModalOpen(false)}
          title={t`Associate Instances`}
          optionsRequest={readInstancesOptions}
          displayKey="hostname"
          columns={[
            { key: 'hostname', name: t`Name` },
            { key: 'node_type', name: t`Node Type` },
          ]}
          modalNote={
            <b>
              <Trans>
                <b>
                  Note: Manually associated instances may be automatically
                  disassociated from an instance group if the instance is
                  managed by{' '}
                  <a
                    href={policyRulesDocsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    policy rules.
                  </a>
                </b>
              </Trans>
            </b>
          }
        />
      )}
      {error && (
        <AlertModal
          isOpen={error}
          onClose={dismissError}
          title={t`Error!`}
          variant="error"
        >
          {Boolean(associateError) &&
            t`Failed to associate one or more instances.`}
          {Boolean(disassociateError) &&
            t`Failed to disassociate one or more instances.`}
          {Boolean(healthCheckError) &&
            t`Failed to run a health check on one or more instances.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default InstanceList;
