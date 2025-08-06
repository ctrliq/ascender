import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useParams, Link } from 'react-router-dom';
import { t, Plural } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import {
  Button,
  Progress,
  ProgressMeasureLocation,
  ProgressSize,
  CodeBlock,
  CodeBlockCode,
  Tooltip,
  Slider,
} from '@patternfly/react-core';
import { DownloadIcon, OutlinedClockIcon } from '@patternfly/react-icons';
import styled from 'styled-components';

import { useConfig } from 'contexts/Config';
import { InstancesAPI } from 'api';
import useDebounce from 'hooks/useDebounce';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import InstanceToggle from 'components/InstanceToggle';
import { CardBody, CardActionsRow } from 'components/Card';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { formatDateString } from 'util/dates';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { Detail, DetailList } from 'components/DetailList';
import StatusLabel from 'components/StatusLabel';
import useRequest, {
  useDeleteItems,
  useDismissableError,
} from 'hooks/useRequest';
import HealthCheckAlert from 'components/HealthCheckAlert';
import InstanceGroupLabels from 'components/InstanceGroupLabels';
import RemoveInstanceButton from '../Shared/RemoveInstanceButton';

const Unavailable = styled.span`
  color: var(--pf-global--danger-color--200);
`;

const SliderHolder = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SliderForks = styled.div`
  flex-grow: 1;
  margin-right: 8px;
  margin-left: 8px;
  text-align: center;
`;

function computeForks(memCapacity, cpuCapacity, selectedCapacityAdjustment) {
  const minCapacity = Math.min(memCapacity, cpuCapacity);
  const maxCapacity = Math.max(memCapacity, cpuCapacity);

  return Math.floor(
    minCapacity + (maxCapacity - minCapacity) * selectedCapacityAdjustment
  );
}

function InstanceDetail({ setBreadcrumb, isK8s }) {
  const { i18n } = useLingui();
  const config = useConfig();

  const { id } = useParams();
  const [forks, setForks] = useState();
  const history = useHistory();
  const [healthCheck, setHealthCheck] = useState({});
  const [showHealthCheckAlert, setShowHealthCheckAlert] = useState(false);

  const {
    isLoading,
    error: contentError,
    request: fetchDetails,
    result: { instance, instanceGroups },
  } = useRequest(
    useCallback(async () => {
      const [
        { data: details },
        {
          data: { results },
        },
      ] = await Promise.all([
        InstancesAPI.readDetail(id),
        InstancesAPI.readInstanceGroup(id),
      ]);
      if (details.node_type === 'execution') {
        const { data: healthCheckData } =
          await InstancesAPI.readHealthCheckDetail(id);
        setHealthCheck(healthCheckData);
      }

      setForks(
        computeForks(
          details.mem_capacity,
          details.cpu_capacity,
          details.capacity_adjustment
        )
      );
      return {
        instance: details,
        instanceGroups: results,
      };
    }, [id]),
    { instance: {}, instanceGroups: [] }
  );
  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  useEffect(() => {
    if (instance) {
      setBreadcrumb(instance);
    }
  }, [instance, setBreadcrumb]);

  const { error: healthCheckError, request: fetchHealthCheck } = useRequest(
    useCallback(async () => {
      const { status } = await InstancesAPI.healthCheck(id);
      if (status === 200) {
        setShowHealthCheckAlert(true);
      }
    }, [id])
  );

  const { error: updateInstanceError, request: updateInstance } = useRequest(
    useCallback(
      async (values) => {
        await InstancesAPI.update(id, values);
      },
      [id]
    )
  );

  const debounceUpdateInstance = useDebounce(updateInstance, 200);

  const handleChangeValue = (value) => {
    const roundedValue = Math.round(value * 100) / 100;
    setForks(
      computeForks(instance.mem_capacity, instance.cpu_capacity, roundedValue)
    );
    debounceUpdateInstance({ capacity_adjustment: roundedValue });
  };

  const formatHealthCheckTimeStamp = (last) => (
    <>
      {formatDateString(last)}
      {instance.health_check_pending ? (
        <>
          {' '}
          <OutlinedClockIcon />
        </>
      ) : null}
    </>
  );

  const { error, dismissError } = useDismissableError(
    updateInstanceError || healthCheckError
  );
  const {
    isLoading: isRemoveLoading,
    deleteItems: removeInstances,
    deletionError: removeError,
    clearDeletionError,
  } = useDeleteItems(
    async () => {
      await InstancesAPI.deprovisionInstance(instance.id);
      history.push('/instances');
    },
    {
      fetchItems: fetchDetails,
    }
  );

  if (contentError) {
    return <ContentError error={contentError} />;
  }
  if (isLoading || isRemoveLoading) {
    return <ContentLoading />;
  }
  const isHopNode = instance.node_type === 'hop';
  const isExecutionNode = instance.node_type === 'execution';
  const isManaged = instance.managed;

  return (
    <>
      {showHealthCheckAlert ? (
        <HealthCheckAlert onSetHealthCheckAlert={setShowHealthCheckAlert} />
      ) : null}
      <CardBody>
        <DetailList gutter="sm">
          <Detail
            label={i18n._(t`Host Name`)}
            value={instance.hostname}
            dataCy="instance-detail-name"
          />
          <Detail
            label={i18n._(t`Status`)}
            dataCy="status"
            value={
              instance.node_state ? (
                <StatusLabel status={instance.node_state} />
              ) : null
            }
          />
          <Detail label={i18n._(t`Node Type`)} value={instance.node_type} />
          <Detail label={i18n._(t`Host`)} value={instance.ip_address} />
          <Detail
            label={i18n._(t`Listener Port`)}
            value={instance.listener_port}
          />
          {!isManaged && instance.related?.install_bundle && (
            <Detail
              label={i18n._(t`Install Bundle`)}
              value={
                <Tooltip content={i18n._(t`Click to download bundle`)}>
                  <Button
                    component="a"
                    isSmall
                    href={`${instance.related?.install_bundle}`}
                    target="_blank"
                    variant="secondary"
                    dataCy="install-bundle-download-button"
                    rel="noopener noreferrer"
                  >
                    <DownloadIcon />
                  </Button>
                </Tooltip>
              }
            />
          )}
          {(isExecutionNode || isHopNode) && (
            <Detail
              label={i18n._(t`Peers from control nodes`)}
              value={
                instance.peers_from_control_nodes
                  ? i18n._(t`On`)
                  : i18n._(t`Off`)
              }
            />
          )}
          {!isHopNode && (
            <>
              <Detail
                label={i18n._(t`Policy Type`)}
                value={
                  instance.managed_by_policy
                    ? i18n._(t`Auto`)
                    : i18n._(t`Manual`)
                }
              />
              <Detail
                label={i18n._(t`Running Jobs`)}
                value={instance.jobs_running}
              />
              <Detail
                label={i18n._(t`Total Jobs`)}
                value={instance.jobs_total}
              />
              {instanceGroups && (
                <Detail
                  fullWidth
                  label={i18n._(t`Instance Groups`)}
                  dataCy="instance-groups"
                  helpText={i18n._(
                    t`The Instance Groups to which this instance belongs.`
                  )}
                  value={
                    <InstanceGroupLabels labels={instanceGroups} isLinkable />
                  }
                  isEmpty={instanceGroups.length === 0}
                />
              )}
              <Detail
                label={i18n._(t`Last Health Check`)}
                dataCy="last-health-check"
                helpText={
                  <>
                    {i18n._(t`Health checks are asynchronous tasks. See the`)}{' '}
                    <a
                      href={`${getDocsBaseUrl(
                        config
                      )}/html/administration/instances.html#health-check`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {i18n._(t`documentation`)}
                    </a>{' '}
                    {i18n._(t`for more info.`)}
                  </>
                }
                value={formatHealthCheckTimeStamp(instance.last_health_check)}
              />
              <Detail
                label={i18n._(t`Capacity Adjustment`)}
                dataCy="capacity-adjustment"
                value={
                  <SliderHolder data-cy="slider-holder">
                    <div data-cy="cpu-capacity">
                      {i18n._(t`CPU ${instance.cpu_capacity}`)}
                    </div>
                    <SliderForks data-cy="slider-forks">
                      <div data-cy="number-forks">
                        <Plural
                          value={forks}
                          one={i18n._(t`# fork`)}
                          other={i18n._(t`# forks`)}
                        />
                      </div>
                      <Slider
                        areCustomStepsContinuous
                        max={1}
                        min={0}
                        step={0.1}
                        value={instance.capacity_adjustment}
                        onChange={handleChangeValue}
                        isDisabled={
                          !config?.me?.is_superuser ||
                          !instance.enabled ||
                          !isManaged
                        }
                        data-cy="slider"
                      />
                    </SliderForks>
                    <div data-cy="mem-capacity">
                      {i18n._(t`RAM ${instance.mem_capacity}`)}
                    </div>
                  </SliderHolder>
                }
              />
              <Detail
                label={i18n._(t`Used Capacity`)}
                dataCy="used-capacity"
                value={
                  instance.enabled ? (
                    <Progress
                      title={i18n._(t`Used capacity`)}
                      value={Math.round(
                        100 - instance.percent_capacity_remaining
                      )}
                      measureLocation={ProgressMeasureLocation.top}
                      size={ProgressSize.sm}
                      aria-label={i18n._(t`Used capacity`)}
                    />
                  ) : (
                    <Unavailable>{i18n._(t`Unavailable`)}</Unavailable>
                  )
                }
              />
            </>
          )}
          {healthCheck?.errors && (
            <Detail
              fullWidth
              label={i18n._(t`Errors`)}
              dataCy="errors"
              value={
                <CodeBlock>
                  <CodeBlockCode>{healthCheck?.errors}</CodeBlockCode>
                </CodeBlock>
              }
            />
          )}
        </DetailList>
        <CardActionsRow>
          {config?.me?.is_superuser && isK8s && !isManaged && (
            <>
              <Button
                ouiaId="instance-detail-edit-button"
                aria-label={i18n._(t`edit`)}
                component={Link}
                to={`/instances/${id}/edit`}
              >
                {i18n._(t`Edit`)}
              </Button>
              <RemoveInstanceButton
                dataCy="remove-instance-button"
                itemsToRemove={[instance]}
                isK8s={isK8s}
                onRemove={removeInstances}
              />
            </>
          )}
          {isExecutionNode && (
            <Tooltip content={i18n._(t`Run a health check on the instance`)}>
              <Button
                isDisabled={
                  !config?.me?.is_superuser ||
                  instance.health_check_pending ||
                  instance.managed
                }
                variant="primary"
                ouiaId="health-check-button"
                onClick={fetchHealthCheck}
                isLoading={instance.health_check_pending}
                spinnerAriaLabel={i18n._(t`Running health check`)}
              >
                {instance.health_check_pending
                  ? i18n._(t`Running health check`)
                  : i18n._(t`Run health check`)}
              </Button>
            </Tooltip>
          )}
          {!isHopNode && (
            <InstanceToggle
              css="display: inline-flex;"
              fetchInstances={fetchDetails}
              instance={instance}
              dataCy="enable-instance"
            />
          )}
        </CardActionsRow>

        {error && (
          <AlertModal
            isOpen={error}
            onClose={dismissError}
            title={i18n._(t`Error!`)}
            variant="error"
          >
            {updateInstanceError
              ? i18n._(t`Failed to update capacity adjustment.`)
              : i18n._(t`Failed to disassociate one or more instances.`)}
            <ErrorDetail error={error} />
          </AlertModal>
        )}

        {removeError && (
          <AlertModal
            isOpen={removeError}
            variant="error"
            aria-label={i18n._(t`Removal Error`)}
            title={i18n._(t`Error!`)}
            onClose={clearDeletionError}
          >
            {i18n._(t`Failed to remove one or more instances.`)}
            <ErrorDetail error={removeError} />
          </AlertModal>
        )}
      </CardBody>
    </>
  );
}

export default InstanceDetail;
