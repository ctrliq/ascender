import React from 'react';

import { useField } from 'formik';
import { Button, Tooltip } from '@patternfly/react-core';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';

const ButtonWrapper = styled.div`
  margin-left: auto;
  &&& {
    --pf-v6-c-button--FontSize: var(--pf-v6-c-button--m-small--FontSize);
  }
`;

function RevertButton({
  id,
  defaultValue,
  isDisabled = false,
  onRevertCallback = () => null,
}) {
  const { t } = useLingui();
  const [field, meta, helpers] = useField(id);
  const initialValue = meta.initialValue ?? '';
  const currentValue = field.value;
  let isRevertable = true;
  let isMatch = false;

  if (currentValue === defaultValue && currentValue !== initialValue) {
    isRevertable = false;
  }

  if (currentValue === defaultValue && currentValue === initialValue) {
    isMatch = true;
  }

  const handleConfirm = () => {
    helpers.setValue(isRevertable ? defaultValue : initialValue);
    onRevertCallback();
  };

  const revertTooltipContent = isRevertable
    ? t`Revert to factory default.`
    : t`Restore initial value.`;
  const tooltipContent =
    isDisabled || isMatch
      ? t`Setting matches factory default.`
      : revertTooltipContent;

  return (
    <Tooltip entryDelay={700} content={tooltipContent}>
      <ButtonWrapper>
        <Button
          aria-label={isRevertable ? t`Revert` : t`Undo`}
          ouiaId={`${id}-revert`}
          isInline
          size="sm"
          onClick={handleConfirm}
          type="button"
          variant="link"
          isDisabled={isDisabled || isMatch}
        >
          {isRevertable ? t`Revert` : t`Undo`}
        </Button>
      </ButtonWrapper>
    </Tooltip>
  );
}

export default RevertButton;
