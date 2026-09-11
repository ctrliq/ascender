import type { Untyped } from 'types/api';
import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { ActionGroup, Button } from '@patternfly/react-core';
import { FormFullWidthLayout } from '../FormLayout';

export interface FormActionGroupProps {
  onCancel: (value?: Untyped) => void;
  onSubmit: (values: Untyped) => void;
  submitDisabled?: boolean;
  [key: string]: unknown;
}

const FormActionGroup = ({
  onCancel,
  onSubmit,
  submitDisabled = false,
}: FormActionGroupProps) => {
  const { t } = useLingui();
  return (
    <FormFullWidthLayout>
      <ActionGroup>
        <Button
          ouiaId="form-save-button"
          aria-label={t`Save`}
          variant="primary"
          type="button"
          onClick={onSubmit}
          isDisabled={submitDisabled}
        >
          {t`Save`}
        </Button>
        <Button
          ouiaId="form-cancel-button"
          aria-label={t`Cancel`}
          variant="link"
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
        >
          {t`Cancel`}
        </Button>
      </ActionGroup>
    </FormFullWidthLayout>
  );
};

export default FormActionGroup;
