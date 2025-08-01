import React, { useCallback, useEffect, useState } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useLocation } from 'react-router-dom';
import 'styled-components/macro';
import { PageSection, Card } from '@patternfly/react-core';

import useExpanded from 'hooks/useExpanded';
import DataListToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  getSearchableKeys,
  ToolbarAddButton,
} from 'components/PaginatedTable';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { useConfig } from 'contexts/Config';
import useRequest, {
  useDismissableError,
  useDeleteItems,
} from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { InstancesAPI, SettingsAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import HealthCheckButton from 'components/HealthCheckButton';
import HealthCheckAlert from 'components/HealthCheckAlert';
import InstanceListItem from './InstanceListItem';
import RemoveInstanceButton from '../Shared/RemoveInstanceButton';

const QS_CONFIG = getQSConfig('instance', {
  page: 1,
  page_size: 20,
  order_by: 'hostname',
});

function InstanceList() {
  const { i18n } = useLingui();
  const location = useLocation();
  const { me } = useConfig();
  const canReadSettings = me.is_superuser || me.is_system_auditor;
  const [showHealthCheckAlert, setShowHealthCheckAlert] = useState(false);
  const [pendingHealthCheck, setPendingHealthCheck] = useState(false);
  const [canRunHealthCheck, setCanRunHealthCheck] = useState(true);

  const {
    result: { instances, count, relatedSearchableKeys, searchableKeys, isK8s },
    error: contentError,
    isLoading,
    request: fetchInstances,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);

      const [response, responseActions] = await Promise.all([
        InstancesAPI.read(params),
        InstancesAPI.readOptions(),
      ]);

      let sysSettings = {};
      if (canReadSettings) {
        sysSettings = await SettingsAPI.readCategory('system');
      }

      const isPending = response.data.results.some(
        (i) => i.health_check_pending === true
      );
      setPendingHealthCheck(isPending);
      return {
        instances: response.data.results,
        isK8s: sysSettings?.data?.IS_K8S ?? false,
        count: response.data.count,
        actions: responseActions.data.actions,
        relatedSearchableKeys: (
          responseActions?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(responseActions.data.actions?.GET),
      };
    }, [location.search, canReadSettings]),
    {
      instances: [],
      count: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
      isK8s: false,
    }
  );

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(instances.filter((i) => i.node_type !== 'hop'));

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
      if (response) {
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

  const { error, dismissError } = useDismissableError(healthCheckError);

  const { expanded, isAllExpanded, handleExpand, expandAll } =
    useExpanded(instances);

  const {
    isLoading: isRemoveLoading,
    deleteItems: handleRemoveInstances,
    deletionError: removeError,
    clearDeletionError,
  } = useDeleteItems(
    () =>
      Promise.all(
        selected.map(({ id }) => InstancesAPI.deprovisionInstance(id))
      ),
    { fetchItems: fetchInstances, qsConfig: QS_CONFIG }
  );

  return (
    <>
      {showHealthCheckAlert ? (
        <HealthCheckAlert onSetHealthCheckAlert={setShowHealthCheckAlert} />
      ) : null}
      <PageSection>
        <Card>
          <PaginatedTable
            contentError={contentError || removeError}
            hasContentLoading={
              isLoading || isHealthCheckLoading || isRemoveLoading
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
                  [`control`, i18n._(msg`Control`)],
                  [`execution`, i18n._(msg`Execution`)],
                  [`hybrid`, i18n._(msg`Hybrid`)],
                  [`hop`, i18n._(msg`Hop`)],
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
                  ...(isK8s && me.is_superuser
                    ? [
                        <ToolbarAddButton
                          ouiaId="instances-add-button"
                          key="add"
                          linkTo="/instances/add"
                        />,
                        <RemoveInstanceButton
                          itemsToRemove={selected}
                          isK8s={isK8s}
                          key="remove"
                          onRemove={handleRemoveInstances}
                        />,
                      ]
                    : []),
                  <HealthCheckButton
                    onClick={handleHealthCheck}
                    key="healthCheck"
                    selectedItems={selected}
                    healthCheckPending={pendingHealthCheck}
                    isDisabled={!canRunHealthCheck}
                  />,
                ]}
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
                onSelect={() => {
                  handleSelect(instance);
                }}
                isSelected={selected.some((row) => row.id === instance.id)}
                fetchInstances={fetchInstances}
                rowIndex={index}
              />
            )}
          />
        </Card>
      </PageSection>
      {error && (
        <AlertModal
          isOpen={error}
          onClose={dismissError}
          title={i18n._(msg`Error!`)}
          variant="error"
        >
          {i18n._(msg`Failed to run a health check on one or more instances.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
      {removeError && (
        <AlertModal
          isOpen={removeError}
          variant="error"
          aria-label={i18n._(msg`Removal Error`)}
          title={i18n._(msg`Error!`)}
          onClose={clearDeletionError}
        >
          {i18n._(msg`Failed to remove one or more instances.`)}
          <ErrorDetail error={removeError} />
        </AlertModal>
      )}
    </>
  );
}

export default InstanceList;
