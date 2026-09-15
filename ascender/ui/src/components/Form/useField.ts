import { useCallback, useEffect, useMemo, useRef } from 'react';

import { fieldNameFromEvent, valueFromEvent } from './changeValue';
import { useFieldRegistry, useFormContext } from './Form';
import { getIn } from './paths';
import type {
  FieldHelpers,
  FieldMeta,
  FieldProps,
  FieldValidator,
} from './types';

export interface UseFieldConfig {
  name: string;
  validate?: FieldValidator;
}

/**
 * A field's value, what is known about it, and the three ways to write to it.
 *
 * Takes a name, or a name and a validator, which is the only shape the tree
 * uses. The triple it returns is the one the call sites already destructure,
 * so a screen moving off formik changes an import and nothing else.
 *
 */
/*
 * The value type defaults to any, which formik's own useField does too. It is
 * what keeps a screen moving across a changed import rather than a changed
 * signature: a call site that says useField({ name }) and then treats the
 * value as a string is relying on that looseness today. Callers that want the
 * type can pass it, and the ones that do not are no worse off than they were.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function useField<V = any>(
  nameOrConfig: string | UseFieldConfig
): [FieldProps<V>, FieldMeta<V>, FieldHelpers<V>] {
  const config: UseFieldConfig =
    typeof nameOrConfig === 'string' ? { name: nameOrConfig } : nameOrConfig;
  const { name } = config;

  const registry = useFieldRegistry();
  const context = useFormContext();

  // The box holds the latest validator, so the registry never runs a closure
  // from a render that has been replaced.
  const box = useRef<{ current: FieldValidator | undefined }>({
    current: undefined,
  });
  box.current.current = config.validate;

  useEffect(() => {
    const { boxes } = registry;
    const mine = box.current;
    boxes.set(name, mine);
    return () => {
      if (boxes.get(name) === mine) boxes.delete(name);
    };
  }, [name, registry]);

  const { setFieldValue, setFieldTouched, setFieldError } = context;

  const currentRef = useRef<unknown>(undefined);
  currentRef.current = getIn(context.values, name);

  const onChange = useCallback(
    (event: unknown) => {
      const value = valueFromEvent(event, currentRef.current);
      setFieldValue(fieldNameFromEvent(event) || name, value);
    },
    [name, setFieldValue]
  );

  const onBlur = useCallback(() => {
    setFieldTouched(name, true);
  }, [name, setFieldTouched]);

  const value = getIn(context.values, name) as V;

  const field = useMemo<FieldProps<V>>(
    () => ({ name, value, onChange, onBlur }),
    [name, value, onChange, onBlur]
  );

  const meta = useMemo<FieldMeta<V>>(
    () => ({
      value,
      initialValue: getIn(context.initialValues, name) as V | undefined,
      touched: Boolean(getIn(context.touched, name)),
      error: getIn(context.errors, name) as string | undefined,
    }),
    [value, context.initialValues, context.touched, context.errors, name]
  );

  const helpers = useMemo<FieldHelpers<V>>(
    () => ({
      setValue: (next: V, shouldValidate = true) =>
        setFieldValue(name, next, shouldValidate),
      setTouched: (next: boolean, shouldValidate = true) =>
        setFieldTouched(name, next, shouldValidate),
      setError: (error: string | undefined) => setFieldError(name, error),
    }),
    [name, setFieldValue, setFieldTouched, setFieldError]
  );

  return [field, meta, helpers];
}
