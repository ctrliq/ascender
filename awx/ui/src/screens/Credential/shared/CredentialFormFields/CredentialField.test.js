import React from 'react';
import { screen } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import credentialTypes from '../data.credentialTypes.json';
import CredentialField from './CredentialField';

const credentialType = credentialTypes.find((type) => type.id === 5);
const fieldOptions = {
  id: 'password',
  label: 'Secret Key',
  type: 'string',
  secret: true,
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({
    pathname: '/credentials/3/edit',
  }),
}));

function renderField(initialInputs, type = credentialType, options = fieldOptions) {
  return renderWithContexts(
    <Formik
      initialValues={{
        passwordPrompts: {},
        inputs: initialInputs,
      }}
    >
      {() => <CredentialField fieldOptions={options} credentialType={type} />}
    </Formik>
  );
}

const externalButtonName =
  'Populate field from an external secret management system';

describe('<CredentialField />', () => {
  test('renders correctly without initial value', () => {
    const { container } = renderField({ password: '' });
    const input = container.querySelector('#credential-password');
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
    // KeyIcon (external plugin) button
    expect(
      screen.getByRole('button', { name: externalButtonName })
    ).toBeInTheDocument();
    // no Replace/Revert (PficonHistoryIcon) button when there is no initialValue
    expect(
      screen.queryByRole('button', { name: 'Replace field with new value' })
    ).not.toBeInTheDocument();
  });

  test('renders correctly with initial value', () => {
    const { container } = renderField({ password: '$encrypted$' });
    const input = container.querySelector('#credential-password');
    expect(input).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'ENCRYPTED');
    expect(
      screen.getByRole('button', { name: externalButtonName })
    ).toBeInTheDocument();
    // PficonHistoryIcon replace button present
    expect(
      container.querySelector('#credential-password-replace-button')
    ).toBeInTheDocument();
  });

  test('replace/revert button behaves as expected', async () => {
    const { container, user } = renderField({ password: '$encrypted$' });
    const replaceButton = container.querySelector(
      '#credential-password-replace-button'
    );
    expect(container.querySelector('#credential-password')).toBeDisabled();

    // initial state: Replace — input is disabled and shows the ENCRYPTED
    // placeholder. Clicking puts it in Revert state: input enabled, no
    // placeholder. (The tooltip text flips Replace<->Revert; the aria-label is
    // keyed off meta.touched rather than the toggle, so we assert the
    // user-observable input state instead.)
    await user.click(replaceButton);
    expect(container.querySelector('#credential-password')).not.toBeDisabled();
    expect(container.querySelector('#credential-password')).toHaveValue('');
    expect(
      container.querySelector('#credential-password')
    ).not.toHaveAttribute('placeholder');

    // revert back to the encrypted/disabled state
    await user.click(
      container.querySelector('#credential-password-replace-button')
    );
    expect(container.querySelector('#credential-password')).toBeDisabled();
    expect(container.querySelector('#credential-password')).toHaveValue('');
    expect(container.querySelector('#credential-password')).toHaveAttribute(
      'placeholder',
      'ENCRYPTED'
    );
  });

  test('Should check to see if the ability to edit vault ID is disabled after creation.', () => {
    const vaultCredential = credentialTypes.find((type) => type.id === 3);
    const vaultFieldOptions = {
      id: 'vault_id',
      label: 'Vault Identifier',
      type: 'string',
      secret: true,
    };
    const { container } = renderField(
      { password: 'password', vault_id: 'vault_id' },
      vaultCredential,
      vaultFieldOptions
    );
    expect(container.querySelector('#credential-vault_id')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: externalButtonName })
    ).toBeInTheDocument();
  });
});
