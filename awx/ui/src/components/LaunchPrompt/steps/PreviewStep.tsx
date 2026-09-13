import type { LaunchableResource } from 'types/api';
import React from 'react';
import { ExclamationCircleIcon as PFExclamationCircleIcon } from '@patternfly/react-icons';
import { Tooltip } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { useFormikContext } from 'formik';

import * as yaml from 'js-yaml';
import mergeExtraVars, { maskPasswords } from 'util/prompt/mergeExtraVars';
import getSurveyValues from 'util/prompt/getSurveyValues';
import PromptDetail from '../../PromptDetail';
import type { LaunchConfig, LaunchPromptValues, SurveyConfig } from '../types';
import './PreviewStep.css';

export interface PreviewStepProps {
  resource: LaunchableResource | null;
  launchConfig: LaunchConfig;
  surveyConfig?: SurveyConfig | null;
  formErrors?: boolean;
  [key: string]: unknown;
}

function PreviewStep({
  resource,
  launchConfig,
  surveyConfig,
  formErrors,
}: PreviewStepProps) {
  const { t } = useLingui();
  const { values } = useFormikContext<LaunchPromptValues>();
  const surveyValues = getSurveyValues(values);

  const overrides = {
    ...values,
  };

  if (launchConfig.ask_variables_on_launch || launchConfig.survey_enabled) {
    try {
      // Empty string when the launch config does not prompt for variables,
      // which is what mergeExtraVars treats as no overrides.
      const initialExtraVars: string = launchConfig.ask_variables_on_launch
        ? (overrides.extra_vars as string) || '---'
        : '';
      if (surveyConfig?.spec) {
        const passwordFields = surveyConfig.spec
          .filter((q) => q.type === 'password')
          .map((q) => q.variable);
        const masked = maskPasswords(surveyValues, passwordFields);
        overrides.extra_vars = yaml.dump(
          mergeExtraVars(initialExtraVars, masked)
        );
      } else {
        overrides.extra_vars = yaml.dump(mergeExtraVars(initialExtraVars, {}));
      }
    } catch (e) {
      //
    }
  }

  return (
    <div data-cy="prompt-preview">
      {formErrors && (
        <div className="awx-preview-step__error-message-wrapper">
          {t`Some of the previous step(s) have errors`}
          <Tooltip
            position="right"
            content={t`See errors on the left`}
            trigger="click mouseenter focus"
          >
            <PFExclamationCircleIcon className="awx-preview-step__exclamation-circle-icon" />
          </Tooltip>
        </div>
      )}
      <PromptDetail
        resource={resource ?? {}}
        launchConfig={launchConfig}
        overrides={overrides}
      />
    </div>
  );
}

export default PreviewStep;
