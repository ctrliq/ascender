import React from 'react';
import { screen } from '@testing-library/react';
import { FormRoot, useField } from 'components/Form';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import FormActionGroup from './FormActionGroup';

describe('FormActionGroup', () => {
  test('should render save and cancel buttons and invoke their handlers', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const { user } = renderWithContexts(
      <FormActionGroup onSubmit={onSubmit} onCancel={onCancel} />
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  // ansible/awx#8826: leaving a required field empty and clicking cancel used
  // to blur the field first, which ran its validator and put an error on a form
  // the user was walking away from. Cancel takes the click without taking the
  // focus, so nothing validates on the way out.
  test('should leave a touched required field alone when cancelling', async () => {
    const onCancel = vi.fn();
    const { user } = renderWithContexts(
      <FormRoot initialValues={{ name: '' }} onSubmit={vi.fn()}>
        {(form) => (
          <>
            <RequiredName />
            <FormActionGroup onSubmit={form.handleSubmit} onCancel={onCancel} />
          </>
        )}
      </FormRoot>
    );

    await user.click(screen.getByLabelText('Name'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

/** A required field that shows its error once touched, the way the screens do. */
function RequiredName() {
  const required = (value: string) =>
    value ? undefined : 'This field must not be blank';
  const [field, meta] = useField<string>({ name: 'name', validate: required });
  return (
    <>
      <label htmlFor="name">Name</label>
      <input id="name" {...field} />
      {meta.touched && meta.error ? (
        <span role="alert">{meta.error}</span>
      ) : null}
    </>
  );
}
