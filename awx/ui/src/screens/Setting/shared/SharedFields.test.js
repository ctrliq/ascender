import React from 'react';
import { Formik } from 'formik';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import {
  BooleanField,
  ChoiceField,
  EncryptedField,
  FileUploadField,
  InputAlertField,
  InputField,
  ObjectField,
  TextAreaField,
} from './SharedFields';

describe('Setting form fields', () => {
  test('BooleanField renders the expected content', async () => {
    const { user, container } = renderWithContexts(
      <Formik initialValues={{ boolean: true }}>
        {() => (
          <BooleanField
            name="boolean"
            config={{ label: 'test', help_text: 'test' }}
          />
        )}
      </Formik>
    );
    const toggle = container.querySelector('#boolean');
    expect(toggle).toBeChecked();
    expect(toggle).not.toBeDisabled();
    await user.click(toggle);
    expect(container.querySelector('#boolean')).not.toBeChecked();
  });

  test('ChoiceField renders unrequired form field', () => {
    const { container } = renderWithContexts(
      <Formik initialValues={{ choice: 'one' }}>
        {() => (
          <ChoiceField
            name="choice"
            config={{
              label: 'test',
              help_text: 'test',
              choices: [
                ['one', 'One'],
                ['two', 'Two'],
              ],
            }}
          />
        )}
      </Formik>
    );
    expect(container.querySelector('select#choice')).toBeInTheDocument();
    expect(
      container.querySelector('.pf-v6-c-form__label-required')
    ).not.toBeInTheDocument();
  });

  test('EncryptedField renders the expected content', () => {
    const { container } = renderWithContexts(
      <Formik initialValues={{ encrypted: '' }}>
        {() => (
          <EncryptedField
            name="encrypted"
            config={{ label: 'test', help_text: 'test' }}
          />
        )}
      </Formik>
    );
    const input = container.querySelector('#encrypted');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');
  });

  test('InputField renders the expected content', async () => {
    const { user, container } = renderWithContexts(
      <Formik initialValues={{ text: '' }}>
        {() => (
          <InputField
            name="text"
            config={{ label: 'test', help_text: 'test', default: '' }}
          />
        )}
      </Formik>
    );
    const input = container.querySelector('#text');
    expect(input).toHaveValue('');
    await user.type(input, 'foo');
    expect(container.querySelector('#text')).toHaveValue('foo');
  });

  test('InputField should revert to expected default value', async () => {
    const { user, container } = renderWithContexts(
      <Formik initialValues={{ number: 5 }}>
        {() => (
          <InputField
            name="number"
            type="number"
            config={{ label: 'test number input', min_value: -10, default: 0 }}
          />
        )}
      </Formik>
    );
    const input = container.querySelector('#number');
    expect(input).toHaveValue(5);
    await user.click(
      within(container.querySelector('#number-field')).getByRole('button', {
        name: 'Revert',
      })
    );
    expect(container.querySelector('#number')).toHaveValue(0);
  });

  test('InputAlertField initially renders disabled TextInput', () => {
    const { container } = renderWithContexts(
      <Formik initialValues={{ text: '' }}>
        {() => (
          <InputAlertField
            name="text"
            config={{ label: 'test', help_text: 'test', default: '' }}
          />
        )}
      </Formik>
    );
    const input = container.querySelector('#text');
    expect(input).toHaveValue('');
    expect(input).toBeDisabled();
  });

  test('TextAreaField renders the expected content', async () => {
    const { user, container } = renderWithContexts(
      <Formik initialValues={{ mock_textarea: '' }}>
        {() => (
          <TextAreaField
            name="mock_textarea"
            config={{
              label: 'mock textarea',
              help_text: 'help text',
              default: '',
            }}
          />
        )}
      </Formik>
    );
    const textarea = container.querySelector('textarea#mock_textarea');
    expect(textarea).toHaveValue('');
    await user.type(textarea, 'new textarea value');
    expect(container.querySelector('textarea#mock_textarea')).toHaveValue(
      'new textarea value'
    );
  });

  test('ObjectField renders the expected content', () => {
    renderWithContexts(
      <Formik initialValues={{ object: '["one", "two", "three"]' }}>
        {() => (
          <ObjectField
            name="object"
            config={{
              label: 'test',
              help_text: 'test',
              default: '[]',
              type: 'list',
            }}
          />
        )}
      </Formik>
    );
    // CodeEditor (react-ace) renders empty under jsdom, so assert the field's
    // label rather than the editor contents.
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  test('FileUploadField renders the expected content', async () => {
    const { user, container } = renderWithContexts(
      <Formik initialValues={{ mock_file: 'mock file value' }}>
        {() => (
          <FileUploadField
            name="mock_file"
            config={{
              label: 'mock file label',
              help_text: 'mock file help',
              default: '',
            }}
          />
        )}
      </Formik>
    );
    expect(screen.getByText('mock file label')).toBeInTheDocument();
    const filenameInput = container.querySelector('#mock_file-filename');
    expect(filenameInput).toHaveValue('');
    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(
      [
        '-----BEGIN PRIVATE KEY-----\nAAAAAAAAAAAAAA\n-----END PRIVATE KEY-----\n',
      ],
      'new file name',
      { type: 'text/plain' }
    );
    // fireEvent.change (not user.upload) drives react-dropzone's hidden file
    // input without triggering the focus/blur sequence; the component spreads
    // formik's onBlur onto that unnamed input, and a real blur would log a
    // Formik warning that the console-error trap turns into a failure.
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() =>
      expect(container.querySelector('#mock_file-filename')).toHaveValue(
        'new file name'
      )
    );
    // wait for the async file read to finish (the loading spinner clears) so no
    // setFileIsUploading state update leaks past unmount into the next test
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    await user.click(
      within(container.querySelector('#mock_file-field')).getByRole('button', {
        name: 'Revert',
      })
    );
    expect(container.querySelector('#mock_file-filename')).toHaveValue('');
  });

  test('should render confirmation modal when toggle on for disable local auth', async () => {
    const { user, container } = renderWithContexts(
      <Formik initialValues={{ DISABLE_LOCAL_AUTH: false }}>
        {() => (
          <BooleanField
            name="DISABLE_LOCAL_AUTH"
            needsConfirmationModal
            modalTitle="Confirm Disable Local Authorization"
            config={{
              category: 'Authentication',
              category_slug: 'authentication',
              default: false,
              help_text:
                'Controls whether users are prevented from using the built-in authentication system. You probably want to do this if you are using an LDAP or SAML integration.',
              label: 'Disable the built-in authentication system',
              required: true,
              type: 'boolean',
              value: false,
            }}
          />
        )}
      </Formik>
    );
    const toggle = container.querySelector('#DISABLE_LOCAL_AUTH');
    expect(toggle).not.toBeChecked();
    expect(toggle).not.toBeDisabled();
    await user.click(toggle);
    expect(
      screen.getByText('Confirm Disable Local Authorization')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(
      screen.queryByText('Confirm Disable Local Authorization')
    ).not.toBeInTheDocument();
    expect(container.querySelector('#DISABLE_LOCAL_AUTH')).toBeChecked();
  });

  test('should not render confirmation modal when toggling off', async () => {
    const { user, container } = renderWithContexts(
      <Formik initialValues={{ DISABLE_LOCAL_AUTH: true }}>
        {() => (
          <BooleanField
            name="DISABLE_LOCAL_AUTH"
            needsConfirmationModal
            modalTitle="Confirm Disable Local Authorization"
            config={{
              category: 'Authentication',
              category_slug: 'authentication',
              default: false,
              help_text:
                'Controls whether users are prevented from using the built-in authentication system. You probably want to do this if you are using an LDAP or SAML integration.',
              label: 'Disable the built-in authentication system',
              required: true,
              type: 'boolean',
              value: false,
            }}
          />
        )}
      </Formik>
    );
    const toggle = container.querySelector('#DISABLE_LOCAL_AUTH');
    expect(toggle).toBeChecked();
    expect(toggle).not.toBeDisabled();
    await user.click(toggle);
    expect(
      screen.queryByText('Confirm Disable Local Authorization')
    ).not.toBeInTheDocument();
    expect(container.querySelector('#DISABLE_LOCAL_AUTH')).not.toBeChecked();
  });

  test('should not toggle disable local auth when cancelled', async () => {
    const { user, container } = renderWithContexts(
      <Formik initialValues={{ DISABLE_LOCAL_AUTH: false }}>
        {() => (
          <BooleanField
            name="DISABLE_LOCAL_AUTH"
            needsConfirmationModal
            modalTitle="Confirm Disable Local Authorization"
            config={{
              category: 'Authentication',
              category_slug: 'authentication',
              default: false,
              help_text:
                'Controls whether users are prevented from using the built-in authentication system. You probably want to do this if you are using an LDAP or SAML integration.',
              label: 'Disable the built-in authentication system',
              required: true,
              type: 'boolean',
              value: false,
            }}
          />
        )}
      </Formik>
    );
    const toggle = container.querySelector('#DISABLE_LOCAL_AUTH');
    expect(toggle).not.toBeChecked();
    expect(toggle).not.toBeDisabled();
    await user.click(toggle);
    expect(
      screen.getByText('Confirm Disable Local Authorization')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByText('Confirm Disable Local Authorization')
    ).not.toBeInTheDocument();
    expect(container.querySelector('#DISABLE_LOCAL_AUTH')).not.toBeChecked();
  });
});
