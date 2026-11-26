import type { WorkflowApproval } from 'types/api';
import React, { useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { OutlinedThumbsDownIcon } from '@patternfly/react-icons';
import { WorkflowApprovalsAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';

import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { isWorkflowDeleted } from './WorkflowApprovalUtils';

export interface WorkflowDenyButtonProps {
  isDetailView?: boolean;
  workflowApproval: WorkflowApproval;
  /** Raises the toast the screen shows once the vote has landed. */
  onHandleToast: (id: number, title: string) => void;
  /**
   * Holds the button back for a reason the approval itself does not show,
   * such as the viewer not being allowed to vote on it.
   */
  isDisabled?: boolean;
}

function WorkflowDenyButton({
  isDetailView,
  workflowApproval,
  onHandleToast,
  isDisabled = false,
}: WorkflowDenyButtonProps) {
  const { t } = useLingui();
  const hasBeenActedOn =
    Object.keys(workflowApproval.summary_fields.approved_or_denied_by || {})
      .length > 0 ||
    workflowApproval.status === 'canceled' ||
    workflowApproval.user_has_voted === true;
  const workflowIsDeleted = isWorkflowDeleted(workflowApproval);

  const { id } = workflowApproval;
  const { error: denyApprovalError, request: denyWorkflowApprovals } =
    useRequest(useCallback(async () => WorkflowApprovalsAPI.deny(id), [id]));

  const handleDeny = async () => {
    await denyWorkflowApprovals();
    onHandleToast(workflowApproval.id, t`Successfully Denied`);
  };

  const { error: denyError, dismissError: dismissDenyError } =
    useDismissableError(denyApprovalError);

  return (
    <>
      <Button
        aria-label={
          hasBeenActedOn
            ? t`This workflow has already been acted on`
            : (workflowIsDeleted && t`This workflow has been deleted`) ||
              t`Deny`
        }
        ouiaId="workflow-deny-button"
        isDisabled={hasBeenActedOn || workflowIsDeleted || isDisabled}
        variant={isDetailView ? 'secondary' : 'plain'}
        onClick={() => handleDeny()}
      >
        {isDetailView ? t`Deny` : <OutlinedThumbsDownIcon />}
      </Button>
      {denyError && (
        <AlertModal
          isOpen={denyError}
          variant="error"
          title={t`Error!`}
          onClose={dismissDenyError}
        >
          {t`Failed to deny ${workflowApproval.name}.`}
          <ErrorDetail error={denyError} />
        </AlertModal>
      )}
    </>
  );
}
export default WorkflowDenyButton;
