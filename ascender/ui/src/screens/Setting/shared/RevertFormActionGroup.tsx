import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { ActionGroup, Button } from '@patternfly/react-core';

import './RevertFormActionGroup.css';
import { FormFullWidthLayout } from 'components/FormLayout';

export interface RevertFormActionGroupProps {
  children?: React.ReactNode;
  onCancel: () => void;
  onRevert: () => void;
  onSubmit: () => void;
  [key: string]: unknown;
}

const RevertFormActionGroup = ({
  children,
  onCancel,
  onRevert,
  onSubmit,
}: RevertFormActionGroupProps) => {
  const { t } = useLingui();
  return (
    <FormFullWidthLayout>
      <ActionGroup className="ascender-settings-actions">
        <Button
          aria-label={t`Save`}
          variant="primary"
          type="button"
          onClick={onSubmit}
          ouiaId="save-button"
        >
          {t`Save`}
        </Button>
        <Button
          aria-label={t`Revert All to Default`}
          variant="secondary"
          type="button"
          onClick={onRevert}
          ouiaId="revert-all-button"
        >
          {t`Revert All to Default`}
        </Button>
        {children}
        <Button
          aria-label={t`Cancel`}
          variant="link"
          type="button"
          onClick={onCancel}
          ouiaId="cancel-button"
        >
          {t`Cancel`}
        </Button>
      </ActionGroup>
    </FormFullWidthLayout>
  );
};

export default RevertFormActionGroup;
