import type { Schedule, SummaryFieldRef } from 'types/api';
import React from 'react';

import { useLingui } from '@lingui/react/macro';

import { Link } from 'react-router';
import { Button, Tooltip } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import {
  PencilAltIcon,
  ExclamationTriangleIcon as PFExclamationTriangleIcon,
} from '@patternfly/react-icons';
import styled from 'styled-components';
import { formatDateString } from 'util/dates';
import { DetailList, Detail } from '../../DetailList';
import { ActionsTd, ActionItem, TdBreakWord } from '../../PaginatedTable';
import { ScheduleToggle } from '..';

const ExclamationTriangleIcon = styled(PFExclamationTriangleIcon)`
  color: var(--pf-v6-global--danger-color--100);
  margin-left: 20px;
`;

export interface ScheduleListItemProps {
  rowIndex: number;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  schedule: Schedule;
  isMissingInventory: boolean;
  isMissingSurvey: boolean;
  [key: string]: unknown;
}

function ScheduleListItem({
  rowIndex,
  isSelected,
  onSelect,
  schedule,
  isMissingInventory,
  isMissingSurvey,
}: ScheduleListItemProps) {
  const { t } = useLingui();
  const labelId = `check-action-${schedule.id}`;

  const jobTypeLabels = {
    inventory_update: t`Inventory Sync`,
    job: t`Playbook Run`,
    project_update: t`Source Control Update`,
    system_job: t`Management Job`,
    workflow_job: t`Workflow Job`,
  };

  let scheduleBaseUrl;
  let relatedResourceUrl;

  // A schedule always belongs to a template, and one on an inventory source
  // always carries the inventory it syncs, which is what these urls are built
  // from. Read once here rather than asserted at each of the ten uses below.
  const template = schedule.summary_fields
    .unified_job_template as SummaryFieldRef & { unified_job_type?: string };
  const inventory = schedule.summary_fields.inventory as SummaryFieldRef;

  switch (template.unified_job_type) {
    case 'inventory_update':
      scheduleBaseUrl = `/inventories/inventory/${inventory.id}/sources/${template.id}/schedules/${schedule.id}`;
      relatedResourceUrl = `/inventories/inventory/${inventory.id}/sources/${template.id}/details`;
      break;
    case 'job':
      scheduleBaseUrl = `/templates/job_template/${template.id}/schedules/${schedule.id}`;
      relatedResourceUrl = `/templates/job_template/${template.id}/details`;
      break;
    case 'project_update':
      scheduleBaseUrl = `/projects/${template.id}/schedules/${schedule.id}`;
      relatedResourceUrl = `/projects/${template.id}/details`;
      break;
    case 'system_job':
      scheduleBaseUrl = `/management_jobs/${template.id}/schedules/${schedule.id}`;
      relatedResourceUrl = `/management_jobs`;
      break;
    case 'workflow_job':
      scheduleBaseUrl = `/templates/workflow_job_template/${template.id}/schedules/${schedule.id}`;
      relatedResourceUrl = `/templates/workflow_job_template/${template.id}/details`;
      break;
    default:
      break;
  }
  const isDisabled = Boolean(isMissingInventory || isMissingSurvey);

  return (
    <Tr
      id={`schedule-row-${schedule.id}`}
      ouiaId={`schedule-row-${schedule.id}`}
    >
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
          isDisabled: false,
        }}
        dataLabel={t`Selected`}
      />
      <TdBreakWord id={labelId} dataLabel={t`Name`}>
        <Link to={`${scheduleBaseUrl}/details`}>
          <b>{schedule.name}</b>
        </Link>
        {Boolean(isMissingInventory || isMissingSurvey) && (
          <span>
            <Tooltip
              content={[isMissingInventory, isMissingSurvey].map((message) =>
                message ? <div key={String(message)}>{message}</div> : null
              )}
              position="right"
            >
              <ExclamationTriangleIcon />
            </Tooltip>
          </span>
        )}
      </TdBreakWord>
      <TdBreakWord
        id={`related-resource-${schedule.id}`}
        dataLabel={t`Related resource`}
      >
        <Link to={`${relatedResourceUrl}`}>
          <b>{template.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={t`Resource type`}>
        {jobTypeLabels[template.unified_job_type as keyof typeof jobTypeLabels]}
      </Td>
      <Td dataLabel={t`Next Run`}>
        {schedule.next_run && (
          <DetailList stacked>
            <Detail
              label={t`Next Run`}
              value={formatDateString(schedule.next_run, schedule.timezone)}
            />
          </DetailList>
        )}
      </Td>
      <ActionsTd dataLabel={t`Actions`} gridColumns="auto 40px">
        <ScheduleToggle schedule={schedule} isDisabled={isDisabled} />
        <ActionItem
          visible={schedule.summary_fields.user_capabilities?.edit}
          tooltip={t`Edit Schedule`}
        >
          <Button
            icon={<PencilAltIcon />}
            ouiaId={`${schedule.id}-edit-button`}
            aria-label={t`Edit Schedule`}
            css="grid-column: 2"
            variant="plain"
            component={Link}
            to={`${scheduleBaseUrl}/edit`}
          />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

export default ScheduleListItem;
