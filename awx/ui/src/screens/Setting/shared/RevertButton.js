import React from 'react';
import PropTypes from 'prop-types';

import { msg } from '@lingui/macro';
import { useField } from 'formik';
import { Button, Tooltip } from '@patternfly/react-core';
import styled from 'styled-components';
import { useLingui } from '@lingui/react';

const ButtonWrapper = styled.div`
  margin-left: auto;
  &&& {
    --pf-c-button--FontSize: var(--pf-c-button--m-small--FontSize);
  }
`;

function RevertButton({
  id,
  defaultValue,
  isDisabled = false,
  onRevertCallback = () => null,
}) {
  const { i18n } = useLingui();
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
    ? i18n._(msg`Revert to factory default.`)
    : i18n._(msg`Restore initial value.`);
  const tooltipContent =
    isDisabled || isMatch
      ? i18n._(msg`Setting matches factory default.`)
      : revertTooltipContent;

  return (
    <Tooltip entryDelay={700} content={tooltipContent}>
      <ButtonWrapper>
        <Button
          aria-label={isRevertable ? i18n._(msg`Revert`) : i18n._(msg`Undo`)}
          ouiaId={`${id}-revert`}
          isInline
          isSmall
          onClick={handleConfirm}
          type="button"
          variant="link"
          isDisabled={isDisabled || isMatch}
        >
          {isRevertable ? i18n._(msg`Revert`) : i18n._(msg`Undo`)}
        </Button>
      </ButtonWrapper>
    </Tooltip>
  );
}

RevertButton.propTypes = {
  id: PropTypes.string.isRequired,
};

export default RevertButton;
