import React, { useState } from 'react';
import { useField } from 'formik';
import { useLingui } from '@lingui/react/macro';
import {
	Button,
	FormGroup,
	FormHelperText,
	HelperText,
	HelperTextItem,
	MenuToggle,
	Select,
	SelectList,
	SelectOption,
	TextInputGroup,
	TextInputGroupMain,
	TextInputGroupUtilities,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import Popover from 'components/Popover';

function BecomeMethodField({ fieldOptions, isRequired = false }) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const [options, setOptions] = useState(
    [
      'sudo',
      'su',
      'pbrun',
      'pfexec',
      'dzdo',
      'pmrun',
      'runas',
      'enable',
      'doas',
      'ksu',
      'machinectl',
      'sesu',
    ].map((val) => ({ value: val }))
  );
  const [becomeMethodField, meta, helpers] = useField({
    name: `inputs.${fieldOptions.id}`,
  });

  const filteredOptions = options.filter((option) =>
    option.value.toLowerCase().includes(filterValue.toLowerCase())
  );

  const showCreateOption =
    filterValue.trim() &&
    !options.some(
      (option) => option.value.toLowerCase() === filterValue.trim().toLowerCase()
    );

  return (
    <FormGroup
      fieldId={`credential-${fieldOptions.id}`}
      label={fieldOptions.label}
      labelHelp={
        fieldOptions.help_text && <Popover content={fieldOptions.help_text} />
      }
      isRequired={isRequired}
    >
      <Select
        id="privilege-escalation-methods"
        isOpen={isOpen}
        isScrollable
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setFilterValue('');
        }}
        onSelect={(_event, value) => {
          helpers.setValue(value);
          setIsOpen(false);
          setFilterValue('');
        }}
        data-ouia-component-id={`CredentialForm-${fieldOptions.id}`}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            variant="typeahead"
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
          >
            <TextInputGroup isPlain>
              <TextInputGroupMain
                value={filterValue !== '' ? filterValue : (becomeMethodField.value || '')}
                onClick={() => setIsOpen(true)}
                onChange={(_event, val) => {
                  setFilterValue(val);
                  setIsOpen(true);
                }}
                onFocus={() => {
                  if (becomeMethodField.value && filterValue === '') {
                    setFilterValue(becomeMethodField.value);
                  }
                }}
                autoComplete="off"
                aria-label={fieldOptions.label}
              />
              {(filterValue || becomeMethodField.value) && (
                <TextInputGroupUtilities>
                  <Button icon={<TimesIcon />}
                    variant="plain"
                    onClick={() => {
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
        <SelectList style={{ maxHeight: '200px' }}>
          {filteredOptions.map((option) => (
            <SelectOption key={option.value} value={option.value}>
              {option.value}
            </SelectOption>
          ))}
          {showCreateOption && (
            <SelectOption
              value={filterValue.trim()}
              onClick={() => {
                setOptions([...options, { value: filterValue.trim() }]);
              }}
            >
              {t`Create`} &quot;{filterValue.trim()}&quot;
            </SelectOption>
          )}
          {filteredOptions.length === 0 && !showCreateOption && (
            <SelectOption isDisabled>
              {t`No results found`}
            </SelectOption>
          )}
        </SelectList>
      </Select>
      {meta.touched && meta.error && (
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

export default BecomeMethodField;
