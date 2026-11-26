import type { Instance } from 'types/api';
import type { SettingCategory } from 'api/models/Settings';
import React, { useCallback, useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useLocation } from 'react-router';
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
import { useConfig, useUserProfile } from 'contexts/Config';
import useRequest, {
  useDismissableError,
  useDeleteItems,
} from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { InstancesAPI, SettingsAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import HealthCheckButton from 'components/HealthCheckButton';
import HealthCheckAlert from 'components/HealthCheckAlert';
import ResourceTabs from 'components/ResourceTabs';
import { getInstanceTabs } from '../tabs';
import InstanceListItem from './InstanceListItem';
import RemoveInstanceButton from '../Shared/RemoveInstanceButton';

const QS_CONFIG = getQSConfig('instance', {
  page: 1,
  page_size: 20,
  order_by: 'hostname',
});

function InstanceList() {
  const { t, i18n } = useLingui();
  const userProfile = useUserProfile();
  const location = useLocation();
  const { me } = useConfig();
  const canReadSettings = me?.is_superuser || me?.is_system_auditor;
  const [showHealthCheckAlert, setShowHealthCheckAlert] = useState(false);
  const [pendingHealthCheck, setPendingHealthCheck] = useState(false);

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

      let sysSettings: { data?: SettingCategory } = {};
      if (canReadSettings) {
        sysSettings = await SettingsAPI.readCategory('system');
      }

      const isPending = response.data.results.some(
        (i) => i.health_check_pending === true
      );
      setPendingHealthCheck(isPending);
      return {
        instances: response.data.results,
        isK8s: Boolean(sysSettings?.data?.IS_K8S),
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

  /*
   * Every row can be ticked, so Select All ticks every row. A ticked row is
   * not a promise that each action applies to it: Health Check goes out for
   * the execution nodes among the selection, managed ones included, since the
   * api runs one on any of them, and Delete refuses managed and non execution
   * or hop nodes by name, which is the api's own refusal.
   */
  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected<Instance>(instances);

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

  // The request goes out for the execution nodes among the selection and
  // skips the rest, so one execution node is enough to make it worth sending.
  const canRunHealthCheck = selected.some(
    ({ node_type }) => node_type === 'execution'
  );

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
    /*
     * No allItemsSelected: removing an instance only marks it deprovisioning,
     * and it stays in the list until the cluster lets it go, so a page whose
     * every row was removed is still full and has nothing to step back from.
     */
    { fetchItems: fetchInstances, qsConfig: QS_CONFIG }
  );

  return (
    <>
      {showHealthCheckAlert ? (
        <HealthCheckAlert onSetHealthCheckAlert={setShowHealthCheckAlert} />
      ) : null}
      <PageSection hasBodyWrapper={false}>
        <Card>
          {/* The groups a job is sent to and the mesh drawn as a graph are
              the same machinery seen another way, so they are tabs here
              rather than items of their own in the rail. */}
          <ResourceTabs
            aria-label={t`Instance tabs`}
            ouiaId="instance-tabs"
            tabs={getInstanceTabs(userProfile).map(({ label, path }) => ({
              label: i18n._(label),
              path,
            }))}
          />
          <PaginatedTable
            contentError={contentError || removeError}
            hasContentLoading={
              isLoading || isHealthCheckLoading || isRemoveLoading
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
                  [`control`, t`Control`],
                  [`execution`, t`Execution`],
                  [`hybrid`, t`Hybrid`],
                  [`hop`, t`Hop`],
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
                  ...(isK8s && me?.is_superuser
                    ? [
                        <ToolbarAddButton
                          tooltip={t`Add Instance`}
                          ouiaId="instances-add-button"
                          key="add"
                          linkTo="/instances/add"
                        />,
                        <RemoveInstanceButton
                          itemsToRemove={selected}
                          key="remove"
                          onRemove={handleRemoveInstances}
                        />,
                      ]
                    : []),
                  // Starting a health check is a superuser action in the api;
                  // an auditor may read the results but not ask for one.
                  ...(me?.is_superuser
                    ? [
                        <HealthCheckButton
                          onClick={handleHealthCheck}
                          key="healthCheck"
                          selectedItems={selected}
                          healthCheckPending={pendingHealthCheck}
                          isDisabled={!canRunHealthCheck}
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
          title={t`Error!`}
          variant="error"
        >
          {t`Failed to run a health check on one or more instances.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
      {removeError && (
        <AlertModal
          isOpen={removeError}
          variant="error"
          aria-label={t`Deletion Error`}
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to delete one or more instances.`}
          <ErrorDetail error={removeError} />
        </AlertModal>
      )}
    </>
  );
}

export default InstanceList;
