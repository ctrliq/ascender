import type { OptionsChoice } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';

import { useFormContext, withForm } from 'components/Form';
import toHostPattern from 'util/hostPattern';
import Wizard from '../Wizard';
import type { LegacyWizardStep } from '../Wizard/Wizard';
import useAdHocLaunchSteps from './useAdHocLaunchSteps';
import type { AdHocItem, AdHocValues } from './types';

export interface AdHocCommandsWizardProps {
  onLaunch: (values: AdHocValues) => void;
  /** The modules the api offers, as value and label pairs. */
  moduleOptions: OptionsChoice[];
  onCloseWizard: () => void;
  credentialTypeId: number | string | null;
  organizationId: number | string | null;
  /**
   * The hosts or groups the command will run against. Read by the formik
   * wrapper below rather than by the component itself.
   */
  // eslint-disable-next-line react/no-unused-prop-types
  adHocItems: AdHocItem[];
  /**
   * A step to put before the form's own, where the command was started
   * somewhere that does not yet say what it runs on.
   */
  firstStep?: LegacyWizardStep;
  /** What that step answered, which the preview opens with. */
  runOn?: React.ReactNode;
  [key: string]: unknown;
}

function AdHocCommandsWizard({
  onLaunch,
  moduleOptions,
  onCloseWizard,
  credentialTypeId,
  organizationId,
  firstStep,
  runOn,
}: AdHocCommandsWizardProps) {
  const { t } = useLingui();
  const { setFieldTouched, values } = useFormContext<AdHocValues>();

  /*
   * What the header says the command is aimed at, read from the field itself
   * so an edit to it shows. A blank field is every host, which is the word
   * the field opens on. Named rather than inline so it reads as one string
   * with the run template wizard's, which says the same thing.
   */
  const shownLimit = values.limit || 'all';

  const { steps, validateStep, visitStep, visitAllSteps } = useAdHocLaunchSteps(
    moduleOptions,
    organizationId,
    credentialTypeId
  );

  /* The preview opens with what the run is aimed at, where a step asked. */
  const withRunOn = runOn
    ? steps.map((step) =>
        step.id === 'preview'
          ? {
              ...step,
              component: (
                <>
                  {runOn}
                  {step.component}
                </>
              ),
            }
          : step
      )
    : steps;
  const shownSteps = firstStep ? [firstStep, ...withRunOn] : withRunOn;

  return (
    <Wizard
      isOpen
      onNext={(nextStep, prevStep) => {
        if (nextStep.id === 'preview') {
          visitAllSteps(setFieldTouched);
        } else {
          visitStep(prevStep.prevId as string, setFieldTouched);
          validateStep(nextStep.id as string);
        }
      }}
      onClose={() => onCloseWizard()}
      onSave={() => {
        onLaunch(values);
      }}
      onGoToStep={(nextStep, prevStep) => {
        if (nextStep.id === 'preview') {
          visitAllSteps(setFieldTouched);
        } else {
          visitStep(prevStep.prevId as string, setFieldTouched);
          validateStep(nextStep.id as string);
        }
      }}
      steps={shownSteps}
      title={t`Run Command`}
      /* What the run is aimed at, wherever the wizard was opened from: the
         template wizards beside this one say the same thing in the same
         place. */
      description={t`Limit: ${shownLimit}`}
      backButtonText={t`Back`}
      cancelButtonText={t`Cancel`}
      nextButtonText={t`Next`}
    />
  );
}

// The generics are what keeps the wrapper's own props visible to callers:
// without them withFormik types the wrapped component as taking nothing.
const FormikApp = withForm<AdHocCommandsWizardProps, AdHocValues>({
  mapPropsToValues({ adHocItems }) {
    // The same pattern the run template wizard beside this puts in the same
    // field: commas between the names, which is what keeps an IPv6 address
    // or a name holding a colon whole.
    const adHocItemStrings = toHostPattern(
      adHocItems.map((item: AdHocItem) => item.name)
    );
    return {
      limit: adHocItemStrings || 'all',
      credentials: [],
      module_args: '',
      verbosity: 0,
      forks: 0,
      diff_mode: false,
      become_enabled: '',
      module_name: '',
      extra_vars: '---',
      job_type: 'run',
      credential_passwords: {},
      execution_environment: [],
    };
  },
  // The wizard launches from its own onSave rather than through formik, and
  // no step renders a submitting form, so this is never reached. formik's
  // types require it all the same.
  handleSubmit: () => {},
})(AdHocCommandsWizard);

export default FormikApp;
