import React, { useCallback, useEffect, useState, useRef } from 'react';
import { msg, Trans } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useLocation, useParams } from 'react-router-dom';
import 'styled-components/macro';

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
import InstanceListItem from './InstanceListItem';

const QS_CONFIG = getQSConfig('instance', {
  page: 1,
  page_size: 20,
  order_by: 'hostname',
});

function InstanceList({ instanceGroup }) {
  const { i18n } = useLingui();
  const config = useConfig();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showHealthCheckAlert, setShowHealthCheckAlert] = useState(false);
  const [pendingHealthCheck, setPendingHealthCheck] = useState(false);
  const [canRunHealthCheck, setCanRunHealthCheck] = useState(true);
  const location = useLocation();
  const { id: instanceGroupId } = useParams();
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
    useSelected(instances);

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

  useEffect(() => {
    if (selected) {
      selected.forEach((i) => {
        if (i.node_type === 'execution') {
          setCanRunHealthCheck(true);
        } else {
          setCanRunHealthCheck(false);
        }
      });
    }
  }, [selected]);

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
      async (instancesToAssociate) => {
        await Promise.all(
          instancesToAssociate
            .filter((i) => i.node_type !== 'control' || i.node_type !== 'hop')
            .map((instance) =>
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

  const canAdd =
    actions && Object.prototype.hasOwnProperty.call(actions, 'POST');

  const fetchInstancesToAssociate = useCallback(
    (params) =>
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
        pluralizedItemName={i18n._(msg`Instances`)}
        qsConfig={QS_CONFIG}
        clearSelected={clearSelected}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        toolbarSearchColumns={[
          {
            name: i18n._(msg`Name`),
            key: 'hostname__icontains',
            isDefault: true,
          },
          {
            name: i18n._(msg`Node Type`),
            key: `or__node_type`,
            options: [
              [`control`, i18n._(msg`Control`).toString()],
              [`execution`, i18n._(msg`Execution`).toString()],
              [`hybrid`, i18n._(msg`Hybrid`).toString()],
            ],
          },
        ]}
        toolbarSortColumns={[
          {
            name: i18n._(msg`Name`),
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
                      key="associate"
                      onClick={() => setIsModalOpen(true)}
                      defaultLabel={i18n._(msg`Associate`)}
                    />,
                  ]
                : []),
              <DisassociateButton
                verifyCannotDisassociate={
                  selected.some((s) => s.node_type === 'control') ||
                  instanceGroup.name === 'controlplane'
                }
                key="disassociate"
                onDisassociate={handleDisassociate}
                itemsToDisassociate={selected}
                modalTitle={i18n._(
                  msg`Disassociate instance from instance group?`
                )}
                isProtectedInstanceGroup={instanceGroup.name === 'controlplane'}
                modalNote={
                  selected.some(
                    (instance) => instance.managed_by_policy === true
                  ) ? (
                    <Trans>
                      <b>
                        Note: Instances may be re-associated with this instance
                        group if they are managed by{' '}
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
              <HealthCheckButton
                isDisabled={!canAdd || !canRunHealthCheck}
                onClick={handleHealthCheck}
                selectedItems={selected}
                healthCheckPending={pendingHealthCheck}
              />,
            ]}
            emptyStateControls={
              canAdd ? (
                <ToolbarAddButton
                  key="add"
                  onClick={() => setIsModalOpen(true)}
                />
              ) : null
            }
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG} isExpandable>
            <HeaderCell
              tooltip={i18n._(
                msg`Health checks can only be run on execution nodes.`
              )}
              sortKey="hostname"
            >
              {i18n._(msg`Name`)}
            </HeaderCell>
            <HeaderCell sortKey="errors">{i18n._(msg`Status`)}</HeaderCell>
            <HeaderCell sortKey="node_type">
              {i18n._(msg`Node Type`)}
            </HeaderCell>
            <HeaderCell>{i18n._(msg`Capacity Adjustment`)}</HeaderCell>
            <HeaderCell>{i18n._(msg`Used Capacity`)}</HeaderCell>
            <HeaderCell>{i18n._(msg`Actions`)}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(instance, index) => (
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
          header={i18n._(msg`Instances`)}
          fetchRequest={fetchInstancesToAssociate}
          isModalOpen={isModalOpen}
          onAssociate={handleAssociate}
          onClose={() => setIsModalOpen(false)}
          title={i18n._(msg`Select Instances`)}
          optionsRequest={readInstancesOptions}
          displayKey="hostname"
          columns={[
            { key: 'hostname', name: i18n._(msg`Name`) },
            { key: 'node_type', name: i18n._(msg`Node Type`) },
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
          title={i18n._(msg`Error!`)}
          variant="error"
        >
          {associateError && i18n._(msg`Failed to associate.`)}
          {disassociateError &&
            i18n._(msg`Failed to disassociate one or more instances.`)}
          {healthCheckError &&
            i18n._(msg`Failed to run a health check on one or more instances.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default InstanceList;
