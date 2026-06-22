import React from 'react';
import { useField } from 'formik';
import { FormGroup } from '@patternfly/react-core';
import CodeEditor from './CodeEditor';
import Popover from '../Popover';

function CodeEditorField({
  id,
  name,
  label,
  tooltip = null,
  helperText = '',
  validate = () => {},
  isRequired = false,
  mode,
  rows = 5,
  ...rest
}) {
  const [field, meta, helpers] = useField({ name, validate });
  const isValid = !(meta.touched && meta.error);

  return (
    <FormGroup
      id={`${id}-field`}
      fieldId={id}
      helperText={helperText}
      helperTextInvalid={meta.error}
      isRequired={isRequired}
      validated={isValid ? 'default' : 'error'}
      label={label}
      labelIcon={<Popover content={tooltip} />}
    >
      <CodeEditor
        id={id}
        {...rest}
        {...field}
        onChange={(value) => {
          helpers.setValue(value);
        }}
        mode={mode}
        rows={rows}
      />
    </FormGroup>
  );
}

export default CodeEditorField;
