/*
 * What formik does today, written down.
 *
 * The roadmap asks for an exit from formik, and the risk in that is not the
 * API, which is small here: five runtime names, flat field keys, no schema
 * validation and no field arrays. The risk is the behaviour those names imply,
 * which nothing states. When a validator runs, when a field counts as touched,
 * what isValid says about a pristine form with an empty required field: none
 * of that is in a type signature, and all of it is what a user would notice.
 *
 * So these are written against formik, before any replacement exists. They are
 * a description of today rather than of anything intended, and a replacement
 * that passes them unchanged is a replacement that nobody has to inspect the
 * forms to trust.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Formik, useField, useFormikContext } from 'formik';
import type { FieldValidator } from 'formik';

const required = (value: unknown) => (value ? undefined : 'required');

/** A field that shows everything the codebase reads off useField. */
function Probe({
  name,
  validate,
}: {
  name: string;
  validate?: FieldValidator;
}) {
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
            (field.onChange as (v: unknown) => void)(null);
          } catch (err) {
            (
              window as unknown as { onChangeNullThrew?: boolean }
            ).onChangeNullThrew = true;
          }
        }}
      >
        {`null change ${name}`}
      </button>
    </div>
  );
}

/** Everything the codebase reads off useFormikContext. */
function ContextProbe() {
  const ctx = useFormikContext<Record<string, unknown>>();
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
      <button type="button" onClick={() => ctx.setFieldError('a', 'ctx error')}>
        context error a
      </button>
      <button type="button" onClick={() => ctx.resetForm()}>
        reset
      </button>
    </div>
  );
}

interface FormProps {
  initialValues?: Record<string, unknown>;
  onSubmit?: (values: Record<string, unknown>) => void | Promise<void>;
  validate?: FieldValidator;
}

function Harness({
  initialValues = { a: '' },
  onSubmit = () => {},
  validate,
}: FormProps) {
  return (
    <Formik initialValues={initialValues} onSubmit={onSubmit}>
      {(formik) => (
        <form onSubmit={formik.handleSubmit}>
          <Probe name="a" validate={validate} />
          <ContextProbe />
          <button type="submit">submit</button>
        </form>
      )}
    </Formik>
  );
}

const at = (id: string) => screen.getByTestId(id).textContent;

describe('the form contract, as formik implements it today', () => {
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

      // the validator has not run yet, so there is no error to be invalid about
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

      await user.click(screen.getByRole('button', { name: 'submit' }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ a: 'yes' });
    });

    test('an invalid form does not call onSubmit', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<Harness onSubmit={onSubmit} validate={required} />);

      await user.click(screen.getByRole('button', { name: 'submit' }));

      await waitFor(() => expect(at('a-error')).toBe('required'));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('submitting marks every field touched, whether or not it was visited', async () => {
      const user = userEvent.setup();
      render(<Harness validate={required} />);

      await user.click(screen.getByRole('button', { name: 'submit' }));

      await waitFor(() => expect(at('a-touched')).toBe('true'));
    });

    test('an error found at submit makes the form invalid', async () => {
      const user = userEvent.setup();
      render(<Harness validate={required} />);

      await user.click(screen.getByRole('button', { name: 'submit' }));

      await waitFor(() => expect(at('isValid')).toBe('false'));
    });
  });

  describe('the helpers a field is handed', () => {
    test('setValue writes the value', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(screen.getByRole('button', { name: 'field set a' }));

      await waitFor(() => expect(at('values')).toBe('{"a":"set"}'));
    });

    test('setValue runs the validator', async () => {
      const user = userEvent.setup();
      const never = () => 'always wrong';
      render(<Harness validate={never} />);

      await user.click(screen.getByRole('button', { name: 'field set a' }));

      await waitFor(() => expect(at('a-error')).toBe('always wrong'));
    });

    test('setTouched marks the field touched', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(screen.getByRole('button', { name: 'field touch a' }));

      await waitFor(() => expect(at('a-touched')).toBe('true'));
    });

    test('setError puts an error there without a validator saying so', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(screen.getByRole('button', { name: 'field error a' }));

      await waitFor(() => expect(at('a-error')).toBe('forced'));
    });
  });

  describe('the change shapes the codebase hands to field.onChange', () => {
    test('an object shaped like an event is accepted, and its name is used', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(
        screen.getByRole('button', { name: 'hand made event a' })
      );

      await waitFor(() => expect(at('values')).toBe('{"a":"made up"}'));
    });

    // Recorded rather than desired. InventoryStep deselects with
    // `field.onChange(null)`, and formik reads `target` off what it is given,
    // so that call throws where it stands. Pinned here so a replacement is
    // held to the same shape of contract, and so the call site is not fixed by
    // accident in the middle of a port: it wants its own change.
    test('onChange(null) throws, and leaves the value alone', async () => {
      const user = userEvent.setup();
      render(<Harness initialValues={{ a: 'kept' }} />);

      await user.click(screen.getByRole('button', { name: 'null change a' }));

      expect(
        (window as unknown as { onChangeNullThrew?: boolean }).onChangeNullThrew
      ).toBe(true);
      expect(at('values')).toBe('{"a":"kept"}');
    });
  });

  describe('what the form root hands its children', () => {
    test('handleSubmit, values, setFieldValue, isValid and initialValues', () => {
      const seen: string[] = [];
      render(
        <Formik initialValues={{ a: '1' }} onSubmit={() => {}}>
          {(formik) => {
            seen.push(
              ...(
                [
                  'handleSubmit',
                  'values',
                  'setFieldValue',
                  'isValid',
                  'initialValues',
                ] as const
              ).filter((k) => formik[k] !== undefined)
            );
            return <form onSubmit={formik.handleSubmit} />;
          }}
        </Formik>
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

    test('onSubmit is given the values, and nothing here reads a second argument', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<Harness initialValues={{ a: 'v' }} onSubmit={onSubmit} />);

      await user.click(screen.getByRole('button', { name: 'submit' }));

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

      await user.click(screen.getByRole('button', { name: 'context set a' }));

      await waitFor(() =>
        expect(screen.getByLabelText('a')).toHaveValue('ctx')
      );
    });

    test('setFieldTouched and setFieldError reach the field', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(screen.getByRole('button', { name: 'context touch a' }));
      await user.click(screen.getByRole('button', { name: 'context error a' }));

      await waitFor(() => expect(at('a-touched')).toBe('true'));
      expect(at('a-error')).toBe('ctx error');
    });

    test('resetForm puts the values, touched and errors back', async () => {
      const user = userEvent.setup();
      render(<Harness initialValues={{ a: 'first' }} />);

      await user.clear(screen.getByLabelText('a'));
      await user.type(screen.getByLabelText('a'), 'changed');
      await user.click(screen.getByRole('button', { name: 'context touch a' }));
      await waitFor(() => expect(at('a-touched')).toBe('true'));

      await user.click(screen.getByRole('button', { name: 'reset' }));

      await waitFor(() =>
        expect(screen.getByLabelText('a')).toHaveValue('first')
      );
      expect(at('a-touched')).toBe('false');
      expect(at('errors')).toBe('{}');
    });
  });
});
