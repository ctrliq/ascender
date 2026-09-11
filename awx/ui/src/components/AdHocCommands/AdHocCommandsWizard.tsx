import type { Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';

import { withFormik, useFormikContext } from 'formik';
import Wizard from '../Wizard';
import useAdHocLaunchSteps from './useAdHocLaunchSteps';
import type { AdHocItem, AdHocValues } from './types';

export interface AdHocCommandsWizardProps {
  onLaunch: (values: AdHocValues) => void;
  /** The ansible modules the command may run, from the API's options. */
  moduleOptions: Untyped;
  onCloseWizard: () => void;
  credentialTypeId: number | string | null;
  organizationId: number | string | null;
  /**
   * The hosts or groups the command will run against. Read by the formik
   * wrapper below rather than by the component itself.
   */
  // eslint-disable-next-line react/no-unused-prop-types
  adHocItems: AdHocItem[];
  [key: string]: unknown;
}

function AdHocCommandsWizard({
  onLaunch,
  moduleOptions,
  onCloseWizard,
  credentialTypeId,
  organizationId,
}: AdHocCommandsWizardProps) {
  const { t } = useLingui();
  const { setFieldTouched, values } = useFormikContext<AdHocValues>();

  const { steps, validateStep, visitStep, visitAllSteps } = useAdHocLaunchSteps(
    moduleOptions,
    organizationId,
    credentialTypeId
  );

  return (
    <Wizard
      style={{ overflow: 'scroll' }}
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
      steps={steps}
      title={t`Run command`}
      backButtonText={t`Back`}
      cancelButtonText={t`Cancel`}
      nextButtonText={t`Next`}
    />
  );
}

// The generics are what keeps the wrapper's own props visible to callers:
// without them withFormik types the wrapped component as taking nothing.
const FormikApp = withFormik<AdHocCommandsWizardProps, AdHocValues>({
  mapPropsToValues({ adHocItems }) {
    const adHocItemStrings = adHocItems
      .map((item: AdHocItem) => item.name)
      .join(', ');
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
      execution_environment: '',
    };
  },
  // The wizard launches from its own onSave rather than through formik, and
  // no step renders a submitting form, so this is never reached. formik's
  // types require it all the same.
  handleSubmit: () => {},
})(AdHocCommandsWizard);

export default FormikApp;
