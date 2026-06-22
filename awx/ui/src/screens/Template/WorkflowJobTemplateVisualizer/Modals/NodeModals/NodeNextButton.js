import React, { useEffect } from 'react';
import { Button } from '@patternfly/react-core';

function NodeNextButton({
  activeStep,
  buttonText,
  onClick,
  onNext,
  triggerNext,
  isDisabled,
}) {
  useEffect(() => {
    if (!triggerNext) {
      return;
    }
    onNext();
  }, [onNext, triggerNext]);

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
