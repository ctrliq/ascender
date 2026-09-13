import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useFieldRegistry, useFormContext } from './Form';
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

/** Read a value off whatever a control handed the change handler. */
function valueFromEvent(event: unknown): { name?: string; value: unknown } {
  const target = (event as { target: Record<string, unknown> }).target;
  if (target.type === 'checkbox') {
    return { name: target.name as string, value: target.checked };
  }
  return { name: target.name as string, value: target.value };
}

/**
 * A field's value, what is known about it, and the three ways to write to it.
 *
 * Takes a name, or a name and a validator, which is the only shape the tree
 * uses. The triple it returns is the one the call sites already destructure,
 * so a screen moving off formik changes an import and nothing else.
 */
export default function useField<V = unknown>(
  nameOrConfig: string | UseFieldConfig
): [FieldProps<V>, FieldMeta<V>, FieldHelpers<V>] {
  const config: UseFieldConfig =
    typeof nameOrConfig === 'string' ? { name: nameOrConfig } : nameOrConfig;
  const { name } = config;

  const form = useFormContext();
  const registry = useFieldRegistry();

  // The box holds the latest validator, so the registry never runs a closure
  // from a render that has been replaced.
  const box = useRef<{ current: FieldValidator | undefined }>({
    current: undefined,
  });
  box.current.current = config.validate;

  useEffect(() => {
    const boxes = registry.boxes;
    const mine = box.current;
    boxes.set(name, mine);
    return () => {
      if (boxes.get(name) === mine) boxes.delete(name);
    };
  }, [name, registry]);

  const { setFieldValue, setFieldTouched, setFieldError } = form;

  const onChange = useCallback(
    (event: unknown) => {
      const { name: from, value } = valueFromEvent(event);
      setFieldValue(from || name, value);
    },
    [name, setFieldValue]
  );

  const onBlur = useCallback(() => {
    setFieldTouched(name, true);
  }, [name, setFieldTouched]);

  const value = form.values[name] as V;

  const field = useMemo<FieldProps<V>>(
    () => ({ name, value, onChange, onBlur }),
    [name, value, onChange, onBlur]
  );

  const meta = useMemo<FieldMeta<V>>(
    () => ({
      value,
      initialValue: form.initialValues[name] as V | undefined,
      touched: Boolean(form.touched[name]),
      error: form.errors[name],
    }),
    [value, form.initialValues, form.touched, form.errors, name]
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
