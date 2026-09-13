import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { FormikContext } from 'formik';

import { getIn, setIn } from './paths';

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

  /**
   * Every registered validator, run against a set of values.
   *
   * The whole form rather than the one field that changed, which is what
   * formik does: a change anywhere re-runs everything, so an error that has
   * been fixed elsewhere clears at the same time. Rebuilding the object also
   * means a cleared error leaves nothing behind, which keeps isValid honest.
   */
  const runValidators = useCallback((against: Values): Errors => {
    let found: Errors = {};
    registry.current.boxes.forEach((box, name) => {
      const validate = box.current as
        ((value: unknown) => string | undefined) | undefined;
      const error = validate?.(getIn(against, name));
      if (error !== undefined) found = setIn(found, name, error);
    });
    return found;
  }, []);

  const setFieldValue = useCallback(
    (name: string, value: unknown, shouldValidate = true) => {
      setValuesState((prev) => {
        const next = setIn(prev, name, value);
        if (shouldValidate) setErrorsState(runValidators(next));
        return next;
      });
    },
    [runValidators]
  );

  const setFieldTouched = useCallback(
    (name: string, isTouched = true, shouldValidate = true) => {
      setTouchedState((prev) => setIn(prev, name, isTouched));
      if (shouldValidate) {
        setValuesState((prev) => {
          setErrorsState(runValidators(prev));
          return prev;
        });
      }
    },
    [runValidators]
  );

  const setFieldError = useCallback(
    (name: string, error: string | undefined) => {
      setErrorsState((prev) => setIn(prev, name, error));
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
        // Every field is marked touched, visited or not, which is what makes a
        // required field nobody opened show its error.
        setTouchedState((prev) => {
          let next = prev;
          Object.keys(current).forEach((key) => {
            next = setIn(next, key, true);
          });
          registry.current.boxes.forEach((_box, name) => {
            next = setIn(next, name, true);
          });
          return next;
        });

        const found = runValidators(current);
        setErrorsState(found);
        if (Object.keys(found).length === 0) {
          onSubmit(current);
        }
        return current;
      });
    },
    [onSubmit, runValidators]
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
  const own = useContext(FormContext);
  // While the tree is mixed a form may still be a formik one. Its context
  // carries the same members under the same names, so it answers here
  // unchanged, and this branch goes when the last <Formik> does. Read
  // directly rather than through useFormikContext, which warns to the console
  // when it is called with no <Formik> above it.
  const formik = useContext(FormikContext);
  const context = own ?? (formik as unknown as FormContextValue | undefined);
  if (!context) {
    throw new Error('useFormContext was called outside a form');
  }
  return context as FormContextValue<V>;
}

/** The validator registry, or null when the form above is a formik one. */
export function useOptionalFieldRegistry(): Registry | null {
  return useContext(RegistryContext);
}

export default Form;
