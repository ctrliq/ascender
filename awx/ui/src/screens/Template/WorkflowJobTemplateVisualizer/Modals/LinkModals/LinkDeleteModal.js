import React, { useContext } from 'react';
import { Button } from '@patternfly/react-core';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import AlertModal from 'components/AlertModal';

function LinkDeleteModal() {
  const { i18n } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  const { linkToDelete } = useContext(WorkflowStateContext);
  return (
    <AlertModal
      variant="danger"
      title={i18n._(msg`Remove Link`)}
      isOpen={linkToDelete}
      onClose={() => dispatch({ type: 'SET_LINK_TO_DELETE', value: null })}
      actions={[
        <Button
          ouiaId="link-remove-confirm-button"
          id="confirm-link-removal"
          aria-label={i18n._(msg`Confirm link removal`)}
          key="remove"
          onClick={() => dispatch({ type: 'DELETE_LINK' })}
          variant="danger"
        >
          {i18n._(msg`Remove`)}
        </Button>,
        <Button
          ouiaId="link-remove-cancel-button"
          id="cancel-link-removal"
          aria-label={i18n._(msg`Cancel link removal`)}
          key="cancel"
          onClick={() => dispatch({ type: 'SET_LINK_TO_DELETE', value: null })}
          variant="link"
        >
          {i18n._(msg`Cancel`)}
        </Button>,
      ]}
    >
      <p>{i18n._(msg`Are you sure you want to remove this link?`)}</p>
      {!linkToDelete.isConvergenceLink && (
        <>
          <br />
          <p>
            {i18n._(
              msg`Removing this link will orphan the rest of the branch and cause it to be executed immediately on launch.`
            )}
          </p>
        </>
      )}
    </AlertModal>
  );
}

export default LinkDeleteModal;
