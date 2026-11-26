import type { WorkflowApproval } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import useToast, { AlertVariant } from 'hooks/useToast';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router';
import { formatDateString } from 'util/dates';
import StatusLabel from 'components/StatusLabel';
import JobCancelButton from 'components/JobCancelButton';
import { ActionItem, ActionsTd } from 'components/PaginatedTable';
import {
  getPendingLabel,
  getStatus,
  getTooltip,
  isWorkflowDeleted,
} from '../shared/WorkflowApprovalUtils';
import WorkflowApprovalButton from '../shared/WorkflowApprovalButton';
import WorkflowDenyButton from '../shared/WorkflowDenyButton';

export interface WorkflowApprovalListItemProps {
  workflowApproval: WorkflowApproval;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  detailUrl: string;
  rowIndex: number;
  [key: string]: unknown;
}

function WorkflowApprovalListItem({
  workflowApproval,
  isSelected,
  onSelect,
  detailUrl,
  rowIndex,
}: WorkflowApprovalListItemProps) {
  const { t } = useLingui();
  const { addToast } = useToast();
  const hasBeenActedOn =
    workflowApproval.status === 'successful' ||
    workflowApproval.status === 'failed' ||
    workflowApproval.status === 'canceled';
  const labelId = `check-action-${workflowApproval.id}`;
  const workflowJob = workflowApproval?.summary_fields?.source_workflow_job;
  // The workflow is gone, so there is nothing for a vote or a cancel to reach.
  const workflowIsDeleted = isWorkflowDeleted(workflowApproval);
  const status = getStatus(workflowApproval);
  // The api says no once the approval has been acted on as well, so this only
  // stands for missing permission while it is still waiting on a vote. The
  // details page and the toolbar buttons hold back on the same field.
  const isNotPermitted =
    !hasBeenActedOn && !workflowApproval.can_approve_or_deny;
  const reasonUnavailable =
    (hasBeenActedOn && t`This workflow has already been acted on`) ||
    (workflowIsDeleted && t`This workflow has been deleted`) ||
    (isNotPermitted &&
      t`You do not have permission to act on this workflow approval`);
  // Canceling the workflow is a right on the workflow job, its creator or an
  // admin of its template, which the api reports apart from the approver role
  // that approve and deny read.
  const cannotCancelWorkflow = !workflowApproval.can_cancel_workflow;
  const reasonCannotCancel =
    (hasBeenActedOn && t`This workflow has already been acted on`) ||
    (workflowIsDeleted && t`This workflow has been deleted`) ||
    (cannotCancelWorkflow &&
      t`You do not have permission to cancel this workflow`);
  // Toast handler for approve/deny actions (PatternFly style)
  const handleToast = (id: number, message: string) => {
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
        dataLabel={t`Selected`}
      />
      <Td id={labelId} dataLabel={t`Name`}>
        <Link to={`${detailUrl}`}>
          {workflowJob && workflowJob?.id ? (
            <b>{`${workflowJob?.id} - ${workflowApproval?.name}`}</b>
          ) : (
            <b>
              {t`Deleted`} {`- ${workflowApproval?.name}`}
            </b>
          )}
        </Link>
      </Td>
      <Td dataLabel={t`Workflow`}>
        {workflowJob && workflowJob?.id ? (
          <Link to={`/runs/workflow/${workflowJob?.id}`}>
            {`${workflowJob?.id} - ${workflowJob?.name}`}
          </Link>
        ) : (
          t`Deleted`
        )}
      </Td>
      <Td dataLabel={t`Started`} modifier="nowrap">
        {formatDateString(workflowApproval.started)}
      </Td>
      <Td dataLabel={t`Status`}>
        {workflowApproval.status === 'pending' ? (
          <StatusLabel status={workflowApproval.status}>
            {getPendingLabel(workflowApproval)}
          </StatusLabel>
        ) : (
          <StatusLabel
            tooltipContent={getTooltip(workflowApproval)}
            status={status}
          />
        )}
      </Td>
      <ActionsTd dataLabel={t`Actions`}>
        {/* Plain Approve and Deny, the words the buttons' own labels, the
            toolbar and the details page use: the action is on the approval,
            and the workflow only carries on because of it. */}
        <ActionItem visible tooltip={reasonUnavailable || t`Approve`}>
          <WorkflowApprovalButton
            workflowApproval={workflowApproval}
            onHandleToast={handleToast}
            isDisabled={isNotPermitted}
          />
        </ActionItem>
        <ActionItem visible tooltip={reasonUnavailable || t`Deny`}>
          <WorkflowDenyButton
            workflowApproval={workflowApproval}
            onHandleToast={handleToast}
            isDisabled={isNotPermitted}
          />
        </ActionItem>
        <ActionItem visible>
          <JobCancelButton
            title={t`Cancel Workflow Job`}
            showIconButton
            job={{
              ...workflowApproval.summary_fields.source_workflow_job,
              type: 'workflow_job',
            }}
            buttonText={t`Cancel Workflow Job`}
            isDisabled={
              hasBeenActedOn || workflowIsDeleted || cannotCancelWorkflow
            }
            tooltip={reasonCannotCancel || t`Cancel Workflow Job`}
            cancelationMessage={t`This will cancel all subsequent nodes in this workflow.`}
          />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

export default WorkflowApprovalListItem;
