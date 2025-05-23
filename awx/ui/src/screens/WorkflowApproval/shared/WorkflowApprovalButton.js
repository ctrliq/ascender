import React, { useCallback } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Button } from '@patternfly/react-core';
import { OutlinedThumbsUpIcon } from '@patternfly/react-icons';
import { WorkflowApprovalsAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';

import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';

function WorkflowApprovalButton({
  isDetailView,
  workflowApproval,
  onHandleToast,
}) {
  const { i18n } = useLingui();
  const { id } = workflowApproval;
  const hasBeenActedOn =
    Object.keys(workflowApproval.summary_fields.approved_or_denied_by || {})
      .length > 0 || workflowApproval.status === 'canceled';
  const { error: approveApprovalError, request: approveWorkflowApprovals } =
    useRequest(
      useCallback(async () => WorkflowApprovalsAPI.approve(id), [id]),
      {}
    );

  const handleApprove = async () => {
    await approveWorkflowApprovals();
    onHandleToast(workflowApproval.id, i18n._(msg`Successfully Approved`));
  };

  const { error: approveError, dismissError: dismissApproveError } =
    useDismissableError(approveApprovalError);

  return (
    <>
      <Button
        isDisabled={hasBeenActedOn}
        variant={isDetailView ? 'primary' : 'plain'}
        ouiaId="workflow-approve-button"
        onClick={() => handleApprove()}
        aria-label={
          hasBeenActedOn
            ? i18n._(msg`This workflow has already been acted on`)
            : i18n._(msg`Approve`)
        }
      >
        {isDetailView ? i18n._(msg`Approve`) : <OutlinedThumbsUpIcon />}
      </Button>
      {approveError && (
        <AlertModal
          isOpen={approveError}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissApproveError}
        >
          {i18n._(msg`Failed to approve ${workflowApproval.name}.`)}
          <ErrorDetail error={approveError} />
        </AlertModal>
      )}
    </>
  );
}
export default WorkflowApprovalButton;
