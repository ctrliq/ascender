import React from 'react';
import { func, string, bool, number, shape } from 'prop-types';
import { Formik, useField } from 'formik';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
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
  const { i18n } = useLingui();
  const [field, meta, helpers] = useField({
    name: 'type',
    validate: required(i18n._(msg`Select a value for this field`)),
  });
  const [choicesField, choicesMeta, choicesHelpers] =
    useField('formattedChoices');

  const singleDefault = choicesField.value.map((c, i) =>
    i === 0
      ? { choice: c.choice, isDefault: true, id: c.id }
      : { choice: c.choice, isDefault: false, id: c.id }
  );

  return (
    <FormGroup
      label={i18n._(msg`Answer type`)}
      labelIcon={
        <Popover
          content={i18n._(msg`Choose an answer type or format you want as the prompt for the user.
          Refer to the Ansible Controller Documentation for more additional
          information about each option.`)}
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
          { key: 'text', value: 'text', label: i18n._(msg`Text`) },
          { key: 'textarea', value: 'textarea', label: i18n._(msg`Textarea`) },
          { key: 'password', value: 'password', label: i18n._(msg`Password`) },
          {
            key: 'multiplechoice',
            value: 'multiplechoice',
            label: i18n._(msg`Multiple Choice (single select)`),
          },
          {
            key: 'multiselect',
            value: 'multiselect',
            label: i18n._(msg`Multiple Choice (multiple select)`),
          },
          { key: 'integer', value: 'integer', label: i18n._(msg`Integer`) },
          { key: 'float', value: 'float', label: i18n._(msg`Float`) },
        ]}
      />
    </FormGroup>
  );
}

function SurveyQuestionForm({
  question,
  handleSubmit,
  handleCancel,
  submitError,
}) {
  const config = useConfig();
  const { i18n } = useLingui();

  let initialValues = {
    question_name: question?.question_name || '',
    question_description: question?.question_description || '',
    required: question ? question?.required : true,
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
    const choices = Array.isArray(question.choices)
      ? question.choices
      : question.choices.split('\n');
    const defaults = Array.isArray(question.default)
      ? question.default
      : question.default.split('\n');
    const formattedChoices = choices.map((c, i) => {
      if (defaults.includes(c)) {
        return { choice: c, isDefault: true, id: i };
      }

      return { choice: c, isDefault: false, id: i };
    });

    initialValues = {
      question_name: question?.question_name || '',
      question_description: question?.question_description || '',
      required: question ? question?.required : true,
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
              label={i18n._(msg`Question`)}
              validate={required(null)}
              isRequired
            />
            <FormField
              id="question-description"
              name="question_description"
              type="text"
              label={i18n._(msg`Description`)}
            />
            <FormField
              id="question-variable"
              name="variable"
              type="text"
              label={i18n._(msg`Answer variable name`)}
              validate={combine([noWhiteSpace(), required(null)])}
              isRequired
              tooltip={i18n._(msg`The suggested format for variable names is lowercase and
                underscore-separated (for example, foo_bar, user_id, host_name,
                etc.). Variable names with spaces are not allowed.`)}
            />
            <AnswerTypeField />
            <CheckboxField
              id="question-required"
              name="required"
              label={i18n._(msg`Required`)}
            />
          </FormColumnLayout>
          <FormColumnLayout>
            {['text', 'textarea', 'password'].includes(formik.values.type) && (
              <>
                <FormField
                  id="question-min"
                  name="min"
                  type="number"
                  label={i18n._(msg`Minimum length`)}
                />
                <FormField
                  id="question-max"
                  name="max"
                  type="number"
                  label={i18n._(msg`Maximum length`)}
                />
              </>
            )}
            {['integer', 'float'].includes(formik.values.type) && (
              <>
                <FormField
                  id="question-min"
                  name="min"
                  type="number"
                  label={i18n._(msg`Minimum`)}
                />
                <FormField
                  id="question-max"
                  name="max"
                  type="number"
                  label={i18n._(msg`Maximum`)}
                />
              </>
            )}
            {['text', 'integer', 'float'].includes(formik.values.type) && (
              <FormField
                id="question-default"
                name="default"
                validate={
                  {
                    text: maxLength(formik.values.max),
                    integer: integer(),
                    float: numberValidator(),
                  }[formik.values.type]
                }
                min={formik.values.min}
                max={formik.values.max}
                type={formik.values.type === 'text' ? 'text' : 'number'}
                label={i18n._(msg`Default answer`)}
              />
            )}
            {formik.values.type === 'textarea' && (
              <FormField
                id="question-default"
                name="default"
                type="textarea"
                label={i18n._(msg`Default answer`)}
              />
            )}
            {formik.values.type === 'password' && (
              <PasswordField
                id="question-default"
                name="default"
                label={i18n._(msg`Default answer`)}
              />
            )}
            {['multiplechoice', 'multiselect'].includes(formik.values.type) && (
              <MultipleChoiceField
                label={i18n._(msg`Multiple Choice Options`)}
                tooltip={(
                  <>
                    <span>{i18n._(msg`Refer to the`)} </span>
                    <a
                      href={`${getDocsBaseUrl(
                        config
                      )}/html/userguide/job_templates.html#surveys`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {i18n._(msg`documentation`)}
                    </a>{' '}
                    {i18n._(msg`for more information.`)}
                  </>
                )}
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

SurveyQuestionForm.propTypes = {
  question: shape({
    question_name: string.isRequired,
    question_description: string.isRequired,
    required: bool,
    type: string.isRequired,
    min: number,
    max: number,
  }),
  handleSubmit: func.isRequired,
  handleCancel: func.isRequired,
  submitError: shape({}),
};

SurveyQuestionForm.defaultProps = {
  question: null,
  submitError: null,
};
export default SurveyQuestionForm;
