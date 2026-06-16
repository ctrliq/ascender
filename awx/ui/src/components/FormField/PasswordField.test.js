import React from 'react';
import { screen } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import PasswordField from './PasswordField';

describe('PasswordField', () => {
  test('renders the expected content', () => {
    const { container } = renderWithContexts(
      <Formik
        initialValues={{
          password: '',
        }}
        onSubmit={() => {}}
      >
        {() => (
          <PasswordField id="test-password" name="password" label="Password" />
        )}
      </Formik>
    );
    expect(container.querySelector('#test-password')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
  });
});
