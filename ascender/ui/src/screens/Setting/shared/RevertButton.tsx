import React from 'react';

import { useField } from 'components/Form';
import { Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import './RevertButton.css';
import Tooltip from 'components/Tooltip';

export interface RevertButtonProps {
  id: string;
  /** What the field is put back to, which is the setting's own default. */
  defaultValue: unknown;
  isDisabled?: boolean;
  onRevertCallback?: () => void;
  [key: string]: unknown;
}

function RevertButton({
  id,
  defaultValue,
  isDisabled = false,
  onRevertCallback = () => null,
}: RevertButtonProps) {
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
  // A disabled button says why it is disabled. Matching the default is one
  // reason; a field the form has locked or switched off is another, and there
  // the setting may well differ from its default.
  let tooltipContent = revertTooltipContent;
  if (isMatch) {
    tooltipContent = t`Setting matches factory default.`;
  } else if (isDisabled) {
    tooltipContent = t`Revert is unavailable while the field is disabled.`;
  }

  return (
    <Tooltip entryDelay={700} content={tooltipContent}>
      <div className="ascender-revert-button__wrapper">
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
      </div>
    </Tooltip>
  );
}

export default RevertButton;
