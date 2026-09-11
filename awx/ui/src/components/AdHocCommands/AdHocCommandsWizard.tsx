import type { Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';

import { withFormik, useFormikContext } from 'formik';
import Wizard from '../Wizard';
import useAdHocLaunchSteps from './useAdHocLaunchSteps';
import type { AdHocItem, AdHocValues } from './types';

export interface AdHocCommandsWizardProps {
  onLaunch: (...args: Untyped[]) => void;
  moduleOptions: unknown;
  onCloseWizard: (...args: Untyped[]) => void;
  credentialTypeId: number | string;
  organizationId: number | string;
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
          visitStep(prevStep.prevId, setFieldTouched);
          validateStep(nextStep.id);
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
          visitStep(prevStep.prevId, setFieldTouched);
          validateStep(nextStep.id);
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

const FormikApp = withFormik({
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
})(AdHocCommandsWizard);

export default FormikApp;
