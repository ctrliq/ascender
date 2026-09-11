import type { Untyped } from 'types/api';
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

export interface CodeEditorFieldProps {
  id: Untyped;
  name: Untyped;
  label: React.ReactNode;
  tooltip?: Untyped;
  helperText?: string;
  validate?: (...args: Untyped[]) => void;
  isRequired?: boolean;
  mode: Untyped;
  rows?: number;
  [key: string]: unknown;
}

function CodeEditorField({
  id,
  name,
  label,
  tooltip,
  helperText = '',
  validate = () => {},
  isRequired = false,
  mode,
  rows = 5,
  ...rest
}: CodeEditorFieldProps) {
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
        onChange={(value: unknown) => {
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
