/** What a validator is here: the same shape util/validators already exports. */
export type FieldValidator = (
  value: never
) => string | undefined | Promise<string | undefined>;

export type Values = Record<string, unknown>;
export type Touched = Record<string, boolean>;
export type Errors = Record<string, string | undefined>;

/** The half of a field a control binds to. */
export interface FieldProps<V = unknown> {
  name: string;
  value: V;
  onChange: (event: unknown) => void;
  onBlur: (event?: unknown) => void;
}

/** What the field is, as opposed to what it does. */
export interface FieldMeta<V = unknown> {
  value: V;
  initialValue: V | undefined;
  touched: boolean;
  error: string | undefined;
}

/** The three ways a caller writes to a field without going through a control. */
export interface FieldHelpers<V = unknown> {
  setValue: (value: V, shouldValidate?: boolean) => void;
  setTouched: (touched: boolean, shouldValidate?: boolean) => void;
  setError: (error: string | undefined) => void;
}

/** What useFormContext answers with, which is what the tree actually reads. */
export interface FormContextValue<V extends Values = Values> {
  values: V;
  errors: Errors;
  touched: Touched;
  isValid: boolean;
  initialValues: V;
  handleSubmit: (event?: { preventDefault?: () => void }) => void;
  setFieldValue: (
    name: string,
    value: unknown,
    shouldValidate?: boolean
  ) => void;
  setFieldTouched: (
    name: string,
    touched?: boolean,
    shouldValidate?: boolean
  ) => void;
  setFieldError: (name: string, error: string | undefined) => void;
  setValues: (values: V) => void;
  setErrors: (errors: Errors) => void;
  resetForm: () => void;
}
