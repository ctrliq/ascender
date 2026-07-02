import React from 'react';
import { Button } from '@patternfly/react-core';

function NodeNextButton({ activeStep, buttonText, onNext, isDisabled }) {
  return (
    <Button
      ouiaId="node-modal-next-button"
      id="next-node-modal"
      variant="primary"
      type="submit"
      onClick={() => onNext()}
      isDisabled={isDisabled || !activeStep.enableNext}
    >
      {buttonText}
    </Button>
  );
}

export default NodeNextButton;
