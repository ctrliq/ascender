import React from 'react';
import { useField } from 'components/Form';
import type { FieldValidator } from 'components/Form';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import type { CodeEditorMode } from './CodeEditor';
import CodeEditor from './CodeEditor';
import { EditorActions } from './EditorActions';
import Popover from '../Popover';

export interface CodeEditorFieldProps {
  id: string;
  name: string;
  label: React.ReactNode;
  tooltip?: React.ReactNode;
  helperText?: string;
  validate?: FieldValidator;
  isRequired?: boolean;
  mode: CodeEditorMode;
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
      /* Copy and nothing else. The box is a message body a few lines long, so
         a height control would be chrome, and it is being edited, so collapsing
         it could hide what the writer is looking at. labelInfo is PatternFly's
         own slot at the end of the label row, which is where the other editors
         put theirs. */
      labelInfo={<EditorActions dataCy={id} copyValue={field.value ?? ''} />}
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
