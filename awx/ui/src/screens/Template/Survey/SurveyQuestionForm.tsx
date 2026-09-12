import type { SurveyQuestion } from 'types/api';
import React from 'react';
import { Formik, useField } from 'formik';
import { useLingui } from '@lingui/react/macro';
import { Form, FormGroup } from '@patternfly/react-core';
import { FormColumnLayout } from 'components/FormLayout';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import FormField, {
  CheckboxField,
  PasswordField,
  FormSubmitError,
} from 'components/FormField';
import { useConfig } from 'contexts/Config';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import AnsibleSelect from 'components/AnsibleSelect';
import Popover from 'components/Popover';
import {
  required,
  noWhiteSpace,
  combine,
  maxLength,
  integer,
  number as numberValidator,
} from 'util/validators';
import MultipleChoiceField from './MultipleChoiceField';

function AnswerTypeField() {
  const { t } = useLingui();
  const [field, meta, helpers] = useField({
    name: 'type',
    validate: required(t`Select a value for this field`),
  });
  const [choicesField, choicesMeta, choicesHelpers] =
    useField('formattedChoices');

  const singleDefault = choicesField.value.map((c: SurveyChoice, i: number) =>
    i === 0
      ? { choice: c.choice, isDefault: true, id: c.id }
      : { choice: c.choice, isDefault: false, id: c.id }
  );

  return (
    <FormGroup
      label={t`Answer type`}
      labelHelp={
        <Popover
          content={t`Choose an answer type or format you want as the prompt for the user.
          Refer to the Ascender Documentation for additional information about each option.`}
        />
      }
      isRequired
      fieldId="question-answer-type"
    >
      <AnsibleSelect
        id="question-type"
        {...field}
        onChange={(e, val) => {
          helpers.setValue(val);

          // Edit Mode: Makes the first choice the default value if
          // the type switches from multiselect, to multiple choice
          if (
            val === 'multiplechoice' &&
            ['multiplechoice', 'multiselect'].includes(meta.initialValue) &&
            val !== meta.initialValue
          ) {
            choicesHelpers.setValue(singleDefault);
          }

          // Edit Mode: Resets Multiple choice or Multiselect values if the user move type
          // back to one of those values
          if (
            ['multiplechoice', 'multiselect'].includes(val) &&
            val === meta.initialValue
          ) {
            choicesHelpers.setValue(choicesMeta.initialValue);
          }
        }}
        data={[
          { key: 'text', value: 'text', label: t`Text` },
          { key: 'textarea', value: 'textarea', label: t`Textarea` },
          { key: 'password', value: 'password', label: t`Password` },
          {
            key: 'multiplechoice',
            value: 'multiplechoice',
            label: t`Multiple Choice (single select)`,
          },
          {
            key: 'multiselect',
            value: 'multiselect',
            label: t`Multiple Choice (multiple select)`,
          },
          { key: 'integer', value: 'integer', label: t`Integer` },
          { key: 'float', value: 'float', label: t`Float` },
        ]}
      />
    </FormGroup>
  );
}

/**
 * One choice of a multiple choice question, as the form holds it: the answer
 * itself, whether it is one of the defaults, and the row's own key.
 */
export interface SurveyChoice {
  choice: string;
  isDefault: boolean;
  id: number;
}

/**
 * What the survey question form holds. It is the question the api takes, with
 * the choices kept as rows the form can tick and reorder, which the add and
 * edit screens fold back into choices and default before they save.
 */
export interface SurveyQuestionFormValues {
  question_name: string;
  question_description: string;
  required: boolean;
  type: string;
  variable: string;
  min?: number | null;
  max?: number | null;
  default?: unknown;
  choices?: string[] | string;
  formattedChoices?: SurveyChoice[];
  new_question: boolean;
  [key: string]: unknown;
}

export interface SurveyQuestionFormProps {
  question?: SurveyQuestion | null;
  handleSubmit: (values: SurveyQuestionFormValues) => void;
  handleCancel: () => void;
  submitError?: unknown;
  [key: string]: unknown;
}

function SurveyQuestionForm({
  question = null,
  handleSubmit,
  handleCancel,
  submitError = null,
}: SurveyQuestionFormProps) {
  const config = useConfig();
  const { t } = useLingui();

  // The two branches build different subsets of the same form, so the
  // shape is whichever one the question type calls for.
  let initialValues: SurveyQuestionFormValues = {
    question_name: question?.question_name || '',
    question_description: question?.question_description || '',
    required: question ? Boolean(question.required) : true,
    type: question?.type || 'text',
    variable: question?.variable || '',
    min: question?.min || 0,
    max: question?.max || 1024,
    default: question?.default ?? '',
    choices: question?.choices || '',
    formattedChoices: [{ choice: '', isDefault: false, id: 0 }],
    new_question: !question,
  };
  if (question?.type === 'multiselect' || question?.type === 'multiplechoice') {
    // Both come back as newline separated text, and both were arrays in an
    // older serializer, which is what the form still reads them as.
    const choices = Array.isArray(question.choices)
      ? question.choices
      : String(question.choices ?? '').split('\n');
    const defaults = Array.isArray(question.default)
      ? (question.default as string[])
      : String(question.default ?? '').split('\n');
    const formattedChoices = choices.map((c: string, i: number) => {
      if (defaults.includes(c)) {
        return { choice: c, isDefault: true, id: i };
      }

      return { choice: c, isDefault: false, id: i };
    });

    initialValues = {
      question_name: question?.question_name || '',
      question_description: question?.question_description || '',
      required: question ? Boolean(question.required) : true,
      type: question?.type || 'text',
      variable: question?.variable || '',
      min: question?.min || 0,
      max: question?.max || 1024,
      formattedChoices,
      new_question: !question,
    };
  }

  return (
    <Formik
      enableReinitialize
      initialValues={initialValues}
      onSubmit={handleSubmit}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <FormField
              id="question-name"
              name="question_name"
              type="text"
              label={t`Question`}
              validate={required(null)}
              isRequired
            />
            <FormField
              id="question-description"
              name="question_description"
              type="text"
              label={t`Description`}
            />
            <FormField
              id="question-variable"
              name="variable"
              type="text"
              label={t`Answer variable name`}
              validate={combine([noWhiteSpace(), required(null)])}
              isRequired
              tooltip={t`The suggested format for variable names is lowercase and
                underscore-separated (for example, foo_bar, user_id, host_name,
                etc.). Variable names with spaces are not allowed.`}
            />
            <AnswerTypeField />
            <CheckboxField
              id="question-required"
              name="required"
              label={t`Required`}
            />
          </FormColumnLayout>
          <FormColumnLayout>
            {['text', 'textarea', 'password'].includes(formik.values.type) && (
              <>
                <FormField
                  id="question-min"
                  name="min"
                  type="number"
                  label={t`Minimum length`}
                />
                <FormField
                  id="question-max"
                  name="max"
                  type="number"
                  label={t`Maximum length`}
                />
              </>
            )}
            {['integer', 'float'].includes(formik.values.type) && (
              <>
                <FormField
                  id="question-min"
                  name="min"
                  type="number"
                  label={t`Minimum`}
                />
                <FormField
                  id="question-max"
                  name="max"
                  type="number"
                  label={t`Maximum`}
                />
              </>
            )}
            {['text', 'integer', 'float'].includes(formik.values.type) && (
              <FormField
                id="question-default"
                name="default"
                validate={
                  {
                    text: maxLength(formik.values.max ?? 0),
                    integer: integer(),
                    float: numberValidator(),
                  }[formik.values.type as 'text' | 'integer' | 'float']
                }
                min={formik.values.min}
                max={formik.values.max}
                type={formik.values.type === 'text' ? 'text' : 'number'}
                label={t`Default answer`}
              />
            )}
            {formik.values.type === 'textarea' && (
              <FormField
                id="question-default"
                name="default"
                type="textarea"
                label={t`Default answer`}
              />
            )}
            {formik.values.type === 'password' && (
              <PasswordField
                id="question-default"
                name="default"
                label={t`Default answer`}
              />
            )}
            {['multiplechoice', 'multiselect'].includes(formik.values.type) && (
              <MultipleChoiceField
                label={t`Multiple Choice Options`}
                tooltip={
                  <>
                    <span>{t`Refer to the`} </span>
                    <a
                      href={`${getDocsBaseUrl(
                        config
                      )}/userguide/job_templates.html#surveys`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t`documentation`}
                    </a>{' '}
                    {t`for more information.`}
                  </>
                }
              />
            )}
          </FormColumnLayout>
          <FormSubmitError error={submitError} />
          <FormActionGroup
            onCancel={handleCancel}
            onSubmit={formik.handleSubmit}
          />
        </Form>
      )}
    </Formik>
  );
}

export default SurveyQuestionForm;
