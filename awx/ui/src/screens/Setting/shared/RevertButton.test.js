import React from 'react';
import { Formik } from 'formik';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import RevertButton from './RevertButton';

describe('RevertButton', () => {
  test('button text should display "Revert"', () => {
    renderWithContexts(
      <Formik initialValues={{ test_input: 'foo' }}>
        <RevertButton id="test_input" defaultValue="" />
      </Formik>
    );
    expect(screen.getByRole('button')).toHaveTextContent('Revert');
  });

  test('button text should display "Revert" when default differs from value', () => {
    renderWithContexts(
      <Formik
        initialValues={{ test_input: 'foo' }}
        values={{ test_input: 'bar' }}
      >
        <RevertButton id="test_input" defaultValue="bar" />
      </Formik>
    );
    expect(screen.getByRole('button')).toHaveTextContent('Revert');
  });

  test('should revert value to default on button click', async () => {
    const { user } = renderWithContexts(
      <Formik initialValues={{ test_input: 'foo' }}>
        <RevertButton id="test_input" defaultValue="bar" />
      </Formik>
    );
    expect(screen.getByRole('button')).toHaveTextContent('Revert');
    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(screen.getByRole('button')).toHaveTextContent('Undo');
  });

  test('should be disabled when current value equals the initial and default values', () => {
    renderWithContexts(
      <Formik
        initialValues={{ test_input: 'bar' }}
        values={{ test_input: 'bar' }}
      >
        <RevertButton id="test_input" defaultValue="bar" />
      </Formik>
    );
    expect(screen.getByRole('button')).toHaveTextContent('Revert');
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
