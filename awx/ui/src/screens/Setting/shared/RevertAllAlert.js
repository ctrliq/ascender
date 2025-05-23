import React from 'react';

import { msg } from '@lingui/macro';
import { Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import AlertModal from 'components/AlertModal';

function RevertAllAlert({ onClose, onRevertAll }) {
  const { i18n } = useLingui();
  return (
    <AlertModal
      isOpen
      title={i18n._(msg`Revert settings`)}
      variant="info"
      onClose={onClose}
      ouiaId="revert-all-modal"
      actions={[
        <Button
          ouiaId="revert-all-confirm-button"
          key="revert"
          variant="primary"
          aria-label={i18n._(msg`Confirm revert all`)}
          onClick={onRevertAll}
        >
          {i18n._(msg`Revert all`)}
        </Button>,
        <Button
          ouiaId="revert-all-cancel-button"
          key="cancel"
          variant="link"
          aria-label={i18n._(msg`Cancel revert`)}
          onClick={onClose}
        >
          {i18n._(msg`Cancel`)}
        </Button>,
      ]}
    >
      {i18n._(msg`This will revert all configuration values on this page to
      their factory defaults. Are you sure you want to proceed?`)}
    </AlertModal>
  );
}

export default RevertAllAlert;
