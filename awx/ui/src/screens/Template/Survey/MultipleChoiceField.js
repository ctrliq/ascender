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
import CheckIcon from '@patternfly/react-icons/dist/js/icons/check-icon';
import styled from 'styled-components';
import Popover from 'components/Popover';

const InputGroup = styled(PFInputGroup)`
  padding-bottom: 5px;
`;

const HelperTextWrapper = styled.div`
  font-size: var(--pf-v6-c-form__label--FontSize);
`;

/*
 * The default-choice toggle is a control button whose background shows the
 * state: the brand colour when the choice is the default, a disabled-looking
 * grey when it is not (including the disabled toggle on a still-empty row).
 *
 * The themes paint every control button in the brand colour with
 * high-specificity nested rules (html[data-theme] ...
 * .pf-v6-c-button.pf-m-control, with :not(:disabled), :hover and :disabled
 * variants), so the grey state has to use !important to win. PatternFly draws
 * the border with a ::after pseudo-element from --pf-v6-c-button--BorderColor,
 * so that variable has to change as well as border-color (the light, dark and
 * awx themes also set a real border on the element). The selected
 * state lets the theme through and only supplies a fallback for themes that do
 * not style control buttons.
 */
const DefaultToggle = styled(Button)`
  &.ascender-multiple-choice-field__default-toggle--selected {
    background-color: var(--pf-t--global--color--brand--default);
    color: var(--pf-t--global--text--color--on-brand--default);
  }

  &:not(.ascender-multiple-choice-field__default-toggle--selected) {
    --pf-v6-c-button--BorderColor: var(
      --pf-t--global--border--color--disabled
    ) !important;
    --pf-v6-c-button--hover--BorderColor: var(
      --pf-t--global--border--color--disabled
    ) !important;
    background: var(
      --pf-t--global--background--color--disabled--default
    ) !important;
    border-color: var(--pf-t--global--border--color--disabled) !important;
    color: var(--pf-t--global--icon--color--disabled) !important;
  }
`;

function MultipleChoiceField({ label, tooltip }) {
  const { t } = useLingui();
  const validate = (value) => {
    let message;
    const hasValue = value.find(({ choice }) =>
      choice.trim().length > 0 ? choice : undefined
    );
    if (!hasValue) {
      message = t`There must be a value in at least one input`;
    }
    return message;
  };
  const [formattedChoicesField, formattedChoicesMeta, formattedChoicesHelpers] =
    useField({
      name: 'formattedChoices',
      validate,
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
          <DefaultToggle
            variant="control"
            className={[
              'ascender-multiple-choice-field__default-toggle',
              isDefault &&
                'ascender-multiple-choice-field__default-toggle--selected',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={t`Click to toggle default value`}
            aria-pressed={isDefault}
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
            <CheckIcon />
          </DefaultToggle>
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
