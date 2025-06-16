import React, { useContext } from 'react';
import { Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import { msg } from '@lingui/macro';
import { WorkflowDispatchContext } from 'contexts/Workflow';
import AlertModal from 'components/AlertModal';

function DeleteAllNodesModal() {
  const { i18n } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  return (
    <AlertModal
      actions={[
        <Button
          ouiaId="delete-all-confirm-button"
          id="confirm-delete-all-nodes"
          key="remove"
          variant="danger"
          aria-label={i18n._(msg`Confirm removal of all nodes`)}
          onClick={() => dispatch({ type: 'DELETE_ALL_NODES' })}
        >
          {i18n._(msg`Remove`)}
        </Button>,
        <Button
          ouiaId="delete-all-cancel-button"
          id="cancel-delete-all-nodes"
          key="cancel"
          variant="link"
          aria-label={i18n._(msg`Cancel node removal`)}
          onClick={() => dispatch({ type: 'TOGGLE_DELETE_ALL_NODES_MODAL' })}
        >
          {i18n._(msg`Cancel`)}
        </Button>,
      ]}
      isOpen
      onClose={() => dispatch({ type: 'TOGGLE_DELETE_ALL_NODES_MODAL' })}
      title={i18n._(msg`Remove All Nodes`)}
      variant="danger"
    >
      <p>
        {i18n._(msg`Are you sure you want to remove all the nodes in this workflow?`)}
      </p>
    </AlertModal>
  );
}

export default DeleteAllNodesModal;
