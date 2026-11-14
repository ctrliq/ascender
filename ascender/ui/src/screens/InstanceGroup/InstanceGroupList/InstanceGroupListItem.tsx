import type { InstanceGroup } from 'types/api';
import React from 'react';

import { useLingui } from '@lingui/react/macro';

import { Link } from 'react-router';
import {
  Button,
  Progress,
  ProgressMeasureLocation,
  ProgressSize,
} from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import './InstanceGroupListItem.css';

export interface InstanceGroupListItemProps {
  instanceGroup: InstanceGroup;
  detailUrl: string;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  rowIndex: number;
  /**
   * Whether the row carries a checkbox. A list whose viewer can do nothing
   * with a selection leaves it out, and the header's with it.
   */
  isSelectable?: boolean;
  [key: string]: unknown;
}

function InstanceGroupListItem({
  instanceGroup,
  detailUrl,
  isSelected,
  onSelect,
  rowIndex,
  isSelectable = true,
}: InstanceGroupListItemProps) {
  const { t } = useLingui();
  const labelId = `check-action-${instanceGroup.id}`;

  const isContainerGroup = (item: InstanceGroup) => item.is_container_group;

  function usedCapacity(item: InstanceGroup) {
    if (!isContainerGroup(item)) {
      if (item.capacity) {
        return (
          <Progress
            value={Math.round(100 - (item.percent_capacity_remaining ?? 0))}
            measureLocation={ProgressMeasureLocation.top}
            size={ProgressSize.sm}
            aria-label={t`Used Capacity`}
          />
        );
      }
      return (
        <span className="ascender-instance-group-list-item__unavailable">{t`Unavailable`}</span>
      );
    }
    return null;
  }

  return (
    <Tr id={`ig-row-${instanceGroup.id}`} ouiaId={`ig-row-${instanceGroup.id}`}>
      {isSelectable && (
        <Td
          select={{
            rowIndex,
            isSelected,
            onSelect,
          }}
          dataLabel={t`Selected`}
        />
      )}
      <TdBreakWord id={labelId} dataLabel={t`Name`}>
        <Link to={`${detailUrl}`}>
          <b>{instanceGroup.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={t`Running Jobs`}>{instanceGroup.jobs_running}</Td>
      <Td dataLabel={t`Total Jobs`}>{instanceGroup.jobs_total}</Td>
      <Td dataLabel={t`Instances`}>{instanceGroup.instances}</Td>
      <Td dataLabel={t`Capacity`}>{usedCapacity(instanceGroup)}</Td>
      <ActionsTd dataLabel={t`Actions`}>
        <ActionItem
          visible={instanceGroup.summary_fields.user_capabilities?.edit}
          tooltip={
            isContainerGroup(instanceGroup)
              ? t`Edit Container Group`
              : t`Edit Instance Group`
          }
        >
          <Button
            icon={<PencilAltIcon />}
            ouiaId={`${instanceGroup.id}-edit-button`}
            aria-label={
              isContainerGroup(instanceGroup)
                ? t`Edit Container Group`
                : t`Edit Instance Group`
            }
            variant="plain"
            component={Link}
            to={
              isContainerGroup(instanceGroup)
                ? `/container_groups/${instanceGroup.id}/edit`
                : `/instance_groups/${instanceGroup.id}/edit`
            }
          />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}
export default InstanceGroupListItem;
