import { msg } from '@lingui/macro';

import { formatDateString } from 'util/dates';

export function getTooltip(workflowApproval, i18n) {
  if (workflowApproval.status === 'successful') {
    if (workflowApproval.summary_fields?.approved_or_denied_by?.username) {
      return i18n._(msg`Approved by ${workflowApproval.summary_fields.approved_or_denied_by.username} - ${formatDateString(workflowApproval.finished)}`);
    }
    return i18n._(msg`Approved - ${formatDateString(workflowApproval.finished)}.  See the Activity Stream for more information.`);
  }
  if (workflowApproval.status === 'failed' && workflowApproval.failed) {
    if (workflowApproval.summary_fields?.approved_or_denied_by?.username) {
      return i18n._(msg`Denied by ${workflowApproval.summary_fields.approved_or_denied_by.username} - ${formatDateString(workflowApproval.finished)}`);
    }
    return i18n._(msg`Denied - ${formatDateString(workflowApproval.finished)}.  See the Activity Stream for more information.`);
  }
  return '';
}

export function getStatus(workflowApproval) {
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

export function getPendingLabel(workflowApproval, i18n) {
  if (!workflowApproval.approval_expiration) {
    return i18n._(msg`Never expires`);
  }

  return i18n._(msg`Expires on ${formatDateString(workflowApproval.approval_expiration)}`);
}

export function getDetailPendingLabel(workflowApproval, i18n) {
  if (!workflowApproval.approval_expiration) {
    return i18n._(msg`Never`);
  }

  return `${formatDateString(workflowApproval.approval_expiration)}`;
}
