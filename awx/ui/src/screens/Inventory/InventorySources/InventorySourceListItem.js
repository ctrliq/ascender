import React from 'react';
import { Link } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Button, Tooltip } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import {
  ExclamationTriangleIcon as PFExclamationTriangleIcon,
  PencilAltIcon,
} from '@patternfly/react-icons';
import styled from 'styled-components';

import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import StatusLabel from 'components/StatusLabel';
import JobCancelButton from 'components/JobCancelButton';
import { formatDateString } from 'util/dates';
import { isJobRunning } from 'util/jobs';
import InventorySourceSyncButton from '../shared/InventorySourceSyncButton';

const ExclamationTriangleIcon = styled(PFExclamationTriangleIcon)`
  color: var(--pf-global--warning-color--100);
  margin-left: 18px;
`;

function InventorySourceListItem({
  source,
  isSelected,
  onSelect,
  detailUrl,
  label,
  rowIndex,
}) {
  const { i18n } = useLingui();
  const generateLastJobTooltip = (job) => (
    <>
      <div>{i18n._(msg`MOST RECENT SYNC`)}</div>
      <div>
        {i18n._(msg`JOB ID:`)} {job.id}
      </div>
      <div>
        {i18n._(msg`STATUS:`)} {job.status.toUpperCase()}
      </div>
      {job.finished && (
        <div>
          {i18n._(msg`FINISHED:`)} {formatDateString(job.finished)}
        </div>
      )}
    </>
  );

  const missingExecutionEnvironment =
    source.custom_virtualenv && !source.execution_environment;

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
      <TdBreakWord dataLabel={i18n._(msg`Name`)}>
        <Link to={`${detailUrl}/details`}>
          <b>{source.name}</b>
        </Link>
        {missingExecutionEnvironment && (
          <span>
            <Tooltip
              className="missing-execution-environment"
              content={i18n._(msg`Custom virtual environment ${source.custom_virtualenv} must be replaced by an execution environment.`)}
              position="right"
            >
              <ExclamationTriangleIcon />
            </Tooltip>
          </span>
        )}
      </TdBreakWord>
      <Td dataLabel={i18n._(msg`Status`)}>
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
      <Td dataLabel={i18n._(msg`Type`)}>{label}</Td>
      <ActionsTd dataLabel={i18n._(msg`Actions`)}>
        {['running', 'pending', 'waiting'].includes(job?.status) ? (
          <ActionItem visible={source.summary_fields.user_capabilities.start}>
            {source.summary_fields?.current_job?.id && (
              <JobCancelButton
                job={{
                  type: 'inventory_update',
                  id: source?.summary_fields?.current_job?.id,
                }}
                errorTitle={i18n._(msg`Inventory Source Sync Error`)}
                errorMessage={i18n._(msg`Failed to cancel Inventory Source Sync`)}
                title={i18n._(msg`Cancel Inventory Source Sync`)}
                showIconButton
              />
            )}
          </ActionItem>
        ) : (
          <ActionItem
            visible={source.summary_fields.user_capabilities.start}
            tooltip={i18n._(msg`Sync`)}
          >
            <InventorySourceSyncButton source={source} />
          </ActionItem>
        )}
        <ActionItem
          visible={source.summary_fields.user_capabilities.edit}
          tooltip={i18n._(msg`Edit`)}
        >
          <Button
            ouiaId={`${source.id}-edit-button`}
            aria-label={i18n._(msg`Edit Source`)}
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
