import React from 'react';
import { Formik } from 'formik';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import AnalyticsStep from './AnalyticsStep';

describe('<AnalyticsStep />', () => {
  test('initially renders the expected content', async () => {
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
        <AnalyticsStep />
      </Formik>
    );
    // AnalyticsStep resets username/password on mount via a useEffect; await an
    // async query so that Formik state update settles inside act()
    expect(await screen.findByText('User analytics')).toBeInTheDocument();
    expect(screen.getByText('Automation Analytics')).toBeInTheDocument();
  });
});
