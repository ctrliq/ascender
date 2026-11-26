import type { Schedule, SummaryFieldRef } from 'types/api';
import React from 'react';

import { useLingui } from '@lingui/react/macro';

import { Link } from 'react-router';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import {
  PencilAltIcon,
  ExclamationTriangleIcon as PFExclamationTriangleIcon,
} from '@patternfly/react-icons';
import { formatDateString } from 'util/dates';
import { ActionsTd, ActionItem, TdBreakWord } from '../../PaginatedTable';
import { ScheduleToggle } from '..';
import './ScheduleListItem.css';
import Tooltip from '../../Tooltip';

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

  // The column is the kind of thing the schedule runs, which is what the
  // Related Resource beside it links to, rather than the kind of run it makes.
  const resourceTypeLabels = {
    inventory_update: t`Inventory Source`,
    job: t`Job Template`,
    project_update: t`Project`,
    system_job: t`Cleanup Job`,
    workflow_job: t`Workflow Template`,
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
      scheduleBaseUrl = `/cleanup_jobs/${template.id}/schedules/${schedule.id}`;
      relatedResourceUrl = `/cleanup_jobs/${template.id}/details`;
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
            >
              <PFExclamationTriangleIcon className="ascender-schedule-list-item__exclamation-triangle-icon" />
            </Tooltip>
          </span>
        )}
      </TdBreakWord>
      <TdBreakWord
        id={`related-resource-${schedule.id}`}
        dataLabel={t`Related Resource`}
      >
        <Link to={`${relatedResourceUrl}`}>
          <b>{template.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={t`Resource Type`}>
        {
          resourceTypeLabels[
            template.unified_job_type as keyof typeof resourceTypeLabels
          ]
        }
      </Td>
      {/*
       * The column heading already names the value, and on a narrow screen,
       * where the table stacks, PatternFly prints the data label beside it, so
       * the cell holds the date alone. It stays on one line so the AM or PM
       * does not fall under the rest of the time.
       */}
      <Td dataLabel={t`Next Run`} modifier="nowrap">
        {schedule.next_run
          ? formatDateString(schedule.next_run, schedule.timezone)
          : null}
      </Td>
      <ActionsTd dataLabel={t`Actions`} gridColumns="auto 40px">
        <ScheduleToggle schedule={schedule} isDisabled={isDisabled} />
        <ActionItem
          visible={schedule.summary_fields.user_capabilities?.edit}
          tooltip={t`Edit Schedule`}
        >
          <Button
            icon={<PencilAltIcon />}
            className="ascender-schedule-list-item__grid-column-2"
            ouiaId={`${schedule.id}-edit-button`}
            aria-label={t`Edit Schedule`}
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
