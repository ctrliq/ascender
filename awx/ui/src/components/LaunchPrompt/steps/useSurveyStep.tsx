import type { LaunchableResource } from 'types/api';
import React from 'react';
import { t } from '@lingui/core/macro';
import { useFormikContext } from 'formik';
import SurveyStep from './SurveyStep';
import StepName from './StepName';
import type {
  LaunchConfig,
  LaunchPromptValues,
  LaunchStep,
  SurveyConfig,
  SurveyQuestion,
  VisitedSteps,
} from '../types';

const STEP_ID = 'survey';

/**
 * How long an answer is, for the questions that are bounded by it.
 *
 * Text questions answer with a string and multiselect ones with an array;
 * anything else has no length, and NaN compares false against every bound the
 * way reading .length off a number used to give undefined.
 */
const answerLength = (value: unknown): number =>
  typeof value === 'string' || Array.isArray(value) ? value.length : NaN;

export default function useSurveyStep(
  launchConfig: LaunchConfig,
  surveyConfig: SurveyConfig,
  resource: LaunchableResource | null,
  visitedSteps: VisitedSteps
): LaunchStep {
  const { setFieldError, values } = useFormikContext<LaunchPromptValues>();
  const hasError =
    Object.keys(visitedSteps).includes(STEP_ID) &&
    checkForError(launchConfig, surveyConfig, values);

  return {
    step: launchConfig.survey_enabled
      ? {
          id: STEP_ID,
          name: (
            <StepName hasErrors={hasError} id="survey-step">
              {t`Survey`}
            </StepName>
          ),
          component: <SurveyStep surveyConfig={surveyConfig} />,
          enableNext: true,
        }
      : null,
    initialValues: getInitialValues(launchConfig, surveyConfig, resource),
    surveyConfig,
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
      if (!surveyConfig?.spec) {
        return;
      }
      surveyConfig.spec.forEach((question: SurveyQuestion) => {
        setFieldTouched(`survey_${question.variable}`, true, false);
      });
    },
    validate: () => {
      if (launchConfig.survey_enabled && surveyConfig.spec) {
        surveyConfig.spec.forEach((question: SurveyQuestion) => {
          const errMessage = validateSurveyField(
            question,
            values[`survey_${question.variable}`]
          );
          if (errMessage) {
            setFieldError(`survey_${question.variable}`, errMessage);
          }
        });
      }
    },
  };
}

function getInitialValues(
  launchConfig: LaunchConfig,
  surveyConfig: SurveyConfig,
  resource: LaunchableResource | null
): Record<string, unknown> {
  if (!launchConfig.survey_enabled || !surveyConfig) {
    return {};
  }

  const values: Record<string, unknown> = {};
  if (surveyConfig?.spec) {
    surveyConfig.spec.forEach((question: SurveyQuestion) => {
      if (question.type === 'multiselect') {
        values[`survey_${question.variable}`] = question.default
          ? (question.default as string).split('\n')
          : [];
      } else {
        values[`survey_${question.variable}`] = question.default ?? '';
      }
      if (resource?.extra_data) {
        Object.entries(resource.extra_data as Record<string, unknown>).forEach(
          ([key, value]) => {
            if (key === question.variable) {
              if (question.type === 'multiselect') {
                values[`survey_${question.variable}`] = value;
              } else {
                values[`survey_${question.variable}`] = value;
              }
            }
          }
        );
      }
    });
  }

  return values;
}

function validateSurveyField(question: SurveyQuestion, value: unknown) {
  const isTextField = ['text', 'textarea'].includes(question.type ?? '');
  const isNumeric = ['integer', 'float'].includes(question.type ?? '');
  if (isTextField && (value || value === 0)) {
    if (question.min && answerLength(value) < question.min) {
      return t`This field must be at least ${question.min} characters`;
    }
    if (question.max && answerLength(value) > question.max) {
      return t`This field must not exceed ${question.max} characters`;
    }
  }
  if (isNumeric && (value || value === 0)) {
    if (
      Number(value) < Number(question.min) ||
      Number(value) > Number(question.max)
    ) {
      return t`This field must be a number and have a value between ${question.min ?? ''} and ${question.max ?? ''}`;
    }
  }
  if (question.required && !value && value !== 0) {
    return t`This field must not be blank`;
  }
  return null;
}

function checkForError(
  launchConfig: LaunchConfig,
  surveyConfig: SurveyConfig,
  values: LaunchPromptValues
) {
  let hasError = false;
  if (launchConfig.survey_enabled && surveyConfig.spec) {
    surveyConfig.spec.forEach((question: SurveyQuestion) => {
      const value = values[`survey_${question.variable}`];
      const isTextField = ['text', 'textarea'].includes(question.type ?? '');
      const isNumeric = ['integer', 'float'].includes(question.type ?? '');
      if (isTextField && (value || value === 0)) {
        if (
          (question.min != null && answerLength(value) < question.min) ||
          (question.max != null && answerLength(value) > question.max)
        ) {
          hasError = true;
        }
      }
      if (isNumeric) {
        if (
          (Number(value) < Number(question.min) ||
            Number(value) > Number(question.max) ||
            value === '') &&
          question.required
        ) {
          hasError = true;
        }
      }
      if (
        question.required &&
        (!value || answerLength(value) === 0) &&
        !isNumeric
      ) {
        hasError = true;
      }
    });
  }

  return hasError;
}
