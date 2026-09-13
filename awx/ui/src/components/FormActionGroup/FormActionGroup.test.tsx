import React from 'react';
import { screen } from '@testing-library/react';
import { Formik, Field } from 'formik';
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
    const required = (value: string) =>
      value ? undefined : 'This field must not be blank';
    const { user } = renderWithContexts(
      <Formik initialValues={{ name: '' }} onSubmit={vi.fn()}>
        {(formik) => (
          <>
            <Field name="name" validate={required}>
              {({
                field,
                meta,
              }: {
                field: object;
                meta: { error?: string; touched: boolean };
              }) => (
                <>
                  <label htmlFor="name">Name</label>
                  <input id="name" {...field} />
                  {meta.touched && meta.error ? (
                    <span role="alert">{meta.error}</span>
                  ) : null}
                </>
              )}
            </Field>
            <FormActionGroup
              onSubmit={formik.handleSubmit}
              onCancel={onCancel}
            />
          </>
        )}
      </Formik>
    );

    await user.click(screen.getByLabelText('Name'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
