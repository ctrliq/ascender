import React from 'react';
import { Formik } from 'formik';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import EulaStep from './EulaStep';

describe('<EulaStep />', () => {
  test('initially renders the expected content', () => {
    renderWithContexts(
      <Formik
        initialValues={{
          insights: false,
          manifest_file: null,
          manifest_filename: '',
          pendo: false,
          subscription: null,
          password: '',
          username: '',
        }}
      >
        <EulaStep />
      </Formik>
    );
    expect(
      screen.getByText('End User License Agreement')
    ).toBeInTheDocument();
  });
});
