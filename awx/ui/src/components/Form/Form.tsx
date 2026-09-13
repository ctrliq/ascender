import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getIn, setIn } from './paths';

import type {
  Errors,
  FieldValidator,
  FormContextValue,
  Touched,
  Values,
} from './types';

/*
 * The field layer.
 *
 * The surface it has to cover was measured rather than guessed: a form root
 * taking initialValues and onSubmit, a useField returning the familiar triple,
 * and a context whose nine members are the ones the tree reads. Field names are
 * flat, every one of them, so there is no nested path handling here and none is
 * needed. Validation is a function per field, which is what util/validators
 * already exports.
 *
 * The behaviour is pinned in formBehaviour.test.tsx, which was written against
 * formik first and run against both while the tree was mixed.
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

export interface FormProps<V extends object> {
  initialValues: V;
  onSubmit: (values: V, helpers: FormContextValue<V>) => void | Promise<void>;
  /**
   * Validation for the form as a whole, for a rule no single field owns.
   * The schedule form is the one that has one: whether the end of a
   * recurrence makes sense against its start.
   */
  validate?: (values: V) => Errors;
  /**
   * Take the values again when initialValues changes, rather than only on
   * mount. Two forms need it, both of which render before the record they are
   * editing has arrived.
   */
  enableReinitialize?: boolean;
  children: React.ReactNode | ((form: FormContextValue<V>) => React.ReactNode);
}

/** Plain-data deep equality, which is all initialValues ever holds. */
function sameValues(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => sameValues(left[key], right[key]));
}

export function Form<V extends object>({
  initialValues,
  onSubmit,
  validate,
  enableReinitialize = false,
  children,
}: FormProps<V>) {
  const [values, setValuesState] = useState<V>(initialValues);
  /*
   * The latest values, readable without a state updater.
   *
   * Validation needs the values it is validating, and reading them by calling
   * setValuesState with a function that also sets errors would be a setState
   * during render: React reports it as updating one component while rendering
   * another, and it is right.
   */
  const valuesRef = useRef<V>(initialValues);
  valuesRef.current = values;
  const [touched, setTouchedState] = useState<Touched>({});
  const [errors, setErrorsState] = useState<Errors>({});

  // The first initialValues wins for the life of the form unless the caller
  // asks otherwise, which is what formik does.
  const initial = useRef(initialValues);
  const registry = useRef<Registry>({ boxes: new Map() });
  // Handed to onSubmit as its second argument, which one caller destructures
  // setErrors from. A ref because the context is built further down.
  const contextRef = useRef<FormContextValue | null>(null);

  /**
   * Every registered validator, run against a set of values.
   *
   * The whole form rather than the one field that changed, which is what
   * formik does: a change anywhere re-runs everything, so an error that has
   * been fixed elsewhere clears at the same time. Rebuilding the object also
   * means a cleared error leaves nothing behind, which keeps isValid honest.
   */
  const validateRef = useRef(validate);
  validateRef.current = validate;

  const runValidators = useCallback((against: Values): Errors => {
    let found: Errors = { ...(validateRef.current?.(against as V) ?? {}) };
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
      const next = setIn(valuesRef.current, name, value);
      valuesRef.current = next;
      setValuesState(next);
      if (shouldValidate) setErrorsState(runValidators(next));
    },
    [runValidators]
  );

  const setFieldTouched = useCallback(
    (name: string, isTouched = true, shouldValidate = true) => {
      setTouchedState((prev) => setIn(prev, name, isTouched));
      if (shouldValidate) setErrorsState(runValidators(valuesRef.current));
    },
    [runValidators]
  );

  const setFieldError = useCallback(
    (name: string, error: string | undefined) => {
      setErrorsState((prev) => setIn(prev, name, error));
    },
    []
  );

  const resetForm = useCallback(
    (next?: { values?: V; touched?: Touched; errors?: Errors }) => {
      const back = next?.values ?? initial.current;
      valuesRef.current = back;
      setValuesState(back);
      setTouchedState(next?.touched ?? {});
      setErrorsState(next?.errors ?? {});
    },
    []
  );

  const validateField = useCallback((name: string) => {
    const validate = registry.current.boxes.get(name)?.current as
      ((value: unknown) => string | undefined) | undefined;
    if (!validate) return;
    const error = validate(getIn(valuesRef.current, name));
    setErrorsState((prev) => setIn(prev, name, error));
  }, []);

  useEffect(() => {
    if (!enableReinitialize) return;
    if (sameValues(initial.current, initialValues)) return;
    initial.current = initialValues;
    valuesRef.current = initialValues;
    setValuesState(initialValues);
    setTouchedState({});
    setErrorsState({});
  }, [enableReinitialize, initialValues]);

  const handleSubmit = useCallback(
    (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.();
      const current = valuesRef.current;
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
        onSubmit(current, contextRef.current as FormContextValue<V>);
      }
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
      validateField,
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
      validateField,
      setFieldValue,
      setFieldTouched,
      setFieldError,
      resetForm,
    ]
  );

  contextRef.current = context as FormContextValue;

  return (
    <RegistryContext.Provider value={registry.current}>
      <FormContext.Provider value={context as FormContextValue}>
        {typeof children === 'function' ? children(context) : children}
      </FormContext.Provider>
    </RegistryContext.Provider>
  );
}

export function useFormContext<
  V extends object = Values,
>(): FormContextValue<V> {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext was called outside a form');
  }
  return context as FormContextValue<V>;
}

/** The validator registry the enclosing form keeps. */
export function useFieldRegistry(): Registry {
  const registry = useContext(RegistryContext);
  if (!registry) {
    throw new Error('useField was called outside a form');
  }
  return registry;
}

export default Form;
