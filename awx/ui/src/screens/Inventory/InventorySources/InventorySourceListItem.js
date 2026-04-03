import React from 'react';
import { Link } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { Button, Tooltip } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import {
  PencilAltIcon,
} from '@patternfly/react-icons';

import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import StatusLabel from 'components/StatusLabel';
import JobCancelButton from 'components/JobCancelButton';
import { formatDateString } from 'util/dates';
import { isJobRunning } from 'util/jobs';
import InventorySourceSyncButton from '../shared/InventorySourceSyncButton';

function InventorySourceListItem({
  source,
  isSelected,
  onSelect,
  detailUrl,
  label,
  rowIndex,
}) {
  const { t } = useLingui();
  const generateLastJobTooltip = (job) => (
    <>
      <div>{t`MOST RECENT SYNC`}</div>
      <div>
        {t`JOB ID:`} {job.id}
      </div>
      <div>
        {t`STATUS:`} {job.status.toUpperCase()}
      </div>
      {job.finished && (
        <div>
          {t`FINISHED:`} {formatDateString(job.finished)}
        </div>
      )}
    </>
  );

  let job = null;

  if (source.summary_fields?.current_job) {
    job = source.summary_fields.current_job;
  } else if (source.summary_fields?.last_job) {
    job = source.summary_fields.last_job;
  }

  return (
    <Tr id={`source-row-${source.id}`} ouiaId={`source-row-${source.id}`}>
      <Td
        data-cy={`check-action-${source.id}`}
        select={{
          rowIndex,
          isSelected,
          onSelect,
          disable: isJobRunning(source.status),
        }}
      />
      <TdBreakWord dataLabel={t`Name`}>
        <Link to={`${detailUrl}/details`}>
          <b>{source.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={t`Status`}>
        {job && (
          <Tooltip
            position="top"
            content={generateLastJobTooltip(job)}
            key={job.id}
          >
            <Link to={`/jobs/inventory/${job.id}`}>
              <StatusLabel status={job.status} />
            </Link>
          </Tooltip>
        )}
      </Td>
      <Td dataLabel={t`Type`}>{label}</Td>
      <ActionsTd dataLabel={t`Actions`}>
        {['running', 'pending', 'waiting'].includes(job?.status) ? (
          <ActionItem visible={source.summary_fields.user_capabilities.start}>
            {source.summary_fields?.current_job?.id && (
              <JobCancelButton
                job={{
                  type: 'inventory_update',
                  id: source?.summary_fields?.current_job?.id,
                }}
                errorTitle={t`Inventory Source Sync Error`}
                errorMessage={t`Failed to cancel Inventory Source Sync`}
                title={t`Cancel Inventory Source Sync`}
                showIconButton
              />
            )}
          </ActionItem>
        ) : (
          <ActionItem
            visible={source.summary_fields.user_capabilities.start}
            tooltip={t`Sync`}
          >
            <InventorySourceSyncButton source={source} />
          </ActionItem>
        )}
        <ActionItem
          visible={source.summary_fields.user_capabilities.edit}
          tooltip={t`Edit`}
        >
          <Button
            ouiaId={`${source.id}-edit-button`}
            aria-label={t`Edit Source`}
            variant="plain"
            component={Link}
            to={`${detailUrl}/edit`}
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}
export default InventorySourceListItem;
