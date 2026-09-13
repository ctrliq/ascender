import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  Errors,
  FieldValidator,
  FormContextValue,
  Touched,
  Values,
} from './types';

/*
 * The field layer, matching what formik does for this application rather than
 * what formik does.
 *
 * The surface it has to cover was measured rather than guessed: a form root
 * taking initialValues and onSubmit, a useField returning the familiar triple,
 * and a context whose nine members are the ones the tree reads. Field names are
 * flat, every one of them, so there is no nested path handling here and none is
 * needed. Validation is a function per field, which is what util/validators
 * already exports.
 *
 * The behaviour is pinned in formBehaviour.test.tsx, which runs against this
 * and against formik and expects the same answers from both.
 */

const FormContext = createContext<FormContextValue | null>(null);

/** A box per field, so the registry always holds the latest validator. */
interface ValidatorBox {
  current: FieldValidator | undefined;
}

interface Registry {
  boxes: Map<string, ValidatorBox>;
}

const RegistryContext = createContext<Registry | null>(null);

export interface FormProps<V extends Values> {
  initialValues: V;
  onSubmit: (values: V) => void | Promise<void>;
  children: React.ReactNode | ((form: FormContextValue<V>) => React.ReactNode);
}

export function Form<V extends Values>({
  initialValues,
  onSubmit,
  children,
}: FormProps<V>) {
  const [values, setValuesState] = useState<V>(initialValues);
  const [touched, setTouchedState] = useState<Touched>({});
  const [errors, setErrorsState] = useState<Errors>({});

  // The first initialValues wins for the life of the form, which is what
  // formik does without enableReinitialize, and nothing here passes it.
  const initial = useRef(initialValues);
  const registry = useRef<Registry>({ boxes: new Map() });

  /** Run one field's validator, and write or clear its error. */
  const validateField = useCallback((name: string, value: unknown) => {
    const validate = registry.current.boxes.get(name)?.current;
    if (!validate) return;
    const error = (validate as (v: unknown) => string | undefined)(value);
    setErrorsState((prev) => {
      if (error === undefined) {
        if (!(name in prev)) return prev;
        const next = { ...prev };
        delete next[name];
        return next;
      }
      if (prev[name] === error) return prev;
      return { ...prev, [name]: error };
    });
  }, []);

  const setFieldValue = useCallback(
    (name: string, value: unknown, shouldValidate = true) => {
      setValuesState((prev) => ({ ...prev, [name]: value }));
      if (shouldValidate) validateField(name, value);
    },
    [validateField]
  );

  const setFieldTouched = useCallback(
    (name: string, isTouched = true, shouldValidate = true) => {
      setTouchedState((prev) => ({ ...prev, [name]: isTouched }));
      if (shouldValidate) {
        setValuesState((prev) => {
          validateField(name, prev[name]);
          return prev;
        });
      }
    },
    [validateField]
  );

  const setFieldError = useCallback(
    (name: string, error: string | undefined) => {
      setErrorsState((prev) => ({ ...prev, [name]: error }));
    },
    []
  );

  const resetForm = useCallback(() => {
    setValuesState(initial.current);
    setTouchedState({});
    setErrorsState({});
  }, []);

  const handleSubmit = useCallback(
    (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.();
      setValuesState((current) => {
        // Every key in values is marked touched, visited or not, which is what
        // makes a required field that was never opened show its error.
        const allTouched: Touched = {};
        Object.keys(current).forEach((key) => {
          allTouched[key] = true;
        });
        setTouchedState((prev) => ({ ...prev, ...allTouched }));

        const found: Errors = {};
        registry.current.boxes.forEach((box, name) => {
          const error = (
            box.current as ((v: unknown) => string | undefined) | undefined
          )?.(current[name]);
          if (error !== undefined) found[name] = error;
        });
        setErrorsState(found);
        if (Object.keys(found).length === 0) {
          onSubmit(current);
        }
        return current;
      });
    },
    [onSubmit]
  );

  const context = useMemo<FormContextValue<V>>(
    () => ({
      values,
      errors,
      touched,
      isValid: Object.keys(errors).length === 0,
      initialValues: initial.current,
      handleSubmit,
      setFieldValue,
      setFieldTouched,
      setFieldError,
      setValues: setValuesState,
      setErrors: setErrorsState,
      resetForm,
    }),
    [
      values,
      errors,
      touched,
      handleSubmit,
      setFieldValue,
      setFieldTouched,
      setFieldError,
      resetForm,
    ]
  );

  return (
    <RegistryContext.Provider value={registry.current}>
      <FormContext.Provider value={context as FormContextValue}>
        {typeof children === 'function' ? children(context) : children}
      </FormContext.Provider>
    </RegistryContext.Provider>
  );
}

export function useFormContext<
  V extends Values = Values,
>(): FormContextValue<V> {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext was called outside a Form');
  }
  return context as FormContextValue<V>;
}

export function useFieldRegistry(): Registry {
  const registry = useContext(RegistryContext);
  if (!registry) {
    throw new Error('useField was called outside a Form');
  }
  return registry;
}

export default Form;
