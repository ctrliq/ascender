/*
 * What a form does here.
 *
 * These were written against formik, before any replacement existed, because
 * the risk in leaving it was never the API. It was the behaviour the API
 * implies and nothing states: when a validator runs, when a field counts as
 * touched, what isValid says about a pristine form whose required field is
 * empty. None of that is in a type signature, and all of it is what someone
 * would notice.
 *
 * While the tree held both, every test here ran twice, once against each, and
 * a difference in either direction was a failure. Formik is gone now, so they
 * run once. The table below is left as a table so a second implementation can
 * be put beside this one the same way, should there ever be a reason to.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormRoot, useField, useFormContext } from 'components/Form';

type Validator = (value: never) => string | undefined;
type Bag = Record<string, unknown>;

interface FieldLike {
  name: string;
  value: unknown;
  onChange: (event: unknown) => void;
  onBlur: (event?: unknown) => void;
}
interface MetaLike {
  value: unknown;
  initialValue?: unknown;
  touched: boolean;
  error?: string;
}
interface HelpersLike {
  setValue: (value: unknown, shouldValidate?: boolean) => void;
  setTouched: (touched: boolean, shouldValidate?: boolean) => void;
  setError: (error: string | undefined) => void;
}
interface ContextLike {
  values: Bag;
  errors: Bag;
  touched: Bag;
  isValid: boolean;
  handleSubmit: (event?: unknown) => void;
  setFieldValue: (n: string, v: unknown, shouldValidate?: boolean) => void;
  setFieldTouched: (n: string, t?: boolean, shouldValidate?: boolean) => void;
  setFieldError: (n: string, e: string | undefined) => void;
  resetForm: () => void;
}
interface RootLike {
  handleSubmit: (event?: unknown) => void;
  values: Bag;
  setFieldValue: (n: string, v: unknown, shouldValidate?: boolean) => void;
  isValid: boolean;
  initialValues: Bag;
}

interface Implementation {
  name: string;
  Root: React.ComponentType<{
    initialValues: Bag;
    onSubmit: (values: Bag, helpers: never) => void | Promise<void>;
    children: (form: RootLike) => React.ReactNode;
  }>;
  useField: (
    config: string | { name: string; validate?: Validator }
  ) => [FieldLike, MetaLike, HelpersLike];
  useFormContext: () => ContextLike;
}

const implementations: Implementation[] = [
  {
    name: 'the field layer',
    Root: FormRoot as unknown as Implementation['Root'],
    useField: useField as unknown as Implementation['useField'],
    useFormContext:
      useFormContext as unknown as Implementation['useFormContext'],
  },
];

const required = (value: unknown) => (value ? undefined : 'required');
const never = () => 'always wrong';
const at = (id: string) => screen.getByTestId(id).textContent;
const press = (name: string) =>
  screen.getByRole('button', { name }) as HTMLElement;

describe.each(implementations)('a form, per $name', (impl) => {
  const { useField, useFormContext, Root } = impl;

  /** A field showing everything the codebase reads off useField. */
  function Probe({ name, validate }: { name: string; validate?: Validator }) {
    const [field, meta, helpers] = useField(
      validate ? { name, validate } : { name }
    );
    return (
      <div>
        <input
          aria-label={name}
          name={field.name}
          value={String(field.value ?? '')}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
        <output data-testid={`${name}-error`}>{meta.error ?? ''}</output>
        <output data-testid={`${name}-touched`}>{String(meta.touched)}</output>
        <output data-testid={`${name}-initial`}>
          {String(meta.initialValue ?? '')}
        </output>
        <button type="button" onClick={() => helpers.setValue('set')}>
          {`field set ${name}`}
        </button>
        <button type="button" onClick={() => helpers.setTouched(true)}>
          {`field touch ${name}`}
        </button>
        <button type="button" onClick={() => helpers.setError('forced')}>
          {`field error ${name}`}
        </button>
        <button
          type="button"
          onClick={() => field.onChange({ target: { name, value: 'made up' } })}
        >
          {`hand made event ${name}`}
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              field.onChange(null);
            } catch {
              (window as unknown as Bag).onChangeNullThrew = true;
            }
          }}
        >
          {`null change ${name}`}
        </button>
      </div>
    );
  }

  /** Everything the codebase reads off the form context. */
  function ContextProbe() {
    const ctx = useFormContext();
    return (
      <div>
        <output data-testid="values">{JSON.stringify(ctx.values)}</output>
        <output data-testid="errors">{JSON.stringify(ctx.errors)}</output>
        <output data-testid="touched">{JSON.stringify(ctx.touched)}</output>
        <output data-testid="isValid">{String(ctx.isValid)}</output>
        <button type="button" onClick={() => ctx.setFieldValue('a', 'ctx')}>
          context set a
        </button>
        <button type="button" onClick={() => ctx.setFieldTouched('a', true)}>
          context touch a
        </button>
        <button
          type="button"
          onClick={() => ctx.setFieldError('a', 'ctx error')}
        >
          context error a
        </button>
        <button
          type="button"
          onClick={() => ctx.setFieldValue('a', 'quiet', false)}
        >
          context set a without validating
        </button>
        <button
          type="button"
          onClick={() => ctx.setFieldTouched('a', true, false)}
        >
          context touch a without validating
        </button>
        <button type="button" onClick={() => ctx.resetForm()}>
          reset
        </button>
      </div>
    );
  }

  function Harness({
    initialValues = { a: '' },
    onSubmit = () => {},
    validate,
  }: {
    initialValues?: Bag;
    onSubmit?: (values: Bag, helpers: never) => void | Promise<void>;
    validate?: Validator;
  }) {
    return (
      <Root initialValues={initialValues} onSubmit={onSubmit}>
        {(form) => (
          <form onSubmit={form.handleSubmit}>
            <Probe name="a" validate={validate} />
            <ContextProbe />
            <button type="submit">submit</button>
          </form>
        )}
      </Root>
    );
  }

  describe('initial state', () => {
    test('a field takes its value and its initialValue from initialValues', () => {
      render(<Harness initialValues={{ a: 'first' }} />);

      expect(screen.getByLabelText('a')).toHaveValue('first');
      expect(at('a-initial')).toBe('first');
    });

    test('nothing is touched, and nothing has an error', () => {
      render(<Harness validate={required} />);

      expect(at('a-touched')).toBe('false');
      expect(at('a-error')).toBe('');
      expect(at('touched')).toBe('{}');
      expect(at('errors')).toBe('{}');
    });

    test('a pristine form with an empty required field still says it is valid', () => {
      render(<Harness validate={required} />);

      // the validator has not run, so there is no error to be invalid about
      expect(at('isValid')).toBe('true');
    });
  });

  describe('typing', () => {
    test('field.onChange takes the DOM event and writes the value', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.type(screen.getByLabelText('a'), 'xy');

      expect(screen.getByLabelText('a')).toHaveValue('xy');
      expect(at('values')).toBe('{"a":"xy"}');
    });

    test('typing runs the validator, before the field is touched', async () => {
      const user = userEvent.setup();
      render(<Harness initialValues={{ a: 'x' }} validate={required} />);

      await user.clear(screen.getByLabelText('a'));

      await waitFor(() => expect(at('a-error')).toBe('required'));
      expect(at('a-touched')).toBe('false');
    });

    test('typing does not mark a field touched', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.type(screen.getByLabelText('a'), 'x');

      expect(at('a-touched')).toBe('false');
    });
  });

  describe('blur', () => {
    test('blurring marks the field touched', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(screen.getByLabelText('a'));
      await user.tab();

      await waitFor(() => expect(at('a-touched')).toBe('true'));
    });

    test('blurring runs the validator', async () => {
      const user = userEvent.setup();
      render(<Harness validate={required} />);

      await user.click(screen.getByLabelText('a'));
      await user.tab();

      await waitFor(() => expect(at('a-error')).toBe('required'));
    });
  });

  describe('submitting', () => {
    test('a valid form calls onSubmit with the values', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<Harness initialValues={{ a: 'yes' }} onSubmit={onSubmit} />);

      await user.click(press('submit'));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ a: 'yes' });
    });

    test('an invalid form does not call onSubmit', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<Harness onSubmit={onSubmit} validate={required} />);

      await user.click(press('submit'));

      await waitFor(() => expect(at('a-error')).toBe('required'));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('submitting marks every field touched, whether or not it was visited', async () => {
      const user = userEvent.setup();
      render(<Harness validate={required} />);

      await user.click(press('submit'));

      await waitFor(() => expect(at('a-touched')).toBe('true'));
    });

    test('an error found at submit makes the form invalid', async () => {
      const user = userEvent.setup();
      render(<Harness validate={required} />);

      await user.click(press('submit'));

      await waitFor(() => expect(at('isValid')).toBe('false'));
    });
  });

  describe('the helpers a field is handed', () => {
    test('setValue writes the value', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(press('field set a'));

      await waitFor(() => expect(at('values')).toBe('{"a":"set"}'));
    });

    test('setValue runs the validator', async () => {
      const user = userEvent.setup();
      render(<Harness validate={never} />);

      await user.click(press('field set a'));

      await waitFor(() => expect(at('a-error')).toBe('always wrong'));
    });

    test('setTouched marks the field touched', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(press('field touch a'));

      await waitFor(() => expect(at('a-touched')).toBe('true'));
    });

    test('setError puts an error there without a validator saying so', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(press('field error a'));

      await waitFor(() => expect(at('a-error')).toBe('forced'));
    });
  });

  describe('the change shapes the codebase hands to field.onChange', () => {
    test('an object shaped like an event is accepted, and its name is used', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(press('hand made event a'));

      await waitFor(() => expect(at('values')).toBe('{"a":"made up"}'));
    });

    // A change handler reads `target` off what it is handed, so handing it
    // nothing throws. Pinned because it is the behaviour, not because anything
    // relies on it: InventoryStep used to deselect this way and now sets the
    // value directly, the way every other single-select step already did.
    test('onChange(null) throws, and leaves the value alone', async () => {
      const user = userEvent.setup();
      render(<Harness initialValues={{ a: 'kept' }} />);

      await user.click(press('null change a'));

      expect((window as unknown as Bag).onChangeNullThrew).toBe(true);
      expect(at('values')).toBe('{"a":"kept"}');
    });
  });

  describe('what the form root hands its children', () => {
    test('handleSubmit, values, setFieldValue, isValid and initialValues', () => {
      const seen: string[] = [];
      render(
        <Root initialValues={{ a: '1' }} onSubmit={() => {}}>
          {(form) => {
            seen.push(
              ...(
                [
                  'handleSubmit',
                  'values',
                  'setFieldValue',
                  'isValid',
                  'initialValues',
                ] as const
              ).filter((k) => form[k] !== undefined)
            );
            return <form onSubmit={form.handleSubmit} />;
          }}
        </Root>
      );

      expect(new Set(seen)).toEqual(
        new Set([
          'handleSubmit',
          'values',
          'setFieldValue',
          'isValid',
          'initialValues',
        ])
      );
    });

    // UserForm compares the two password fields and calls setErrors on the
    // bag handed as the second argument, which is the only caller that takes
    // it and the reason it exists here.
    test('onSubmit is handed a bag it can set errors through', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn(
        (_values: Bag, helpers: { setErrors?: (e: Bag) => void }) => {
          helpers.setErrors?.({ a: 'from submit' });
        }
      );
      render(<Harness initialValues={{ a: 'v' }} onSubmit={onSubmit} />);

      await user.click(press('submit'));

      await waitFor(() => expect(at('a-error')).toBe('from submit'));
    });

    test('onSubmit is given the values', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<Harness initialValues={{ a: 'v' }} onSubmit={onSubmit} />);

      await user.click(press('submit'));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ a: 'v' });
    });
  });

  // Names are not all single keys. The schedule subform builds
  // `${prefix}.startDate` and the credential plugin fields build
  // `inputs.${id}`, so a name is a path and every read and write walks it.
  describe('field names that are paths', () => {
    function Nested() {
      return (
        <Root
          initialValues={{ inputs: { host: 'example' } }}
          onSubmit={() => {}}
        >
          {() => <Probe name="inputs.host" validate={required} />}
        </Root>
      );
    }

    test('a nested field reads its value and its initialValue', () => {
      render(<Nested />);

      expect(screen.getByLabelText('inputs.host')).toHaveValue('example');
      expect(at('inputs.host-initial')).toBe('example');
    });

    test('typing writes through the path rather than over it', async () => {
      const user = userEvent.setup();
      render(<Nested />);

      await user.clear(screen.getByLabelText('inputs.host'));
      await user.type(screen.getByLabelText('inputs.host'), 'other');

      expect(screen.getByLabelText('inputs.host')).toHaveValue('other');
    });

    test('submitting validates and touches a nested field too', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <Root initialValues={{ inputs: { host: '' } }} onSubmit={onSubmit}>
          {(form) => (
            <form onSubmit={form.handleSubmit}>
              <Probe name="inputs.host" validate={required} />
              <button type="submit">submit</button>
            </form>
          )}
        </Root>
      );

      await user.click(press('submit'));

      await waitFor(() => expect(at('inputs.host-error')).toBe('required'));
      expect(at('inputs.host-touched')).toBe('true');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('a nested field carries its own error and touched flag', async () => {
      const user = userEvent.setup();
      render(<Nested />);

      await user.clear(screen.getByLabelText('inputs.host'));
      await waitFor(() => expect(at('inputs.host-error')).toBe('required'));

      await user.click(screen.getByLabelText('inputs.host'));
      await user.tab();
      await waitFor(() => expect(at('inputs.host-touched')).toBe('true'));
    });
  });

  // A number input hands over a string, and a form that stores the string
  // where a number was stored changes what the API is sent.
  describe('the value a control type means', () => {
    function Numeric() {
      const [field] = useField({ name: 'count' });
      return (
        <input
          aria-label="count"
          type="number"
          name="count"
          value={String(field.value ?? '')}
          onChange={field.onChange}
        />
      );
    }

    test('a number input writes a number, not the string of one', async () => {
      const user = userEvent.setup();
      render(
        <Root initialValues={{ count: 0 }} onSubmit={() => {}}>
          {() => (
            <>
              <Numeric />
              <ContextProbe />
            </>
          )}
        </Root>
      );

      await user.clear(screen.getByLabelText('count'));
      await user.type(screen.getByLabelText('count'), '134');

      await waitFor(() => expect(at('values')).toBe('{"count":134}'));
    });

    test('a number input that is emptied writes an empty string', async () => {
      const user = userEvent.setup();
      render(
        <Root initialValues={{ count: 7 }} onSubmit={() => {}}>
          {() => (
            <>
              <Numeric />
              <ContextProbe />
            </>
          )}
        </Root>
      );

      await user.clear(screen.getByLabelText('count'));

      await waitFor(() => expect(at('values')).toBe('{"count":""}'));
    });
  });

  describe('the form context', () => {
    test('values carries every field', () => {
      render(<Harness initialValues={{ a: '1', b: '2' }} />);

      expect(at('values')).toBe('{"a":"1","b":"2"}');
    });

    test('setFieldValue writes a field from outside it', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(press('context set a'));

      await waitFor(() =>
        expect(screen.getByLabelText('a')).toHaveValue('ctx')
      );
    });

    test('setFieldTouched and setFieldError reach the field', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(press('context touch a'));
      await user.click(press('context error a'));

      await waitFor(() => expect(at('a-touched')).toBe('true'));
      expect(at('a-error')).toBe('ctx error');
    });

    // A run of call sites pass a third argument to say "do not validate this
    // one", which is the difference between a field the user changed and one
    // the form changed underneath them. A lookup clearing a dependent field
    // uses it so that field does not show an error the user did not cause.
    test('setFieldValue with shouldValidate false skips the validator', async () => {
      const user = userEvent.setup();
      render(<Harness validate={never} />);

      await user.click(press('context set a without validating'));

      await waitFor(() => expect(at('values')).toBe('{"a":"quiet"}'));
      expect(at('a-error')).toBe('');
    });

    test('setFieldTouched with shouldValidate false skips the validator', async () => {
      const user = userEvent.setup();
      render(<Harness validate={never} />);

      await user.click(press('context touch a without validating'));

      await waitFor(() => expect(at('a-touched')).toBe('true'));
      expect(at('a-error')).toBe('');
    });

    test('setFieldTouched validates by default', async () => {
      const user = userEvent.setup();
      render(<Harness validate={never} />);

      await user.click(press('context touch a'));

      await waitFor(() => expect(at('a-error')).toBe('always wrong'));
    });

    test('resetForm puts the values, touched and errors back', async () => {
      const user = userEvent.setup();
      render(<Harness initialValues={{ a: 'first' }} />);

      await user.clear(screen.getByLabelText('a'));
      await user.type(screen.getByLabelText('a'), 'changed');
      await user.click(press('context touch a'));
      await waitFor(() => expect(at('a-touched')).toBe('true'));

      await user.click(press('reset'));

      await waitFor(() =>
        expect(screen.getByLabelText('a')).toHaveValue('first')
      );
      expect(at('a-touched')).toBe('false');
      expect(at('errors')).toBe('{}');
    });
  });
});
