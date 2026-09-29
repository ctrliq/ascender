import type { WorkflowAction } from 'components/Workflow/workflowReducer';
import React, { useContext } from 'react';
import { Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import { WorkflowDispatchContext } from 'contexts/Workflow';
import AlertModal from 'components/AlertModal';

function DeleteAllNodesModal() {
  const { t } = useLingui();
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
  return (
    <AlertModal
      actions={[
        <Button
          ouiaId="delete-all-confirm-button"
          id="confirm-delete-all-nodes"
          key="delete"
          variant="danger"
          aria-label={t`Confirm Delete All Nodes`}
          onClick={() => dispatch({ type: 'DELETE_ALL_NODES' })}
        >
          {t`Delete`}
        </Button>,
        <Button
          ouiaId="delete-all-cancel-button"
          id="cancel-delete-all-nodes"
          key="cancel"
          variant="link"
          aria-label={t`Cancel Delete All Nodes`}
          onClick={() => dispatch({ type: 'TOGGLE_DELETE_ALL_NODES_MODAL' })}
        >
          {t`Cancel`}
        </Button>,
      ]}
      isOpen
      onClose={() => dispatch({ type: 'TOGGLE_DELETE_ALL_NODES_MODAL' })}
      title={t`Delete All Nodes`}
      variant="danger"
    >
      <p>
        {t`Are you sure you want to delete all the nodes in this workflow?`}
      </p>
    </AlertModal>
  );
}

export default DeleteAllNodesModal;
