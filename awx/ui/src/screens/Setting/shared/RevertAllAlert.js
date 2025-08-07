import React from 'react';

import { Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import AlertModal from 'components/AlertModal';

function RevertAllAlert({ onClose, onRevertAll }) {
  const { t } = useLingui();
  return (
    <AlertModal
      isOpen
      title={t`Revert settings`}
      variant="info"
      onClose={onClose}
      ouiaId="revert-all-modal"
      actions={[
        <Button
          ouiaId="revert-all-confirm-button"
          key="revert"
          variant="primary"
          aria-label={t`Confirm revert all`}
          onClick={onRevertAll}
        >
          {t`Revert all`}
        </Button>,
        <Button
          ouiaId="revert-all-cancel-button"
          key="cancel"
          variant="link"
          aria-label={t`Cancel revert`}
          onClick={onClose}
        >
          {t`Cancel`}
        </Button>,
      ]}
    >
      {t`This will revert all configuration values on this page to
      their factory defaults. Are you sure you want to proceed?`}
    </AlertModal>
  );
}

export default RevertAllAlert;
