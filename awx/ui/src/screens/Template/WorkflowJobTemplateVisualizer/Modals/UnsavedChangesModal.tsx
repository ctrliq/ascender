import type { WorkflowAction } from 'components/Workflow/workflowReducer';
import type { Untyped } from 'types/api';
import React, { useContext } from 'react';
import { Button } from '@patternfly/react-core';
import { Modal } from '@patternfly/react-core/deprecated';

import { Trans, useLingui } from '@lingui/react/macro';
import { WorkflowDispatchContext } from 'contexts/Workflow';

export interface UnsavedChangesModalProps {
  onSaveAndExit: (...args: Untyped[]) => void;
  onExit: (...args: Untyped[]) => void;
  [key: string]: unknown;
}

function UnsavedChangesModal({
  onSaveAndExit,
  onExit,
}: UnsavedChangesModalProps) {
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
  const { t } = useLingui();
  return (
    <Modal
      width={600}
      isOpen
      title={t`Warning: Unsaved Changes`}
      aria-label={t`Unsaved changes modal`}
      onClose={() => dispatch({ type: 'TOGGLE_UNSAVED_CHANGES_MODAL' })}
      actions={[
        <Button
          ouiaId="unsaved-changes-exit-button"
          id="confirm-exit-without-saving"
          key="exit"
          variant="danger"
          aria-label={t`Exit Without Saving`}
          onClick={onExit}
        >
          {t`Exit Without Saving`}
        </Button>,
        <Button
          ouiaId="unsaved-changes-save-exit-button"
          id="confirm-save-and-exit"
          key="save"
          variant="primary"
          aria-label={t`Save & Exit`}
          onClick={onSaveAndExit}
        >
          {t`Save & Exit`}
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

export default UnsavedChangesModal;
