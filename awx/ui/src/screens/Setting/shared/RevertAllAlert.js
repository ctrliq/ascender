import React from 'react';

import { t } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import AlertModal from 'components/AlertModal';

function RevertAllAlert({ onClose, onRevertAll }) {
  const { i18n } = useLingui();
  return (
    <AlertModal
      isOpen
      title={i18n._(t`Revert settings`)}
      variant="info"
      onClose={onClose}
      ouiaId="revert-all-modal"
      actions={[
        <Button
          ouiaId="revert-all-confirm-button"
          key="revert"
          variant="primary"
          aria-label={i18n._(t`Confirm revert all`)}
          onClick={onRevertAll}
        >
          {i18n._(t`Revert all`)}
        </Button>,
        <Button
          ouiaId="revert-all-cancel-button"
          key="cancel"
          variant="link"
          aria-label={i18n._(t`Cancel revert`)}
          onClick={onClose}
        >
          {i18n._(t`Cancel`)}
        </Button>,
      ]}
    >
      {i18n._(t`This will revert all configuration values on this page to
      their factory defaults. Are you sure you want to proceed?`)}
    </AlertModal>
  );
}

export default RevertAllAlert;
