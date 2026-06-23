import React, { useState } from 'react';
import { useField } from 'formik';
import { useLingui } from '@lingui/react/macro';
import {
	FormGroup,
	FormHelperText,
	HelperText,
	HelperTextItem,
} from '@patternfly/react-core';
import {
	Select,
	SelectOption,
	SelectVariant
} from '@patternfly/react-core/deprecated';
import Popover from 'components/Popover';

function BecomeMethodField({ fieldOptions, isRequired = false }) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
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
  return (
    <FormGroup
      fieldId={`credential-${fieldOptions.id}`}
      label={fieldOptions.label}
      labelIcon={
        fieldOptions.help_text && <Popover content={fieldOptions.help_text} />
      }
      isRequired={isRequired}
    >
      <Select
        ouiaId={`CredentialForm-${fieldOptions.id}`}
        typeAheadAriaLabel={fieldOptions.label}
        maxHeight={200}
        variant={SelectVariant.typeahead}
        onToggle={(_event, val) => setIsOpen(val)}
        onClear={() => {
          helpers.setValue('');
        }}
        onSelect={(event, option) => {
          helpers.setValue(option);
          setIsOpen(false);
        }}
        isOpen={isOpen}
        id="privilege-escalation-methods"
        selections={becomeMethodField.value}
        isCreatable
        onCreateOption={(option) => {
          setOptions([...options, { value: option }]);
        }}
        noResultsFoundText={t`No results found`}
        createText={t`Create`}
      >
        {options.map((option) => (
          <SelectOption key={option.value} value={option.value} />
        ))}
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
