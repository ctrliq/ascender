/*
 * The loose spots, and they are loose on purpose: formik types these the same
 * way, and a stricter shape here would mean a changed signature at every call
 * site rather than a changed import. A validator is handed whatever its field
 * holds, and touched and errors mirror the shape of the values, which is
 * nested wherever a field name is a path.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** What a validator is here: the same shape util/validators already exports. */
export type FieldValidator = (
  value: any
) => string | undefined | Promise<string | undefined>;

export type Values = Record<string, any>;
export type Touched = Record<string, any>;
export type Errors = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

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

/**
 * The bag onSubmit is handed as its second argument.
 *
 * One caller takes it: UserForm compares the two password fields and calls
 * setErrors when they differ. It is the whole context rather than a subset,
 * which is what formik hands over too.
 */
export type SubmitHelpers<V extends object = Values> = FormContextValue<V>;

/** What useFormContext answers with, which is what the tree actually reads. */
export interface FormContextValue<V extends object = Values> {
  values: V;
  errors: Errors;
  touched: Touched;
  isValid: boolean;
  initialValues: V;
  /*
   * Typed loosely so a form still holding formik's handleSubmit is assignable
   * to this while the tree is mixed. A submit handler is handed a form event
   * and reads preventDefault off it; the rest of the event is nobody's
   * business here.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleSubmit: (event?: any) => void;
  /** Re-run one field's validator. JobTemplateForm asks for this by name. */
  validateField: (name: string) => void;
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
  /**
   * Put the form back. Six callers hand over the state to put it back to,
   * which is how a prompt wizard reopens on the answers it was given.
   */
  resetForm: (next?: {
    values?: V;
    touched?: Touched;
    errors?: Errors;
  }) => void;
}

/** The errors for a set of values, keyed the way the values are. */
export type FormErrors<V extends object = Values> = Partial<
  Record<keyof V & string, string>
>;
