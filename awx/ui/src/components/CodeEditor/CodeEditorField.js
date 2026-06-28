import React from 'react';
import { useField } from 'formik';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
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
      isRequired={isRequired}
      label={label}
      labelHelp={<Popover content={tooltip} />}
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

export default CodeEditorField;
