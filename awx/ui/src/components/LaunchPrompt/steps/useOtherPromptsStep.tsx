import type { LaunchableResource } from 'types/api';
import React, { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useField } from 'formik';
import { jsonToYaml, yamlToJson } from 'util/yaml';
import { JSON_MODE, YAML_MODE } from 'components/CodeEditor/constants';
import type { VariablesMode } from 'components/CodeEditor/constants';
import type { LabelInput } from 'util/labels';
import OtherPromptsStep from './OtherPromptsStep';
import StepName from './StepName';
import type { LaunchConfig, LaunchPromptValues, LaunchStep } from '../types';

const STEP_ID = 'other';
// Re-exported from the editor's own constants, which is where they are
// declared: nothing outside this module reads them off it today, but the pair
// was declared here twice over before.
export { JSON_MODE, YAML_MODE };

const getVariablesData = (resource: LaunchableResource | null) => {
  if (resource?.extra_data) {
    return jsonToYaml(JSON.stringify(resource.extra_data));
  }
  if (resource?.extra_vars && resource?.extra_vars !== '---') {
    return resource.extra_vars;
  }
  return '---';
};

const FIELD_NAMES = [
  'job_type',
  'limit',
  'verbosity',
  'diff_mode',
  'job_tags',
  'skip_tags',
  'extra_vars',
  'labels',
  'timeout',
  'job_slice_count',
  'forks',
  'labels',
];

export default function useOtherPromptsStep(
  launchConfig: LaunchConfig,
  resource: LaunchableResource | null,
  labels: LabelInput[]
): LaunchStep {
  const { t } = useLingui();
  const [variablesField] = useField('extra_vars');
  const [variablesMode, setVariablesMode] = useState<VariablesMode>();
  const [isTouched, setIsTouched] = useState(false);

  const handleModeChange = (mode: VariablesMode) => {
    setVariablesMode(mode);
  };

  const validateVariables = () => {
    if (!isTouched) {
      return false;
    }
    try {
      if (variablesMode === JSON_MODE) {
        JSON.parse(variablesField.value);
      } else {
        yamlToJson(variablesField.value);
      }
    } catch (error) {
      return true;
    }
    return false;
  };
  const hasError = launchConfig.ask_variables_on_launch
    ? validateVariables()
    : false;

  return {
    step: !shouldShowPrompt(launchConfig)
      ? null
      : {
          id: STEP_ID,
          key: 5,
          name: (
            <StepName hasErrors={hasError} id="other-prompts-step">
              {t`Other prompts`}
            </StepName>
          ),
          component: (
            <OtherPromptsStep
              launchConfig={launchConfig}
              variablesMode={variablesMode}
              onVarModeChange={handleModeChange}
            />
          ),
          enableNext: true,
        },
    initialValues: getInitialValues(launchConfig, resource, labels),
    isReady: true,
    contentError: null,
    hasError,
    setTouched: (
      setFieldTouched: (
        field: string,
        touched?: boolean,
        shouldValidate?: boolean
      ) => void
    ) => {
      setIsTouched(true);
      FIELD_NAMES.forEach((fieldName) =>
        setFieldTouched(fieldName, true, false)
      );
    },
    validate: () => {},
  };
}

function shouldShowPrompt(launchConfig: LaunchConfig) {
  return (
    launchConfig.ask_job_type_on_launch ||
    launchConfig.ask_limit_on_launch ||
    launchConfig.ask_verbosity_on_launch ||
    launchConfig.ask_tags_on_launch ||
    launchConfig.ask_skip_tags_on_launch ||
    launchConfig.ask_variables_on_launch ||
    launchConfig.ask_scm_branch_on_launch ||
    launchConfig.ask_diff_mode_on_launch ||
    launchConfig.ask_labels_on_launch ||
    launchConfig.ask_forks_on_launch ||
    launchConfig.ask_job_slice_count_on_launch ||
    launchConfig.ask_timeout_on_launch
  );
}

function getInitialValues(
  launchConfig: LaunchConfig,
  resource: LaunchableResource | null,
  labels: LabelInput[]
): LaunchPromptValues {
  const initialValues: LaunchPromptValues = {};

  if (!launchConfig) {
    return initialValues;
  }

  if (launchConfig.ask_job_type_on_launch) {
    initialValues.job_type = resource?.job_type || '';
  }
  if (launchConfig.ask_limit_on_launch) {
    initialValues.limit = resource?.limit || null;
  }
  if (launchConfig.ask_verbosity_on_launch) {
    initialValues.verbosity = resource?.verbosity || 0;
  }
  if (launchConfig.ask_tags_on_launch) {
    initialValues.job_tags = resource?.job_tags || '';
  }
  if (launchConfig.ask_skip_tags_on_launch) {
    initialValues.skip_tags = resource?.skip_tags || '';
  }
  if (launchConfig.ask_variables_on_launch) {
    initialValues.extra_vars = getVariablesData(resource) as string;
  }
  if (launchConfig.ask_scm_branch_on_launch) {
    initialValues.scm_branch = resource?.scm_branch || '';
  }
  if (launchConfig.ask_diff_mode_on_launch) {
    initialValues.diff_mode = resource?.diff_mode || false;
  }
  if (launchConfig.ask_forks_on_launch) {
    initialValues.forks = resource?.forks || 0;
  }
  if (launchConfig.ask_job_slice_count_on_launch) {
    initialValues.job_slice_count = resource?.job_slice_count || 1;
  }
  if (launchConfig.ask_timeout_on_launch) {
    initialValues.timeout = resource?.timeout || 0;
  }
  if (launchConfig.ask_labels_on_launch) {
    initialValues.labels = labels || [];
  }
  return initialValues;
}
