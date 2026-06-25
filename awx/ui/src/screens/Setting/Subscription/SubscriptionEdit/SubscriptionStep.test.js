import React from 'react';
import { Formik } from 'formik';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import SubscriptionStep from './SubscriptionStep';

const initialValues = {
  insights: false,
  manifest_file: null,
  manifest_filename: '',
  pendo: false,
  subscription: null,
  password: '',
  username: '',
};

function renderStep() {
  return renderWithContexts(
    <Formik initialValues={initialValues}>
      <SubscriptionStep />
    </Formik>
  );
}

describe('<SubscriptionStep />', () => {
  test('initially renders without crashing', () => {
    renderStep();
    expect(
      screen.getByText('Red Hat subscription manifest')
    ).toBeInTheDocument();
  });

  test('should update filename when a manifest zip file is uploaded', async () => {
    const { container } = renderStep();
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    // the readonly filename input starts empty
    const filenameInput = container.querySelector('#upload-manifest-filename');
    expect(filenameInput.value).toEqual('');

    // the dropzone accept rule is '.zip' (extension based), so the file name
    // must end in .zip for onChange/onDropAccepted to fire
    const file = new File(['123'], 'new file name.zip', {
      type: 'application/zip',
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // FileReader.onload sets the filename asynchronously
    await waitFor(() =>
      expect(
        container.querySelector('#upload-manifest-filename').value
      ).toEqual('new file name.zip')
    );
  });

  test('clear button should clear manifest value and filename', async () => {
    const { container } = renderStep();
    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['123'], 'new file name.zip', {
      type: 'application/zip',
    });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() =>
      expect(
        container.querySelector('#upload-manifest-filename').value
      ).toEqual('new file name.zip')
    );

    // PF FileUpload renders a clear button in the input group
    const clearButton = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearButton);
    await waitFor(() =>
      expect(
        container.querySelector('#upload-manifest-filename').value
      ).toEqual('')
    );
  });

  test('FileUpload should throw an error on an invalid file format', async () => {
    renderStep();
    expect(
      screen.queryByText(
        'Invalid file format. Please upload a valid Red Hat Subscription Manifest.'
      )
    ).toBeNull();

    const fileInput = document.querySelector('input[type="file"]');
    const badFile = new File(['nope'], 'foo.txt', { type: 'text/plain' });
    fireEvent.drop(fileInput, {
      dataTransfer: { files: [badFile], types: ['Files'] },
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          'Invalid file format. Please upload a valid Red Hat Subscription Manifest.'
        )
      ).toBeInTheDocument();
    });
  });

  test('Username/password toggle button should show username credential fields', async () => {
    const { container } = renderStep();
    expect(container.querySelector('#username-field')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Username / password' }));

    const usernameInput = container.querySelector('#username-field');
    const passwordInput = container.querySelector('#password-field');
    expect(usernameInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();

    fireEvent.change(usernameInput, {
      target: { value: 'username-cred', name: 'username' },
    });
    fireEvent.change(passwordInput, {
      target: { value: 'password-cred', name: 'password' },
    });

    await waitFor(() =>
      expect(container.querySelector('#username-field').value).toEqual(
        'username-cred'
      )
    );
    expect(container.querySelector('#password-field').value).toEqual(
      'password-cred'
    );
  });
});
