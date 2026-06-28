import React from 'react';
import { useField } from 'formik';
import { useLingui } from '@lingui/react/macro';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
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
  font-size: var(--pf-v6-c-form__label--FontSize);
`;

const CheckIcon = styled(PFCheckIcon)`
  color: var(--pf-v6-c-button--m-plain--disabled--Color);
  ${(props) =>
    props.selected && `color: var(--pf-v6-c-button--m-secondary--active--Color)`};
`;

const validate = (t) => (value) => {
  let message;
  const hasValue = value.find(({ choice }) =>
    choice.trim().length > 0 ? choice : undefined
  );
  if (!hasValue) {
    message = t`There must be a value in at least one input`;
  }
  return message;
};
function MultipleChoiceField({ label, tooltip }) {
  const { t } = useLingui();
  const [formattedChoicesField, formattedChoicesMeta, formattedChoicesHelpers] =
    useField({
      name: 'formattedChoices',
      validate: validate(t),
    });

  const [typeField] = useField('type');
  const isValid = !(formattedChoicesMeta.touched && formattedChoicesMeta.error);

  return (
    <FormGroup
      label={label}
      isRequired
      name="formattedChoices"
      id="formattedChoices"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          formattedChoicesHelpers.setTouched();
        }
      }}
      labelHelp={<Popover content={tooltip} />}
    >
      {formattedChoicesField.value.map(({ choice, isDefault, id }, i) => (
        <InputGroup key={id}>
          <TextInput
            data-cy={choice ? `${choice}-input` : 'new-choice-input'}
            aria-label={choice || t`new choice`}
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
            onChange={(_event, value) => {
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
            aria-label={t`Click to toggle default value`}
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
      <FormHelperText>
        <HelperText>
          <HelperTextItem variant={isValid ? 'default' : 'error'}>
            {isValid ? (
              <HelperTextWrapper>
                {t`Type answer then click checkbox on right to select answer as
default.`}
                <br />
                {t`Press 'Enter' to add more answer choices. One answer
choice per line.`}
              </HelperTextWrapper>
            ) : (
              formattedChoicesMeta.error
            )}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  );
}

export default MultipleChoiceField;
