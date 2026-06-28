import React, { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useField } from 'formik';
import {
	Button,
	Form,
	FormGroup,
	FormHelperText,
	HelperText,
	HelperTextItem,
	Label,
	LabelGroup,
	MenuToggle,
	Select,
	SelectList,
	SelectOption,
	TextInputGroup,
	TextInputGroupMain,
	TextInputGroupUtilities,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import {
  required,
  minMaxValue,
  maxLength,
  minLength,
  integer,
  combine,
} from 'util/validators';
import FormField from '../../FormField';
import Popover from '../../Popover';

function SurveyStep({ surveyConfig }) {
  const fieldTypes = {
    text: TextField,
    textarea: TextField,
    password: TextField,
    multiplechoice: MultipleChoiceField,
    multiselect: MultiSelectField,
    integer: NumberField,
    float: NumberField,
  };
  return (
    <div data-cy="survey-prompts">
      <Form
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        {surveyConfig.spec.map((question) => {
          const Field = fieldTypes[question.type];
          return <Field key={question.variable} question={question} />;
        })}
      </Form>
    </div>
  );
}

function TextField({ question }) {
  const validators = [
    question.required ? required(null) : null,
    question.required && question.min ? minLength(question.min) : null,
    question.required && question.max ? maxLength(question.max) : null,
  ];
  return (
    <FormField
      id={`survey-question-${question.variable}`}
      name={`survey_${question.variable}`}
      label={question.question_name}
      tooltip={question.question_description}
      isRequired={question.required}
      validate={combine(validators)}
      type={question.type}
      minLength={question.min}
      maxLength={question.max}
    />
  );
}

function NumberField({ question }) {
  const validators = [
    question.required ? required(null) : null,
    minMaxValue(question.min, question.max),
    question.type === 'integer' ? integer() : null,
  ];
  return (
    <FormField
      id={`survey-question-${question.variable}`}
      name={`survey_${question.variable}`}
      label={question.question_name}
      tooltip={question.question_description}
      isRequired={question.required}
      validate={combine(validators)}
      type="number"
      min={question.min}
      max={question.max}
    />
  );
}

function MultipleChoiceField({ question }) {
  const { t } = useLingui();
  const [field, meta, helpers] = useField({
    name: `survey_${question.variable}`,
    validate: question.required ? required(null) : null,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const id = `survey-question-${question.variable}`;
  const isValid = !(meta.touched && meta.error);

  let options = [];

  if (typeof question.choices === 'string') {
    options = question.choices.split('\n');
  } else if (Array.isArray(question.choices)) {
    options = [...question.choices];
  }

  const filteredOptions = filterValue
    ? options.filter((opt) =>
        opt.toLowerCase().includes(filterValue.toLowerCase())
      )
    : options;

  return (
    <FormGroup
      fieldId={id}
      isRequired={question.required}
      label={question.question_name}
      labelHelp={<Popover content={question.question_description} />}
    >
      <Select
        id={id}
        isOpen={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setFilterValue('');
        }}
        onSelect={(_event, value) => {
          helpers.setValue(value);
          setIsOpen(false);
          setFilterValue('');
        }}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            variant="typeahead"
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
            ouiaId={`single-survey-question-${question.variable}`}
          >
            <TextInputGroup isPlain>
              <TextInputGroupMain
                value={filterValue || field.value || ''}
                onClick={() => setIsOpen(true)}
                onChange={(_event, val) => {
                  setFilterValue(val);
                  setIsOpen(true);
                }}
                onFocus={() => {
                  if (field.value && !filterValue) {
                    setFilterValue(field.value);
                  }
                }}
                autoComplete="off"
                placeholder={t`Select an option`}
              />
              {(filterValue || field.value) && (
                <TextInputGroupUtilities>
                  <Button icon={<TimesIcon />}
                    variant="plain"
                    onClick={() => {
                      helpers.setTouched(true);
                      helpers.setValue('');
                      setFilterValue('');
                    }}
                    aria-label={t`Clear`}
                   />
                </TextInputGroupUtilities>
              )}
            </TextInputGroup>
          </MenuToggle>
        )}
      >
        <SelectList>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <SelectOption key={opt} value={opt}>
                {opt}
              </SelectOption>
            ))
          ) : (
            <SelectOption isDisabled>{t`No results found`}</SelectOption>
          )}
        </SelectList>
      </Select>
      {!isValid && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">
              {meta.error}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

function MultiSelectField({ question }) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const [field, meta, helpers] = useField({
    name: `survey_${question.variable}`,
    validate: question.required ? required(null) : null,
  });
  const id = `survey-question-${question.variable}`;
  const hasActualValue = !question.required || meta.value?.length > 0;
  const isValid = !meta.touched || (!meta.error && hasActualValue);

  let options = [];

  if (typeof question.choices === 'string') {
    options = question.choices.split('\n');
  } else if (Array.isArray(question.choices)) {
    options = [...question.choices];
  }

  const filteredOptions = filterValue
    ? options.filter((opt) =>
        opt.toLowerCase().includes(filterValue.toLowerCase())
      )
    : options;

  return (
    <FormGroup
      fieldId={id}
      isRequired={question.required}
      label={question.question_name}
      labelHelp={<Popover content={question.question_description} />}
    >
      <Select
        id={id}
        isOpen={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setFilterValue('');
        }}
        onSelect={(_event, value) => {
          if (field?.value?.includes(value)) {
            helpers.setValue(field.value.filter((o) => o !== value));
          } else {
            helpers.setValue(field.value.concat(value));
          }
          helpers.setTouched(true);
          setFilterValue('');
        }}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            variant="typeahead"
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
            ouiaId={`multi-survey-question-${question.variable}`}
          >
            <TextInputGroup isPlain>
              <TextInputGroupMain
                value={filterValue}
                onClick={() => setIsOpen(true)}
                onChange={(_event, val) => {
                  setFilterValue(val);
                  setIsOpen(true);
                }}
                autoComplete="off"
                placeholder={
                  !field.value?.length ? t`Select option(s)` : ''
                }
              >
                {field.value?.length > 0 && (
                  <LabelGroup>
                    {field.value.map((val) => (
                      <Label
                        key={val}
                        onClose={() => {
                          helpers.setValue(
                            field.value.filter((o) => o !== val)
                          );
                          helpers.setTouched(true);
                        }}
                      >
                        {val}
                      </Label>
                    ))}
                  </LabelGroup>
                )}
              </TextInputGroupMain>
              {(filterValue || field.value?.length > 0) && (
                <TextInputGroupUtilities>
                  <Button icon={<TimesIcon />}
                    variant="plain"
                    onClick={() => {
                      helpers.setTouched(true);
                      helpers.setValue([]);
                      setFilterValue('');
                    }}
                    aria-label={t`Clear`}
                   />
                </TextInputGroupUtilities>
              )}
            </TextInputGroup>
          </MenuToggle>
        )}
      >
        <SelectList>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <SelectOption
                key={opt}
                value={opt}
                hasCheckbox
                isSelected={field.value?.includes(opt)}
              >
                {opt}
              </SelectOption>
            ))
          ) : (
            <SelectOption isDisabled>{t`No results found`}</SelectOption>
          )}
        </SelectList>
      </Select>
      {!isValid && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">
              {meta.error ||
                t`At least one value must be selected for this field.`}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

export default SurveyStep;
