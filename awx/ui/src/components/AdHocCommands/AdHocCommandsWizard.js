import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { withFormik, useFormikContext } from 'formik';
import PropTypes from 'prop-types';
import Wizard from '../Wizard';
import useAdHocLaunchSteps from './useAdHocLaunchSteps';

function AdHocCommandsWizard({
  onLaunch,
  moduleOptions,
  onCloseWizard,
  credentialTypeId,
  organizationId,
}) {
  const { i18n } = useLingui();
  const { setFieldTouched, values } = useFormikContext();

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
      title={i18n._(msg`Run command`)}
      backButtonText={i18n._(msg`Back`)}
      cancelButtonText={i18n._(msg`Cancel`)}
      nextButtonText={i18n._(msg`Next`)}
    />
  );
}

const FormikApp = withFormik({
  mapPropsToValues({ adHocItems }) {
    const adHocItemStrings = adHocItems.map((item) => item.name).join(', ');
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

FormikApp.propTypes = {
  onLaunch: PropTypes.func.isRequired,
  moduleOptions: PropTypes.arrayOf(PropTypes.array).isRequired,
  onCloseWizard: PropTypes.func.isRequired,
  credentialTypeId: PropTypes.number.isRequired,
};
export default FormikApp;
