import React, { useContext } from 'react';
import { Button, Modal } from '@patternfly/react-core';

import { msg, Trans } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { func } from 'prop-types';
import { WorkflowDispatchContext } from 'contexts/Workflow';

function UnsavedChangesModal({ onSaveAndExit, onExit }) {
  const dispatch = useContext(WorkflowDispatchContext);
  const { i18n } = useLingui();
  return (
    <Modal
      width={600}
      isOpen
      title={i18n._(msg`Warning: Unsaved Changes`)}
      aria-label={i18n._(msg`Unsaved changes modal`)}
      onClose={() => dispatch({ type: 'TOGGLE_UNSAVED_CHANGES_MODAL' })}
      actions={[
        <Button
          ouiaId="unsaved-changes-exit-button"
          id="confirm-exit-without-saving"
          key="exit"
          variant="danger"
          aria-label={i18n._(msg`Exit Without Saving`)}
          onClick={onExit}
        >
          {i18n._(msg`Exit Without Saving`)}
        </Button>,
        <Button
          ouiaId="unsaved-changes-save-exit-button"
          id="confirm-save-and-exit"
          key="save"
          variant="primary"
          aria-label={i18n._(msg`Save & Exit`)}
          onClick={onSaveAndExit}
        >
          {i18n._(msg`Save & Exit`)}
        </Button>,
      ]}
    >
      <p>
        <Trans>
          Are you sure you want to exit the Workflow Creator without saving your
          changes?
        </Trans>
      </p>
    </Modal>
  );
}

UnsavedChangesModal.propTypes = {
  onExit: func.isRequired,
  onSaveAndExit: func.isRequired,
};

export default UnsavedChangesModal;
