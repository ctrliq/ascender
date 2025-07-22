import React, { useCallback, useEffect, useState } from 'react';

import { useParams, useHistory } from 'react-router-dom';
import { msg, Trans, Plural } from '@lingui/macro';
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
import { CaretLeftIcon, OutlinedClockIcon } from '@patternfly/react-icons';
import styled from 'styled-components';

import { useConfig } from 'contexts/Config';
import { InstancesAPI, InstanceGroupsAPI } from 'api';
import useDebounce from 'hooks/useDebounce';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import DisassociateButton from 'components/DisassociateButton';
import InstanceToggle from 'components/InstanceToggle';
import { CardBody, CardActionsRow } from 'components/Card';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { formatDateString } from 'util/dates';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { Detail, DetailList } from 'components/DetailList';
import HealthCheckAlert from 'components/HealthCheckAlert';
import StatusLabel from 'components/StatusLabel';
import useRequest, {
  useDeleteItems,
  useDismissableError,
} from 'hooks/useRequest';

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

function InstanceDetails({ setBreadcrumb, instanceGroup }) {
  const { i18n } = useLingui();
  const config = useConfig();
  const { id, instanceId } = useParams();
  const history = useHistory();

  const [healthCheck, setHealthCheck] = useState({});
  const [showHealthCheckAlert, setShowHealthCheckAlert] = useState(false);
  const [forks, setForks] = useState();

  const policyRulesDocsLink = `${getDocsBaseUrl(
    config
  )}/html/administration/containers_instance_groups.html#ag-instance-group-policies`;

  const {
    isLoading,
    error: contentError,
    request: fetchDetails,
    result: { instance },
  } = useRequest(
    useCallback(async () => {
      const {
        data: { results },
      } = await InstanceGroupsAPI.readInstances(instanceGroup.id);
      const isAssociated = results.some(
        ({ id: instId }) => instId === parseInt(instanceId, 10)
      );

      if (isAssociated) {
        const { data: details } = await InstancesAPI.readDetail(instanceId);
        if (details.node_type === 'execution') {
          const { data: healthCheckData } =
            await InstancesAPI.readHealthCheckDetail(instanceId);
          setHealthCheck(healthCheckData);
        }
        setBreadcrumb(instanceGroup, details);
        setForks(
          computeForks(
            details.mem_capacity,
            details.cpu_capacity,
            details.capacity_adjustment
          )
        );
        return { instance: details };
      }
      throw new Error(
        `This instance is not associated with this instance group`
      );
    }, [instanceId, setBreadcrumb, instanceGroup]),
    { instance: {}, isLoading: true }
  );
  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);
  const { error: healthCheckError, request: fetchHealthCheck } = useRequest(
    useCallback(async () => {
      const { status } = await InstancesAPI.healthCheck(instanceId);
      if (status === 200) {
        setShowHealthCheckAlert(true);
      }
    }, [instanceId])
  );

  const {
    deleteItems: disassociateInstance,
    deletionError: disassociateError,
  } = useDeleteItems(
    useCallback(async () => {
      await InstanceGroupsAPI.disassociateInstance(
        instanceGroup.id,
        instance.id
      );
      history.push(`/instance_groups/${instanceGroup.id}/instances`);
    }, [instanceGroup.id, instance.id, history])
  );

  const { error: updateInstanceError, request: updateInstance } = useRequest(
    useCallback(
      async (values) => {
        await InstancesAPI.update(instance.id, values);
      },
      [instance]
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
    disassociateError || updateInstanceError || healthCheckError
  );

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {i18n._(msg`Back to Instances`)}
        </>
      ),
      link: `/instance_groups/${id}/instances`,
      id: 99,
    },
    {
      name: i18n._(msg`Details`),
      link: `/instance_groups/${id}/instances/${instanceId}/details`,
      id: 0,
    },
  ];
  if (contentError) {
    return <ContentError error={contentError} />;
  }
  if (isLoading) {
    return <ContentLoading />;
  }

  const isExecutionNode = instance.node_type === 'execution';

  return (
    <>
      <RoutedTabs tabsArray={tabsArray} />
      {showHealthCheckAlert ? (
        <HealthCheckAlert onSetHealthCheckAlert={setShowHealthCheckAlert} />
      ) : null}
      <CardBody>
        <DetailList gutter="sm">
          <Detail
            label={i18n._(msg`Host Name`)}
            value={instance.hostname}
            dataCy="instance-detail-name"
          />
          <Detail
            label={i18n._(msg`Status`)}
            value={
              instance.node_state ? (
                <StatusLabel status={instance.node_state} />
              ) : null
            }
          />
          <Detail
            label={i18n._(msg`Policy Type`)}
            value={
              instance.managed_by_policy
                ? i18n._(msg`Auto`)
                : i18n._(msg`Manual`)
            }
          />
          <Detail
            label={i18n._(msg`Running Jobs`)}
            value={instance.jobs_running}
          />
          <Detail label={i18n._(msg`Total Jobs`)} value={instance.jobs_total} />
          <Detail
            label={i18n._(msg`Last Health Check`)}
            helpText={
              <>
                {i18n._(msg`Health checks are asynchronous tasks. See the`)}{' '}
                <a
                  href={`${getDocsBaseUrl(
                    config
                  )}/html/administration/instances.html#health-check`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {i18n._(msg`documentation`)}
                </a>{' '}
                {i18n._(msg`for more info.`)}
              </>
            }
            value={formatHealthCheckTimeStamp(instance.last_health_check)}
          />
          <Detail label={i18n._(msg`Node Type`)} value={instance.node_type} />
          <Detail
            label={i18n._(msg`Capacity Adjustment`)}
            value={
              <SliderHolder data-cy="slider-holder">
                <div data-cy="cpu-capacity">
                  {i18n._(msg`CPU ${instance.cpu_capacity}`, {
                    cpu_capacity: instance.cpu_capacity,
                  })}
                </div>
                <SliderForks data-cy="slider-forks">
                  <div data-cy="number-forks">
                    <Plural
                      value={forks}
                      one={i18n._(msg`# fork`)}
                      other={i18n._(msg`# forks`)}
                    />
                  </div>
                  <Slider
                    areCustomStepsContinuous
                    max={1}
                    min={0}
                    step={0.1}
                    value={instance.capacity_adjustment}
                    onChange={handleChangeValue}
                    isDisabled={!config?.me?.is_superuser || !instance.enabled}
                    data-cy="slider"
                  />
                </SliderForks>
                <div data-cy="mem-capacity">
                  {i18n._(msg`RAM ${instance.mem_capacity}`, {
                    mem_capacity: instance.mem_capacity,
                  })}
                </div>
              </SliderHolder>
            }
          />
          <Detail
            label={i18n._(msg`Used Capacity`)}
            value={
              instance.enabled ? (
                <Progress
                  title={i18n._(msg`Used capacity`)}
                  value={Math.round(100 - instance.percent_capacity_remaining)}
                  measureLocation={ProgressMeasureLocation.top}
                  size={ProgressSize.sm}
                  aria-label={i18n._(msg`Used capacity`)}
                />
              ) : (
                <Unavailable>{i18n._(msg`Unavailable`)}</Unavailable>
              )
            }
          />
          {healthCheck?.errors && (
            <Detail
              fullWidth
              label={i18n._(msg`Errors`)}
              value={
                <CodeBlock>
                  <CodeBlockCode>{healthCheck?.errors}</CodeBlockCode>
                </CodeBlock>
              }
            />
          )}
        </DetailList>
        <CardActionsRow>
          {isExecutionNode && (
            <Tooltip content={i18n._(msg`Run a health check on the instance`)}>
              <Button
                isDisabled={
                  !config?.me?.is_superuser || instance.health_check_pending
                }
                variant="primary"
                ouiaId="health-check-button"
                onClick={fetchHealthCheck}
                isLoading={instance.health_check_pending}
                spinnerAriaLabel={i18n._(msg`Running health check`)}
              >
                {instance.health_check_pending
                  ? i18n._(msg`Running health check`)
                  : i18n._(msg`Run health check`)}
              </Button>
            </Tooltip>
          )}
          {config?.me?.is_superuser && instance.node_type !== 'control' && (
            <DisassociateButton
              verifyCannotDisassociate={instanceGroup.name === 'controlplane'}
              key="disassociate"
              onDisassociate={disassociateInstance}
              itemsToDisassociate={[instance]}
              isProtectedInstanceGroup={instanceGroup.name === 'controlplane'}
              modalTitle={i18n._(
                msg`Disassociate instance from instance group?`
              )}
              modalNote={
                instance.managed_by_policy ? (
                  <Trans>
                    <b>
                      {i18n._(
                        msg`Note: This instance may be re-associated with this instance group if it is managed by `
                      )}
                      <a
                        href={policyRulesDocsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {i18n._(msg`policy rules.`)}
                      </a>
                    </b>
                  </Trans>
                ) : null
              }
            />
          )}
          <InstanceToggle
            css="display: inline-flex;"
            fetchInstances={fetchDetails}
            instance={instance}
          />
        </CardActionsRow>
        {error && (
          <AlertModal
            isOpen={error}
            onClose={dismissError}
            title={i18n._(msg`Error!`)}
            variant="error"
          >
            {updateInstanceError
              ? i18n._(msg`Failed to update capacity adjustment.`)
              : i18n._(msg`Failed to disassociate one or more instances.`)}
            <ErrorDetail error={error} />
          </AlertModal>
        )}
      </CardBody>
    </>
  );
}

export default InstanceDetails;
