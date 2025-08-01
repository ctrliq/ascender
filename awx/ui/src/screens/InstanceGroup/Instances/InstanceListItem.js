import React, { useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { bool, func } from 'prop-types';
import { msg, Plural } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import styled from 'styled-components';
import 'styled-components/macro';
import {
  Progress,
  ProgressMeasureLocation,
  ProgressSize,
  Slider,
  Tooltip,
} from '@patternfly/react-core';
import { OutlinedClockIcon } from '@patternfly/react-icons';
import { Tr, Td, ExpandableRowContent } from '@patternfly/react-table';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { formatDateString } from 'util/dates';
import { ActionsTd, ActionItem } from 'components/PaginatedTable';
import InstanceToggle from 'components/InstanceToggle';
import StatusLabel from 'components/StatusLabel';
import { Instance } from 'types';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import useDebounce from 'hooks/useDebounce';
import computeForks from 'util/computeForks';
import { InstancesAPI } from 'api';
import { useConfig } from 'contexts/Config';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { Detail, DetailList } from 'components/DetailList';

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

function InstanceListItem({
  instance,
  isExpanded,
  onExpand,
  isSelected,
  onSelect,
  fetchInstances,
  rowIndex,
}) {
  const { i18n } = useLingui();
  const config = useConfig();
  const { id } = useParams();
  const [forks, setForks] = useState(
    computeForks(
      instance.mem_capacity,
      instance.cpu_capacity,
      instance.capacity_adjustment
    )
  );

  const labelId = `check-action-${instance.id}`;

  function usedCapacity(item) {
    if (item.enabled) {
      return (
        <Progress
          value={Math.round(100 - item.percent_capacity_remaining)}
          measureLocation={ProgressMeasureLocation.top}
          size={ProgressSize.sm}
          title={i18n._(msg`Used capacity`)}
        />
      );
    }
    return <Unavailable>{i18n._(msg`Unavailable`)}</Unavailable>;
  }

  const { error: updateInstanceError, request: updateInstance } = useRequest(
    useCallback(
      async (values) => {
        await InstancesAPI.update(instance.id, values);
      },
      [instance]
    )
  );

  const { error: updateError, dismissError: dismissUpdateError } =
    useDismissableError(updateInstanceError);

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

  return (
    <>
      <Tr
        id={`instance-row-${instance.id}`}
        ouiaId={`instance-row-${instance.id}`}
      >
        <Td
          expand={{
            rowIndex,
            isExpanded,
            onToggle: onExpand,
          }}
        />
        <Td
          select={{
            rowIndex,
            isSelected,
            onSelect,
          }}
          dataLabel={i18n._(msg`Selected`)}
        />
        <Td id={labelId} dataLabel={i18n._(msg`Name`)}>
          <Link to={`/instance_groups/${id}/instances/${instance.id}/details`}>
            <b>{instance.hostname}</b>
          </Link>
        </Td>
        <Td dataLabel={i18n._(msg`Status`)}>
          <Tooltip
            content={
              <div>
                {i18n._(msg`Last Health Check`)}
                &nbsp;
                {formatDateString(instance.last_health_check)}
              </div>
            }
          >
            <StatusLabel status={instance.node_state} />
          </Tooltip>
        </Td>
        <Td dataLabel={i18n._(msg`Node Type`)}>{instance.node_type}</Td>
        <Td dataLabel={i18n._(msg`Capacity Adjustment`)}>
          <SliderHolder data-cy="slider-holder">
            <div data-cy="cpu-capacity">
              {i18n._(msg`CPU ${instance.cpu_capacity}`)}
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
              {i18n._(msg`RAM ${instance.mem_capacity}`)}
            </div>
          </SliderHolder>
        </Td>
        <Td
          dataLabel={i18n._(msg`Instance group used capacity`)}
          css="--pf-c-table--cell--MinWidth: 175px;"
        >
          {usedCapacity(instance)}
        </Td>
        <ActionsTd
          dataLabel={i18n._(msg`Actions`)}
          css="--pf-c-table--cell--Width: 125px"
        >
          <ActionItem visible>
            <InstanceToggle
              css="display: inline-flex;"
              fetchInstances={fetchInstances}
              instance={instance}
            />
          </ActionItem>
        </ActionsTd>
      </Tr>
      <Tr
        ouiaId={`instance-row-${instance.id}-expanded`}
        isExpanded={isExpanded}
      >
        <Td colSpan={2} />
        <Td colSpan={7}>
          <ExpandableRowContent>
            <DetailList>
              <Detail
                data-cy="running-jobs"
                value={instance.jobs_running}
                label={i18n._(msg`Running Jobs`)}
              />
              <Detail
                data-cy="total-jobs"
                value={instance.jobs_total}
                label={i18n._(msg`Total Jobs`)}
              />
              <Detail
                data-cy="policy-type"
                label={i18n._(msg`Policy Type`)}
                value={
                  instance.managed_by_policy
                    ? i18n._(msg`Auto`)
                    : i18n._(msg`Manual`)
                }
              />
              <Detail
                data-cy="last-health-check"
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
            </DetailList>
          </ExpandableRowContent>
        </Td>
      </Tr>
      {updateError && (
        <AlertModal
          variant="error"
          title={i18n._(msg`Error!`)}
          isOpen
          onClose={dismissUpdateError}
        >
          {i18n._(msg`Failed to update capacity adjustment.`)}
          <ErrorDetail error={updateError} />
        </AlertModal>
      )}
    </>
  );
}

InstanceListItem.prototype = {
  instance: Instance.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default InstanceListItem;
