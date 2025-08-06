import 'styled-components/macro';
import React, { useContext } from 'react';
import { Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import { t } from '@lingui/react/macro';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import AlertModal from 'components/AlertModal';
import { stringIsUUID } from 'util/strings';

function NodeDeleteModal() {
  const { i18n } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  const { nodeToDelete } = useContext(WorkflowStateContext);
  const identifier = nodeToDelete?.originalNodeObject?.identifier;
  const nodeIdentifier =
    identifier && !stringIsUUID(identifier)
      ? identifier
      : nodeToDelete?.identifier;
  const unifiedJobTemplate =
    nodeToDelete?.fullUnifiedJobTemplate ||
    nodeToDelete?.originalNodeObject?.summary_fields?.unified_job_template;
  const nodeName = nodeIdentifier || unifiedJobTemplate?.name;
  return (
    <AlertModal
      variant="danger"
      title={i18n._(t`Remove Node ${nodeName}`)}
      isOpen={nodeToDelete}
      onClose={() => dispatch({ type: 'SET_NODE_TO_DELETE', value: null })}
      actions={[
        <Button
          ouiaId="node-removal-confirm-button"
          id="confirm-node-removal"
          key="remove"
          variant="danger"
          aria-label={i18n._(t`Confirm node removal`)}
          onClick={() => dispatch({ type: 'DELETE_NODE' })}
        >
          {i18n._(t`Remove`)}
        </Button>,
        <Button
          ouiaId="node-removal-cancel-button"
          id="cancel-node-removal"
          key="cancel"
          variant="link"
          aria-label={i18n._(t`Cancel node removal`)}
          onClick={() => dispatch({ type: 'SET_NODE_TO_DELETE', value: null })}
        >
          {i18n._(t`Cancel`)}
        </Button>,
      ]}
    >
      {nodeToDelete && nodeToDelete.unifiedJobTemplate ? (
        <>
          <p>{i18n._(t`Are you sure you want to remove the node below:`)}</p>
          <br />
          <strong css="color: var(--pf-global--danger-color--100)">
            {nodeToDelete.unifiedJobTemplate.name}
          </strong>
        </>
      ) : (
        <p>{i18n._(t`Are you sure you want to remove this node?`)}</p>
      )}
    </AlertModal>
  );
}

export default NodeDeleteModal;
