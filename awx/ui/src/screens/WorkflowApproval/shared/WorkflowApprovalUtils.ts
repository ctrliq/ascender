import type { WorkflowApproval } from 'types/api';
import { t } from '@lingui/core/macro';
import { formatDateString } from 'util/dates';

export function getTooltip(workflowApproval: WorkflowApproval) {
  if (workflowApproval.status === 'successful') {
    if (workflowApproval.summary_fields?.approved_or_denied_by?.username) {
      return t`Approved by ${
        workflowApproval.summary_fields.approved_or_denied_by.username as string
      } - ${formatDateString(workflowApproval.finished) as string}`;
    }
    return t`Approved - ${
      formatDateString(workflowApproval.finished) as string
    }.  See the Activity Stream for more information.`;
  }
  if (workflowApproval.status === 'failed' && workflowApproval.failed) {
    if (workflowApproval.summary_fields?.approved_or_denied_by?.username) {
      return t`Denied by ${
        workflowApproval.summary_fields.approved_or_denied_by.username as string
      } - ${formatDateString(workflowApproval.finished) as string}`;
    }
    return t`Denied - ${
      formatDateString(workflowApproval.finished) as string
    }.  See the Activity Stream for more information.`;
  }
  return '';
}

export function getStatus(workflowApproval: WorkflowApproval) {
  if (workflowApproval.timed_out) {
    return 'timedOut';
  }

  if (workflowApproval.canceled_on) {
    return 'canceled';
  }
  if (workflowApproval.status === 'failed' && workflowApproval.failed) {
    return 'denied';
  }
  if (workflowApproval.status === 'successful') {
    return 'approved';
  }
  return workflowApproval.status;
}

export function getPendingLabel(workflowApproval: WorkflowApproval) {
  if (!workflowApproval.approval_expiration) {
    return t`Never expires`;
  }

  return t`Expires on ${
    formatDateString(workflowApproval.approval_expiration) as string
  }`;
}

export function getDetailPendingLabel(workflowApproval: WorkflowApproval) {
  if (!workflowApproval.approval_expiration) {
    return t`Never`;
  }

  return `${formatDateString(workflowApproval.approval_expiration)}`;
}
