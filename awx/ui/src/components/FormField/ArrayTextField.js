import React from 'react';
import { useField } from 'formik';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextArea,
} from '@patternfly/react-core';
import Popover from '../Popover';

function ArrayTextField({
  id,
  helperText = '',
  name,
  label,
  tooltip = null,
  tooltipMaxWidth = '',
  validate = () => {},
  isRequired = false,
  type,
  ...rest
}) {
  const [field, meta, helpers] = useField({ name, validate });
  const isValid = !(meta.touched && meta.error);
  const value = field.value || [];

  return (
    <FormGroup
      fieldId={id}
      isRequired={isRequired}
      label={label}
      labelHelp={<Popover content={tooltip} maxWidth={tooltipMaxWidth} />}
    >
      <TextArea
        id={id}
        isRequired={isRequired}
        validated={isValid ? 'default' : 'error'}
        resizeOrientation="vertical"
        {...rest}
        {...field}
        value={value.join('\n')}
        onChange={(_event, val) => {
          if (val.trim() === '') {
            helpers.setValue('');
            return;
          }
          helpers.setValue(val.split('\n').map((v) => v.trim()));
        }}
      />
      {(helperText || !isValid) && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={isValid ? 'default' : 'error'}>
              {isValid ? helperText : meta.error}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

export default ArrayTextField;
