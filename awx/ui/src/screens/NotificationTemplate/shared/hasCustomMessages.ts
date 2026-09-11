import type { Untyped } from 'types/api';

export default function hasCustomMessages(
  messages: Untyped,
  defaults: Untyped
) {
  if (!messages) {
    return false;
  }

  return (
    isCustomized(messages.started, defaults.started) ||
    isCustomized(messages.success, defaults.success) ||
    isCustomized(messages.error, defaults.error) ||
    isCustomized(messages.changed, defaults.changed) ||
    isCustomized(
      messages.workflow_approval?.approved,
      defaults.workflow_approval.approved
    ) ||
    isCustomized(
      messages.workflow_approval?.denied,
      defaults.workflow_approval.denied
    ) ||
    isCustomized(
      messages.workflow_approval?.running,
      defaults.workflow_approval.running
    ) ||
    isCustomized(
      messages.workflow_approval?.timed_out,
      defaults.workflow_approval.timed_out
    )
  );
}

function isCustomized(message: Untyped, defaultMessage: Untyped) {
  if (!message) {
    return false;
  }
  if (message?.message !== defaultMessage?.message) {
    return true;
  }
  if (message?.body !== defaultMessage?.body) {
    return true;
  }
  return false;
}
