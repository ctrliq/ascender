import type { Instance, InstanceGroup, SetBreadcrumb } from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';

import { useNavigate, useParams } from 'react-router';
import { Plural, Trans, useLingui } from '@lingui/react/macro';

import {
  Button,
  Progress,
  ProgressMeasureLocation,
  ProgressSize,
  CodeBlock,
  CodeBlockCode,
  Slider,
} from '@patternfly/react-core';
import { CaretLeftIcon, OutlinedClockIcon } from '@patternfly/react-icons';

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
import './InstanceDetails.css';
import Tooltip from 'components/Tooltip';
import { DEFAULT_QUEUE_NAMES } from '../shared/queueNames';

/**
 * How many forks an instance offers at the capacity it is set to, which is the
 * figure the slider previews before the value is saved.
 */
function computeForks(
  memCapacity: number,
  cpuCapacity: number,
  selectedCapacityAdjustment: number
) {
  const minCapacity = Math.min(memCapacity, cpuCapacity);
  const maxCapacity = Math.max(memCapacity, cpuCapacity);

  return Math.floor(
    minCapacity + (maxCapacity - minCapacity) * selectedCapacityAdjustment
  );
}

export interface InstanceDetailsProps {
  setBreadcrumb: SetBreadcrumb;
  instanceGroup: InstanceGroup;
  /**
   * The group a hybrid node may not leave, by the name the api's
   * DEFAULT_CONTROL_PLANE_QUEUE_NAME setting gives it.
   */
  controlPlaneName?: string;
  [key: string]: unknown;
}

function InstanceDetails({
  setBreadcrumb,
  instanceGroup,
  controlPlaneName = DEFAULT_QUEUE_NAMES.controlPlane,
}: InstanceDetailsProps) {
  const { t } = useLingui();
  const config = useConfig();
  const { id, instanceId } = useParams() as { id: string; instanceId: string };
  const navigate = useNavigate();

  const [healthCheck, setHealthCheck] = useState<Partial<Instance>>({});
  const [showHealthCheckAlert, setShowHealthCheckAlert] = useState(false);
  // Seeded rather than left undefined so the Plural below can take it as it
  // is: an expression there would change the message id.
  const [forks, setForks] = useState<number>(0);

  const policyRulesDocsLink = `${getDocsBaseUrl(
    config
  )}/html/administration/containers_instance_groups.html#ag-instance-group-policies`;

  const {
    isLoading,
    error: contentError,
    request: fetchDetails,
    result: { instance, canAdminGroup },
  } = useRequest(
    useCallback(async () => {
      // Asked of this one instance rather than read off the group's first
      // page, which left an instance further down reported as unassociated.
      const [
        {
          data: { results },
        },
        { data: options },
      ] = await Promise.all([
        InstanceGroupsAPI.readInstances(instanceGroup.id, { id: instanceId }),
        InstanceGroupsAPI.readInstanceOptions(instanceGroup.id),
      ]);
      const isAssociated = results.some(
        ({ id: instId }) => instId === parseInt(instanceId, 10)
      );
      // The api offers POST on the group's instances to an admin of the
      // group, the same role it asks of taking an instance out of it.
      const canAdmin = Boolean(options?.actions?.POST);

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
            Number(details.capacity_adjustment)
          )
        );
        return { instance: details, canAdminGroup: canAdmin };
      }
      throw new Error(
        `This instance is not associated with this instance group`
      );
    }, [instanceId, setBreadcrumb, instanceGroup]),
    { instance: {}, canAdminGroup: false, isLoading: true }
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
      navigate(`/instance_groups/${instanceGroup.id}/instances`);
    }, [instanceGroup.id, instance.id, navigate])
  );

  const { error: updateInstanceError, request: updateInstance } = useRequest(
    useCallback(
      // A patch body rather than an instance: the capacity is sent as the
      // number the slider holds, where the api reports it as a decimal string.
      async (values: Record<string, unknown>) => {
        await InstancesAPI.update(instance.id, values);
      },
      [instance]
    )
  );
  const debounceUpdateInstance = useDebounce(updateInstance, 200);

  const handleChangeValue = (value: number) => {
    const roundedValue = Math.round(value * 100) / 100;
    setForks(
      computeForks(instance.mem_capacity, instance.cpu_capacity, roundedValue)
    );
    debounceUpdateInstance({ capacity_adjustment: roundedValue });
  };

  const formatHealthCheckTimeStamp = (last?: string | null) => (
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
          {t`Back to Instances`}
        </>
      ),
      link: `/instance_groups/${id}/instances`,
      id: 99,
    },
    {
      name: t`Details`,
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
            label={t`Host Name`}
            value={instance.hostname}
            dataCy="instance-detail-name"
          />
          <Detail
            label={t`Status`}
            value={
              instance.node_state ? (
                <StatusLabel status={instance.node_state} />
              ) : null
            }
          />
          <Detail
            label={t`Policy Type`}
            value={instance.managed_by_policy ? t`Auto` : t`Manual`}
          />
          <Detail label={t`Running Jobs`} value={instance.jobs_running} />
          <Detail label={t`Total Jobs`} value={instance.jobs_total} />
          <Detail
            label={t`Last Health Check`}
            helpText={
              <>
                {t`Health checks are asynchronous tasks. See the`}{' '}
                <a
                  href={`${getDocsBaseUrl(
                    config
                  )}/html/administration/instances.html#health-check`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t`documentation`}
                </a>{' '}
                {t`for more info.`}
              </>
            }
            value={formatHealthCheckTimeStamp(instance.last_health_check)}
          />
          <Detail label={t`Node Type`} value={instance.node_type} />
          <Detail
            label={t`Capacity Adjustment`}
            value={
              <div
                className="ascender-instance-details__slider-holder"
                data-cy="slider-holder"
              >
                <div data-cy="cpu-capacity">
                  {t`CPU ${instance.cpu_capacity}`}
                </div>
                <div
                  className="ascender-instance-details__slider-forks"
                  data-cy="slider-forks"
                >
                  <div data-cy="number-forks">
                    <Plural value={forks} one="# fork" other="# forks" />
                  </div>
                  <Slider
                    areCustomStepsContinuous
                    max={1}
                    min={0}
                    step={0.1}
                    value={Number(instance.capacity_adjustment)}
                    onChange={(_event, value) => handleChangeValue(value)}
                    isDisabled={!config?.me?.is_superuser || !instance.enabled}
                    data-cy="slider"
                  />
                </div>
                <div data-cy="mem-capacity">
                  {t`RAM ${instance.mem_capacity}`}
                </div>
              </div>
            }
          />
          <Detail
            label={t`Used Capacity`}
            value={
              instance.enabled ? (
                <Progress
                  title={t`Used Capacity`}
                  value={Math.round(
                    100 - Number(instance.percent_capacity_remaining)
                  )}
                  measureLocation={ProgressMeasureLocation.top}
                  size={ProgressSize.sm}
                  aria-label={t`Used Capacity`}
                />
              ) : (
                <span className="ascender-instance-details__unavailable">{t`Unavailable`}</span>
              )
            }
          />
          {healthCheck?.errors && (
            <Detail
              fullWidth
              label={t`Errors`}
              value={
                <CodeBlock>
                  <CodeBlockCode>{healthCheck?.errors}</CodeBlockCode>
                </CodeBlock>
              }
            />
          )}
        </DetailList>
        <CardActionsRow>
          {/* The api runs a health check on any execution node for a
              superuser, managed or not: managed only stops deletion. Anyone
              else is not offered it at all, as on the lists, rather than
              shown a button that can never be pressed. */}
          {isExecutionNode && config?.me?.is_superuser && (
            <Tooltip content={t`Run Health Check`}>
              <Button
                isDisabled={Boolean(instance.health_check_pending)}
                variant="primary"
                ouiaId="health-check-button"
                onClick={fetchHealthCheck}
                isLoading={Boolean(instance.health_check_pending)}
                spinnerAriaLabel={t`Running Health Check`}
              >
                {instance.health_check_pending
                  ? t`Running Health Check`
                  : t`Run Health Check`}
              </Button>
            </Tooltip>
          )}
          {canAdminGroup && instance.node_type !== 'control' && (
            <DisassociateButton
              verifyCannotDisassociate={false}
              cannotDisassociateReason={(item) =>
                instanceGroup.name === controlPlaneName &&
                item.node_type === 'hybrid'
                  ? t`Hybrid nodes cannot be disassociated from ${controlPlaneName}`
                  : null
              }
              key="disassociate"
              onDisassociate={disassociateInstance}
              itemsToDisassociate={[instance]}
              modalTitle={t`Disassociate this instance from the instance group?`}
              modalNote={
                instance.managed_by_policy ? (
                  <Trans>
                    <b>
                      Note: This instance may be re-associated with this
                      instance group if it is managed by{' '}
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
            />
          )}
          <InstanceToggle fetchInstances={fetchDetails} instance={instance} />
        </CardActionsRow>
        {Boolean(error) && (
          <AlertModal
            isOpen={error}
            onClose={dismissError}
            title={t`Error!`}
            variant="error"
          >
            {Boolean(updateInstanceError) &&
              t`Failed to update capacity adjustment.`}
            {Boolean(disassociateError) &&
              t`Failed to disassociate the instance.`}
            {Boolean(healthCheckError) && t`Failed to run a health check.`}
            <ErrorDetail error={error} />
          </AlertModal>
        )}
      </CardBody>
    </>
  );
}

export default InstanceDetails;
