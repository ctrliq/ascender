import { t } from '@lingui/react/macro';

import { formatDateString } from 'util/dates';

export function getTooltip(workflowApproval, i18n) {
  if (workflowApproval.status === 'successful') {
    if (workflowApproval.summary_fields?.approved_or_denied_by?.username) {
      return i18n._(
        t`Approved by ${
          workflowApproval.summary_fields.approved_or_denied_by.username
        } - ${formatDateString(workflowApproval.finished)}`
      );
    }
    return i18n._(
      t`Approved - ${formatDateString(
        workflowApproval.finished
      )}.  See the Activity Stream for more information.`
    );
  }
  if (workflowApproval.status === 'failed' && workflowApproval.failed) {
    if (workflowApproval.summary_fields?.approved_or_denied_by?.username) {
      return i18n._(
        t`Denied by ${
          workflowApproval.summary_fields.approved_or_denied_by.username
        } - ${formatDateString(workflowApproval.finished)}`
      );
    }
    return i18n._(
      t`Denied - ${formatDateString(
        workflowApproval.finished
      )}.  See the Activity Stream for more information.`
    );
  }
  return '';
}

export function getStatus(workflowApproval, i18n) {
  if (workflowApproval.timed_out) {
    return i18n._(t`timedOut`);
  }

  if (workflowApproval.canceled_on) {
    return i18n._(t`canceled`);
  }
  if (workflowApproval.status === 'failed' && workflowApproval.failed) {
    return i18n._(t`denied`);
  }
  if (workflowApproval.status === 'successful') {
    return i18n._(t`approved`);
  }
  return workflowApproval.status;
}

export function getPendingLabel(workflowApproval, i18n) {
  if (!workflowApproval.approval_expiration) {
    return i18n._(t`Never expires`);
  }

  return i18n._(
    t`Expires on ${formatDateString(workflowApproval.approval_expiration)}`
  );
}

export function getDetailPendingLabel(workflowApproval, i18n) {
  if (!workflowApproval.approval_expiration) {
    return i18n._(t`Never`);
  }

  return `${formatDateString(workflowApproval.approval_expiration)}`;
}
