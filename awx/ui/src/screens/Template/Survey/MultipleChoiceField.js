import React from 'react';
import { useField } from 'formik';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  FormGroup,
  TextInput,
  Button,
  InputGroup as PFInputGroup,
} from '@patternfly/react-core';
import PFCheckIcon from '@patternfly/react-icons/dist/js/icons/check-icon';
import styled from 'styled-components';
import Popover from 'components/Popover';

const InputGroup = styled(PFInputGroup)`
  padding-bottom: 5px;
`;

const HelperTextWrapper = styled.div`
  font-size: var(--pf-c-form__label--FontSize);
`;

const CheckIcon = styled(PFCheckIcon)`
  color: var(--pf-c-button--m-plain--disabled--Color);
  ${(props) =>
    props.selected && `color: var(--pf-c-button--m-secondary--active--Color)`};
`;

const validate = (i18n) => (value) => {
  let message;
  const hasValue = value.find(({ choice }) =>
    choice.trim().length > 0 ? choice : undefined
  );
  if (!hasValue) {
    message = i18n._(msg`There must be a value in at least one input`);
  }
  return message;
};
function MultipleChoiceField({ label, tooltip }) {
  const { i18n } = useLingui();
  const [formattedChoicesField, formattedChoicesMeta, formattedChoicesHelpers] =
    useField({
      name: 'formattedChoices',
      validate: validate(i18n),
    });

  const [typeField] = useField('type');
  const isValid = !(formattedChoicesMeta.touched && formattedChoicesMeta.error);

  return (
    <FormGroup
      label={label}
      isRequired
      name="formattedChoices"
      id="formattedChoices"
      helperText={
        <HelperTextWrapper>
          {i18n._(msg`Type answer then click checkbox on right to select answer as
default.`)}
          <br />
          {i18n._(msg`Press 'Enter' to add more answer choices. One answer
choice per line.`)}
        </HelperTextWrapper>
      }
      helperTextInvalid={formattedChoicesMeta.error}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          formattedChoicesHelpers.setTouched();
        }
      }}
      validated={isValid ? 'default' : 'error'}
      labelIcon={<Popover content={tooltip} />}
    >
      {formattedChoicesField.value.map(({ choice, isDefault, id }, i) => (
        <InputGroup key={id}>
          <TextInput
            data-cy={choice ? `${choice}-input` : 'new-choice-input'}
            aria-label={choice || i18n._(msg`new choice`)}
            onKeyUp={(e) => {
              if (
                e.key === 'Enter' &&
                choice.trim().length > 0 &&
                i === formattedChoicesField.value.length - 1
              ) {
                formattedChoicesHelpers.setValue(
                  formattedChoicesField.value.concat({
                    choice: '',
                    isDefault: false,
                    id: i + 1,
                  })
                );
              }

              if (
                e.key === 'Backspace' &&
                !choice.trim() &&
                formattedChoicesField.value.length > 1
              ) {
                const removeEmptyField = formattedChoicesField.value.filter(
                  (c, index) => index !== i
                );

                formattedChoicesHelpers.setValue(removeEmptyField);
              }
            }}
            value={choice}
            onChange={(value) => {
              const newValues = formattedChoicesField.value.map(
                (choiceField, index) =>
                  i === index
                    ? { choice: value, isDefault: false, id: choiceField.id }
                    : choiceField
              );
              formattedChoicesHelpers.setValue(newValues);
            }}
          />
          <Button
            variant="control"
            aria-label={i18n._(msg`Click to toggle default value`)}
            ouiaId={choice ? `${choice}-button` : 'new-choice-button'}
            isDisabled={!choice.trim()}
            onClick={() => {
              const newValues = formattedChoicesField.value.map(
                (choiceField, index) =>
                  i === index
                    ? {
                        choice: choiceField.choice,
                        isDefault: !choiceField.isDefault,
                        id: choiceField.id,
                      }
                    : choiceField
              );
              const singleSelectValues = formattedChoicesField.value.map(
                (choiceField, index) =>
                  i === index
                    ? {
                        choice: choiceField.choice,
                        isDefault: !choiceField.isDefault,
                        id: choiceField.id,
                      }
                    : {
                        choice: choiceField.choice,
                        isDefault: false,
                        id: choiceField.id,
                      }
              );
              return typeField.value === 'multiplechoice'
                ? formattedChoicesHelpers.setValue(singleSelectValues)
                : formattedChoicesHelpers.setValue(newValues);
            }}
          >
            <CheckIcon selected={isDefault} />
          </Button>
        </InputGroup>
      ))}
    </FormGroup>
  );
}

export default MultipleChoiceField;
