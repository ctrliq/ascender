import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import FormSubmitError from './FormSubmitError';

describe('<FormSubmitError>', () => {
  test('should render null when no error present', () => {
    const { container } = renderWithContexts(
      <Formik onSubmit={() => {}}>
        {() => <FormSubmitError error={null} />}
      </Formik>
    );
    expect(container).toBeEmptyDOMElement();
    expect(container.querySelector('.pf-c-alert')).not.toBeInTheDocument();
  });

  test('should pass field errors to Formik', async () => {
    const error = {
      response: {
        data: {
          name: 'invalid',
        },
      },
    };
    renderWithContexts(
      <Formik initialValues={{ name: '' }} onSubmit={() => {}}>
        {({ errors }) => (
          <div>
            <p>{errors.name}</p>
            <FormSubmitError error={error} />
          </div>
        )}
      </Formik>
    );
    await waitFor(() => expect(screen.getByText('invalid')).toBeInTheDocument());
  });

  test('should display error message if field errors not provided', async () => {
    const realConsole = global.console;
    global.console = {
      error: jest.fn(),
    };
    const error = {
      message: 'There was an error',
    };
    const { container } = renderWithContexts(
      <Formik onSubmit={() => {}}>
        {() => <FormSubmitError error={error} />}
      </Formik>
    );
    await waitFor(() =>
      expect(screen.getByText('There was an error')).toBeInTheDocument()
    );
    // PF inline danger Alert: no role="alert", identified by .pf-c-alert
    expect(container.querySelector('.pf-c-alert')).toBeInTheDocument();
    expect(global.console.error).toHaveBeenCalledWith(error);
    global.console = realConsole;
  });
});
