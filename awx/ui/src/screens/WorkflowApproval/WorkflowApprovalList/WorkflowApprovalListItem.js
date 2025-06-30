import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import useToast, { AlertVariant } from 'hooks/useToast';
import { string, bool, func } from 'prop-types';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router-dom';
import { WorkflowApproval } from 'types';
import { formatDateString } from 'util/dates';
import StatusLabel from 'components/StatusLabel';
import JobCancelButton from 'components/JobCancelButton';
import { ActionItem, ActionsTd } from 'components/PaginatedTable';
import {
  getPendingLabel,
  getStatus,
  getTooltip,
} from '../shared/WorkflowApprovalUtils';
import WorkflowApprovalButton from '../shared/WorkflowApprovalButton';
import WorkflowDenyButton from '../shared/WorkflowDenyButton';

function WorkflowApprovalListItem({
  workflowApproval,
  isSelected,
  onSelect,
  detailUrl,
  rowIndex,
}) {
  const { i18n } = useLingui();
  const { addToast } = useToast();
  const hasBeenActedOn =
    workflowApproval.status === 'successful' ||
    workflowApproval.status === 'failed' ||
    workflowApproval.status === 'canceled';
  const labelId = `check-action-${workflowApproval.id}`;
  const workflowJob = workflowApproval?.summary_fields?.source_workflow_job;
  const status = getStatus(workflowApproval);
  // Toast handler for approve/deny actions (PatternFly style)
  const handleToast = (id, message) => {
    addToast({
      id,
      title: message,
      variant: AlertVariant.success,
      hasTimeout: true,
    });
  };
  return (
    <Tr id={`workflow-approval-row-${workflowApproval.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(msg`Selected`)}
      />
      <Td id={labelId} dataLabel={i18n._(msg`Name`)}>
        <Link to={`${detailUrl}`}>
          {workflowJob && workflowJob?.id ? (
            <b>{`${workflowJob?.id} - ${workflowApproval?.name}`}</b>
          ) : (
            <b>
              {i18n._(msg`Deleted`)} {`- ${workflowApproval?.name}`}
            </b>
          )}
        </Link>
      </Td>
      <Td>
        {workflowJob && workflowJob?.id ? (
          <Link to={`/jobs/workflow/${workflowJob?.id}`}>
            {`${workflowJob?.id} - ${workflowJob?.name}`}
          </Link>
        ) : (
          i18n._(msg`Deleted`)
        )}
      </Td>
      <Td dataLabel={i18n._(msg`Started`)}>
        {formatDateString(workflowApproval.started)}
      </Td>
      <Td dataLabel={i18n._(msg`Status`)}>
        {workflowApproval.status === 'pending' ? (
          <StatusLabel status={workflowApproval.status}>
            {getPendingLabel(workflowApproval, i18n)}
          </StatusLabel>
        ) : (
          <StatusLabel
            tooltipContent={getTooltip(workflowApproval, i18n)}
            status={status}
          />
        )}
      </Td>
      <ActionsTd dataLabel={i18n._(msg`Actions`)}>
        <ActionItem
          visible
          tooltip={
            hasBeenActedOn ? i18n._(msg`This has already been acted on`) : i18n._(msg`Approve`)
          }
        >
          <WorkflowApprovalButton workflowApproval={workflowApproval} onHandleToast={handleToast} />
        </ActionItem>
        <ActionItem
          visible
          tooltip={hasBeenActedOn ? i18n._(msg`This has already been acted on`) : i18n._(msg`Deny`)}
        >
          <WorkflowDenyButton workflowApproval={workflowApproval} onHandleToast={handleToast} />
        </ActionItem>
        <ActionItem visible>
          <JobCancelButton
            title={i18n._(msg`Cancel Workflow`)}
            showIconButton
            job={{
              ...workflowApproval.summary_fields.source_workflow_job,
              type: 'workflow_job',
            }}
            buttonText={i18n._(msg`Cancel Workflow`)}
            isDisabled={hasBeenActedOn}
            tooltip={
              hasBeenActedOn ? i18n._(msg`This has already been acted on`) : i18n._(msg`Cancel`)
            }
            cancelationMessage={i18n._(msg`This will cancel all subsequent nodes in this workflow`)}
          />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

WorkflowApprovalListItem.propTypes = {
  workflowApproval: WorkflowApproval.isRequired,
  detailUrl: string.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default WorkflowApprovalListItem;
