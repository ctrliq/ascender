/*
 * What a form does here, asked of two implementations.
 *
 * The roadmap asks for an exit from formik, and the risk in that is not the
 * API, which is small: five runtime names, flat field keys, no schema
 * validation and no field arrays. The risk is the behaviour those names imply
 * and nothing states. When a validator runs, when a field counts as touched,
 * what isValid says about a pristine form whose required field is empty: none
 * of that is in a type signature, and all of it is what someone would notice.
 *
 * So every test below runs twice, once against formik and once against the
 * field layer meant to replace it. They were written against formik first, so
 * they describe today rather than anything intended, and a difference in
 * either direction is a failure.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Formik, useField as useFormikField, useFormikContext } from 'formik';
import {
  Form as OwnForm,
  useField as useOwnField,
  useFormContext as useOwnFormContext,
} from 'components/Form';

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
    onSubmit: (values: Bag) => void | Promise<void>;
    children: (form: RootLike) => React.ReactNode;
  }>;
  useField: (
    config: string | { name: string; validate?: Validator }
  ) => [FieldLike, MetaLike, HelpersLike];
  useFormContext: () => ContextLike;
}

const implementations: Implementation[] = [
  {
    name: 'formik',
    Root: Formik as unknown as Implementation['Root'],
    useField: useFormikField as unknown as Implementation['useField'],
    useFormContext:
      useFormikContext as unknown as Implementation['useFormContext'],
  },
  {
    name: 'the field layer',
    Root: OwnForm as unknown as Implementation['Root'],
    useField: useOwnField as unknown as Implementation['useField'],
    useFormContext:
      useOwnFormContext as unknown as Implementation['useFormContext'],
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
    onSubmit?: (values: Bag) => void | Promise<void>;
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

    // Recorded rather than desired. InventoryStep deselects with
    // `field.onChange(null)`, and a form reads `target` off what it is given,
    // so that call throws where it stands. Pinned as it behaves so a port is
    // not the change that quietly fixes it: that wants its own.
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

    test('onSubmit is given the values', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<Harness initialValues={{ a: 'v' }} onSubmit={onSubmit} />);

      await user.click(press('submit'));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ a: 'v' });
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
