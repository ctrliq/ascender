import React from 'react';
import { string, bool, func } from 'prop-types';

import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';

import { Link } from 'react-router-dom';
import 'styled-components/macro';
import {
  Button,
  Progress,
  ProgressMeasureLocation,
  ProgressSize,
} from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import { InstanceGroup } from 'types';

const Unavailable = styled.span`
  color: var(--pf-global--danger-color--200);
`;

function InstanceGroupListItem({
  instanceGroup,
  detailUrl,
  isSelected,
  onSelect,
  rowIndex,
}) {
  const { i18n } = useLingui();
  const labelId = `check-action-${instanceGroup.id}`;

  const isContainerGroup = (item) => item.is_container_group;

  function usedCapacity(item) {
    if (!isContainerGroup(item)) {
      if (item.capacity) {
        return (
          <Progress
            value={Math.round(100 - item.percent_capacity_remaining)}
            measureLocation={ProgressMeasureLocation.top}
            size={ProgressSize.sm}
            title={i18n._(t`Used capacity`)}
          />
        );
      }
      return <Unavailable>{i18n._(t`Unavailable`)}</Unavailable>;
    }
    return null;
  }

  return (
    <Tr id={`ig-row-${instanceGroup.id}`} ouiaId={`ig-row-${instanceGroup.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(t`Selected`)}
      />
      <TdBreakWord id={labelId} dataLabel={i18n._(t`Name`)}>
        <Link to={`${detailUrl}`}>
          <b>{instanceGroup.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={i18n._(t`Type`)}>
        {isContainerGroup(instanceGroup)
          ? i18n._(t`Container group`).toString()
          : i18n._(t`Instance group`).toString()}
      </Td>
      <Td dataLabel={i18n._(t`Running jobs`)}>
        {instanceGroup.jobs_running}
      </Td>
      <Td dataLabel={i18n._(t`Total jobs`)}>{instanceGroup.jobs_total}</Td>
      <Td dataLabel={i18n._(t`Instances`)}>{instanceGroup.instances}</Td>
      <Td dataLabel={i18n._(t`Capacity`)}>{usedCapacity(instanceGroup)}</Td>
      <ActionsTd dataLabel={i18n._(t`Actions`)}>
        <ActionItem
          visible={instanceGroup.summary_fields.user_capabilities.edit}
          tooltip={i18n._(t`Edit instance group`)}
        >
          <Button
            ouiaId={`${instanceGroup.id}-edit-button`}
            aria-label={i18n._(t`Edit instance group`)}
            variant="plain"
            component={Link}
            to={
              isContainerGroup(instanceGroup)
                ? `/instance_groups/container_group/${instanceGroup.id}/edit`
                : `/instance_groups/${instanceGroup.id}/edit`
            }
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}
InstanceGroupListItem.prototype = {
  instanceGroup: InstanceGroup.isRequired,
  detailUrl: string.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default InstanceGroupListItem;
