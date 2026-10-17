/*
 * Several useField calls on one name.
 *
 * A form commonly reads a field it does not validate while a child component
 * carries the rule: a lookup registers the required validator for
 * organization, and the form around it calls a bare useField('organization')
 * to read the value. React runs the child's effect first, so when the
 * registry kept one validator per name the parent's empty registration
 * replaced the child's and a required field was submitted blank.
 */
import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormRoot, useField, useFormContext } from 'components/Form';

const required = (value: unknown) =>
  value ? undefined : 'This field must not be blank';

/** The child: registers the field with its validator, like a lookup does. */
function Validated() {
  const [, meta] = useField({ name: 'organization', validate: required });
  return <span data-testid="error">{meta.error ?? ''}</span>;
}

/** The parent's bare read of the same field, with no validator. */
function Bare() {
  useField('organization');
  return null;
}

function Submit() {
  const { handleSubmit } = useFormContext();
  return (
    <button type="button" onClick={() => handleSubmit()}>
      submit
    </button>
  );
}

describe('useField registrations sharing a name', () => {
  test('a bare parent useField does not drop the child validator', async () => {
    const onSubmit = vi.fn();
    // The bare hook sits in the component that renders the validated child,
    // so its effect runs after the child's, which is the case that lost the
    // validator.
    function Parent() {
      useField('organization');
      return (
        <>
          <Validated />
          <Submit />
        </>
      );
    }
    render(
      <FormRoot initialValues={{ organization: null }} onSubmit={onSubmit}>
        <Parent />
      </FormRoot>
    );

    await userEvent.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent(
        'This field must not be blank'
      )
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('unmounting one registration removes only its own validator', async () => {
    const onSubmit = vi.fn();
    function Harness() {
      const [shown, setShown] = useState({ bare: true, validated: true });
      return (
        <>
          {shown.validated && <Validated />}
          {shown.bare && <Bare />}
          <button
            type="button"
            onClick={() => setShown((prev) => ({ ...prev, bare: false }))}
          >
            hide bare
          </button>
          <button
            type="button"
            onClick={() => setShown((prev) => ({ ...prev, validated: false }))}
          >
            hide validated
          </button>
          <Submit />
        </>
      );
    }
    render(
      <FormRoot initialValues={{ organization: null }} onSubmit={onSubmit}>
        <Harness />
      </FormRoot>
    );

    // The bare registration going away leaves the validator in place.
    await userEvent.click(screen.getByRole('button', { name: 'hide bare' }));
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent(
        'This field must not be blank'
      )
    );
    expect(onSubmit).not.toHaveBeenCalled();

    // The validated registration going away takes its validator with it, so
    // the same blank value now submits.
    await userEvent.click(
      screen.getByRole('button', { name: 'hide validated' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  test('every validator registered for a name runs', async () => {
    const onSubmit = vi.fn();
    const short = (value: unknown) =>
      String(value ?? '').length > 3 ? 'Too long' : undefined;
    function Second() {
      useField({ name: 'organization', validate: short });
      return null;
    }
    render(
      <FormRoot initialValues={{ organization: 'abcdef' }} onSubmit={onSubmit}>
        <Validated />
        <Second />
        <Submit />
      </FormRoot>
    );

    await userEvent.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('Too long')
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
