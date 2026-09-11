import type { Untyped } from 'types/api';
import React from 'react';
import { useField } from 'formik';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
  TextArea,
} from '@patternfly/react-core';
import Popover from '../Popover';
import type { TextInputProps } from '@patternfly/react-core';

export interface FormFieldProps {
  id: Untyped;
  helperText?: string;
  name: Untyped;
  label: React.ReactNode;
  tooltip?: Untyped;
  tooltipMaxWidth?: string;
  validate?: (...args: Untyped[]) => void;
  isRequired?: boolean;
  isReadOnly?: boolean;
  /** A TextInput type, or 'textarea' to render a TextArea instead. */
  type?: TextInputProps['type'] | 'textarea';
  [key: string]: unknown;
}

function FormField({
  id,
  helperText = '',
  name,
  label,
  tooltip,
  tooltipMaxWidth = '',
  validate = () => {},
  isRequired = false,
  isReadOnly = false,
  type = 'text',
  ...rest
}: FormFieldProps) {
  const [field, meta] = useField({ name, validate });
  const isValid = !(meta.touched && meta.error);

  const helperTextContent = (
    <FormHelperText>
      <HelperText>
        <HelperTextItem variant={isValid ? 'default' : 'error'}>
          {isValid ? helperText : meta.error}
        </HelperTextItem>
      </HelperText>
    </FormHelperText>
  );

  return (
    <>
      {(type === 'textarea' && (
        <FormGroup
          fieldId={id}
          data-cy={`${id}-form-group`}
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
            onChange={(event) => {
              field.onChange(event);
            }}
          />
          {(helperText || !isValid) && helperTextContent}
        </FormGroup>
      )) || (
        <FormGroup
          fieldId={id}
          data-cy={`${id}-form-group`}
          isRequired={isRequired}
          label={label}
          labelHelp={<Popover content={tooltip} maxWidth={tooltipMaxWidth} />}
        >
          <TextInput
            id={id}
            isRequired={isRequired}
            validated={isValid ? 'default' : 'error'}
            {...(isReadOnly ? { readOnlyVariant: 'default' } : {})}
            {...rest}
            {...field}
            type={type as TextInputProps['type']}
            onChange={(event) => {
              field.onChange(event);
            }}
          />
          {(helperText || !isValid) && helperTextContent}
        </FormGroup>
      )}
    </>
  );
}

export default FormField;
