import type { Untyped } from 'types/api';
import React, { useEffect } from 'react';
import { Button } from '@patternfly/react-core';

export interface NodeNextButtonProps {
  activeStep: Untyped;
  buttonText: Untyped;
  onClick: (...args: Untyped[]) => void;
  onNext: (...args: Untyped[]) => void;
  triggerNext: Untyped;
  isDisabled: boolean;
  [key: string]: unknown;
}

function NodeNextButton({
  activeStep,
  buttonText,
  onClick,
  onNext,
  triggerNext,
  isDisabled,
}: NodeNextButtonProps) {
  useEffect(() => {
    if (!triggerNext) {
      return;
    }
    onNext();
    // `onNext` (the wizard's goToNextStep) gets a new identity on every render,
    // so it must not be a dependency here — otherwise the effect re-fires on the
    // next render and advances an extra step, triggering an unintended save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerNext]);

  return (
    <Button
      ouiaId="node-modal-next-button"
      id="next-node-modal"
      variant="primary"
      type="submit"
      onClick={() => onClick(activeStep)}
      isDisabled={isDisabled || !activeStep.enableNext}
    >
      {buttonText}
    </Button>
  );
}

export default NodeNextButton;
