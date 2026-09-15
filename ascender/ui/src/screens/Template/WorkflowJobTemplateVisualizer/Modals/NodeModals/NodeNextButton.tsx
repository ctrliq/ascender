import React, { useEffect } from 'react';
import { Button } from '@patternfly/react-core';

/**
 * The step the button acts on: the one PatternFly says is active, carrying the
 * enableNext flag the modal looks up for it, since the step PatternFly hands
 * over does not have one of its own.
 */
export interface NodeWizardStep {
  id?: string | number;
  name?: React.ReactNode;
  enableNext?: boolean;
}

export interface NodeNextButtonProps {
  activeStep: NodeWizardStep;
  buttonText: React.ReactNode;
  onClick: (step: NodeWizardStep) => void;
  /** The wizard's own goToNextStep, which the effect below calls. */
  onNext: () => void;
  /** Counts up each time the modal wants the wizard moved on. */
  triggerNext: number;
  isDisabled?: boolean;
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
