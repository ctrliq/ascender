import type { Untyped } from 'types/api';
import React from 'react';
import styled from 'styled-components';
import { ExclamationCircleIcon as PFExclamationCircleIcon } from '@patternfly/react-icons';
import { Tooltip } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { useFormikContext } from 'formik';

import * as yaml from 'js-yaml';
import mergeExtraVars, { maskPasswords } from 'util/prompt/mergeExtraVars';
import getSurveyValues from 'util/prompt/getSurveyValues';
import PromptDetail from '../../PromptDetail';
import type { LaunchConfig, LaunchPromptValues, SurveyConfig } from '../types';

const ExclamationCircleIcon = styled(PFExclamationCircleIcon)`
  margin-left: 10px;
  margin-top: -2px;
`;

const ErrorMessageWrapper = styled.div`
  align-items: center;
  color: var(--pf-v6-global--danger-color--200);
  display: flex;
  font-weight: var(--pf-v6-global--FontWeight--bold);
  margin-bottom: 10px;
`;

export interface PreviewStepProps {
  resource: Untyped;
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
          .filter((q: Untyped) => q.type === 'password')
          .map((q: Untyped) => q.variable);
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
        <ErrorMessageWrapper>
          {t`Some of the previous step(s) have errors`}
          <Tooltip
            position="right"
            content={t`See errors on the left`}
            trigger="click mouseenter focus"
          >
            <ExclamationCircleIcon />
          </Tooltip>
        </ErrorMessageWrapper>
      )}
      <PromptDetail
        resource={resource}
        launchConfig={launchConfig}
        overrides={overrides}
      />
    </div>
  );
}

export default PreviewStep;
