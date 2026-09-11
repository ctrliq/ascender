import type { Untyped } from 'types/api';
import React, { useCallback } from 'react';
import {
  Wizard as PFWizard,
  WizardStep,
  WizardHeader,
} from '@patternfly/react-core';
import type { WizardProps } from '@patternfly/react-core';
import { Modal, ModalVariant } from '@patternfly/react-core/deprecated';
import styled from 'styled-components';

/**
 * Compatibility wrapper that accepts the legacy PF4/deprecated Wizard API
 * (steps array, onNext, onBack, onGoToStep, onSave, onClose, isOpen, etc.)
 * and renders using the new PF5 composable Wizard API internally.
 *
 * Legacy step shape: { id, name, component, enableNext, canJumpTo, nextButtonText }
 *
 * - `canJumpTo` controls whether the nav sidebar item is clickable.
 *   Mapped to `navItem={{ isDisabled: true }}` (not `isDisabled` on WizardStep,
 *   which would also prevent Next/Back from reaching the step).
 * - `enableNext` controls whether the Next button is disabled on that step.
 *   Mapped to `footer={{ isNextDisabled: true }}`.
 * - `nextButtonText` overrides the Next button label for that step.
 *   Mapped to `footer={{ nextButtonText }}`.
 */
/**
 * One step in the legacy step array this wrapper accepts. The mapping onto
 * PatternFly's composable wizard is described above.
 */
export interface LegacyWizardStep {
  id?: number | string;
  name: React.ReactNode;
  component?: React.ReactNode;
  /** False disables the Next button while this step is showing. */
  enableNext?: boolean;
  /** False makes the sidebar entry unclickable, Next and Back still work. */
  canJumpTo?: boolean;
  nextButtonText?: React.ReactNode;
}

/** The per-step and wizard-level footer overrides PatternFly accepts. */
interface WizardFooterOverrides {
  backButtonText?: React.ReactNode;
  cancelButtonText?: React.ReactNode;
  nextButtonText?: React.ReactNode;
  isNextDisabled?: boolean;
}

export interface WizardWrapperProps {
  steps?: LegacyWizardStep[];
  onSave?: (...args: Untyped[]) => void;
  onClose?: (...args: Untyped[]) => void;
  onNext?: (...args: Untyped[]) => void;
  onBack?: (...args: Untyped[]) => void;
  onGoToStep?: (...args: Untyped[]) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  isOpen?: boolean;
  footer?: React.ReactNode | WizardFooterOverrides;
  backButtonText?: React.ReactNode;
  cancelButtonText?: React.ReactNode;
  nextButtonText: React.ReactNode;
  height?: number | string;
  style?: React.CSSProperties;
  className?: string;
  [key: string]: unknown;
}

function WizardWrapper({
  steps = [],
  onSave,
  onClose,
  onNext,
  onBack,
  onGoToStep,
  title,
  description,
  isOpen,
  footer,
  backButtonText,
  cancelButtonText,
  nextButtonText,
  height,
  style,
  className,
  ...rest
}: WizardWrapperProps) {
  const handleStepChange = useCallback(
    (
      _event: unknown,
      currentStep: Untyped,
      prevStep: Untyped,
      scope: unknown
    ) => {
      const legacyCurrent = {
        id: currentStep.id,
        name: currentStep.name,
      };
      const legacyPrev = {
        id: prevStep.id,
        name: prevStep.name,
        prevId: prevStep.id,
      };

      if (scope === 'next' && onNext) {
        onNext(legacyCurrent, legacyPrev);
      } else if (scope === 'back' && onBack) {
        onBack(legacyCurrent, legacyPrev);
      } else if (scope === 'nav' && onGoToStep) {
        onGoToStep(legacyCurrent, legacyPrev);
      }
    },
    [onNext, onBack, onGoToStep]
  );

  // Build the wizard-level footer prop.
  // If a custom footer React element is provided, use it directly.
  // Otherwise, build a partial WizardFooterProps object for button text.
  let wizardFooter;
  if (footer) {
    wizardFooter = footer;
  } else {
    const footerProps: WizardFooterOverrides = {};
    if (backButtonText) footerProps.backButtonText = backButtonText;
    if (cancelButtonText) footerProps.cancelButtonText = cancelButtonText;
    if (nextButtonText) footerProps.nextButtonText = nextButtonText;
    if (Object.keys(footerProps).length > 0) {
      wizardFooter = footerProps;
    }
  }

  const wizardContent = (
    <PFWizard
      header={
        title ? (
          <WizardHeader
            title={title}
            description={description}
            onClose={onClose}
            closeButtonAriaLabel="Close"
          />
        ) : undefined
      }
      footer={wizardFooter as WizardProps['footer']}
      onStepChange={handleStepChange}
      onSave={onSave}
      onClose={onClose}
      height={height}
      className={className}
      style={style}
      {...rest}
    >
      {steps.map((step) => {
        // Build per-step footer overrides from legacy enableNext / nextButtonText.
        // Only apply when NO custom footer element is provided, because PF5's
        // WizardContext resolves per-step footer overrides before the wizard-level
        // footer. A per-step partial (e.g. {nextButtonText}) would replace the
        // custom footer element with PF5's default footer on that step.
        let stepFooter: WizardFooterOverrides | undefined;
        const hasCustomFooter = React.isValidElement(footer);
        const hasNextOverride = step.nextButtonText !== undefined;
        const hasEnableOverride = step.enableNext === false;
        if (!hasCustomFooter && (hasNextOverride || hasEnableOverride)) {
          stepFooter = {};
          if (hasNextOverride) stepFooter.nextButtonText = step.nextButtonText;
          if (hasEnableOverride) stepFooter.isNextDisabled = true;
        }

        // canJumpTo controls the nav sidebar item only (not Next/Back).
        // Use navItem.isDisabled so the step is still reachable via Next/Back.
        const navItemOverride =
          step.canJumpTo === false ? { isDisabled: true } : undefined;

        return (
          <WizardStep
            key={step.id != null ? step.id : String(step.name)}
            id={step.id != null ? step.id : String(step.name)}
            name={step.name}
            footer={stepFooter}
            navItem={navItemOverride}
          >
            {step.component}
          </WizardStep>
        );
      })}
    </PFWizard>
  );

  if (isOpen !== undefined) {
    return (
      <Modal
        isOpen={isOpen}
        variant={ModalVariant.large}
        showClose={false}
        hasNoBodyWrapper
        onClose={onClose}
        aria-label={title || 'Wizard'}
      >
        {wizardContent}
      </Modal>
    );
  }

  return wizardContent;
}

WizardWrapper.displayName = 'PFWizard';

export default styled(WizardWrapper)`
  .pf-v6-c-toolbar__content {
    padding: 0 !important;
  }
`;
