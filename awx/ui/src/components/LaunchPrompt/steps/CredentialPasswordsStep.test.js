import React from 'react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import CredentialPasswordsStep from './CredentialPasswordsStep';

// The PasswordField id lands on the rendered <input>, so query inputs by id
// from the container rather than getByLabelText (the FormGroup labelIcon
// breaks the label/input association).
describe('CredentialPasswordsStep', () => {
  function assertPasswordFields(
    container,
    { ssh, passphrase, become, vaultIds = [] }
  ) {
    expect(!!container.querySelector('#launch-ssh-password')).toBe(ssh);
    expect(!!container.querySelector('#launch-private-key-passphrase')).toBe(
      passphrase
    );
    expect(
      !!container.querySelector('#launch-privilege-escalation-password')
    ).toBe(become);
    const vaultFields = container.querySelectorAll(
      '[id^="launch-vault-password-"]'
    );
    expect(vaultFields).toHaveLength(vaultIds.length);
    vaultIds.forEach((vaultId) => {
      expect(
        container.querySelector(`#launch-vault-password-${vaultId}`)
      ).not.toBeNull();
    });
  }

  describe('JT default credentials (no credential replacement) and creds are promptable', () => {
    test('should render ssh password field when JT has default machine cred', () => {
      const { container } = renderWithContexts(
        <Formik
          initialValues={{
            credentials: [{ id: 1 }],
          }}
        >
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: true,
              defaults: {
                credentials: [
                  {
                    id: 1,
                    passwords_needed: ['ssh_password'],
                  },
                ],
              },
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: true,
        passphrase: false,
        become: false,
      });
    });

    test('should render become password field when JT has default machine cred', () => {
      const { container } = renderWithContexts(
        <Formik
          initialValues={{
            credentials: [{ id: 1 }],
          }}
        >
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: true,
              defaults: {
                credentials: [
                  {
                    id: 1,
                    passwords_needed: ['become_password'],
                  },
                ],
              },
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: false,
        passphrase: false,
        become: true,
      });
    });

    test('should render private key passphrase field when JT has default machine cred', () => {
      const { container } = renderWithContexts(
        <Formik
          initialValues={{
            credentials: [{ id: 1 }],
          }}
        >
          <CredentialPasswordsStep
            launchConfig={{
              defaults: {
                ask_credential_on_launch: true,
                credentials: [
                  {
                    id: 1,
                    passwords_needed: ['ssh_key_unlock'],
                  },
                ],
              },
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: false,
        passphrase: true,
        become: false,
      });
    });

    test('should render vault password field when JT has default vault cred', () => {
      const { container } = renderWithContexts(
        <Formik
          initialValues={{
            credentials: [{ id: 1 }],
          }}
        >
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: true,
              defaults: {
                credentials: [
                  {
                    id: 1,
                    passwords_needed: ['vault_password.1'],
                  },
                ],
              },
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: false,
        passphrase: false,
        become: false,
        vaultIds: ['1'],
      });
    });

    test('should render all password field when JT has default vault cred and machine cred', () => {
      const { container } = renderWithContexts(
        <Formik
          initialValues={{
            credentials: [{ id: 1 }, { id: 2 }],
          }}
        >
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: true,
              defaults: {
                credentials: [
                  {
                    id: 1,
                    passwords_needed: [
                      'ssh_password',
                      'become_password',
                      'ssh_key_unlock',
                    ],
                  },
                  {
                    id: 2,
                    passwords_needed: ['vault_password.1'],
                  },
                ],
              },
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: true,
        passphrase: true,
        become: true,
        vaultIds: ['1'],
      });
    });
  });

  describe('Credentials have been replaced and creds are promptable', () => {
    test('should render ssh password field when replacement machine cred prompts for it', () => {
      const { container } = renderWithContexts(
        <Formik
          initialValues={{
            credentials: [
              {
                id: 1,
                inputs: {
                  password: 'ASK',
                  become_password: null,
                  ssh_key_unlock: null,
                  vault_password: null,
                },
              },
            ],
          }}
        >
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: true,
              defaults: {
                credentials: [],
              },
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: true,
        passphrase: false,
        become: false,
      });
    });

    test('should render become password field when replacement machine cred prompts for it', () => {
      const { container } = renderWithContexts(
        <Formik
          initialValues={{
            credentials: [
              {
                id: 1,
                inputs: {
                  password: null,
                  become_password: 'ASK',
                  ssh_key_unlock: null,
                  vault_password: null,
                },
              },
            ],
          }}
        >
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: true,
              defaults: {
                credentials: [],
              },
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: false,
        passphrase: false,
        become: true,
      });
    });

    test('should render private key passphrase field when replacement machine cred prompts for it', () => {
      const { container } = renderWithContexts(
        <Formik
          initialValues={{
            credentials: [
              {
                id: 1,
                inputs: {
                  password: null,
                  become_password: null,
                  ssh_key_unlock: 'ASK',
                  vault_password: null,
                },
              },
            ],
          }}
        >
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: true,
              defaults: {
                credentials: [],
              },
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: false,
        passphrase: true,
        become: false,
      });
    });

    test('should render vault password field when replacement vault cred prompts for it', () => {
      const { container } = renderWithContexts(
        <Formik
          initialValues={{
            credentials: [
              {
                id: 1,
                inputs: {
                  password: null,
                  become_password: null,
                  ssh_key_unlock: null,
                  vault_password: 'ASK',
                  vault_id: 'foobar',
                },
              },
            ],
          }}
        >
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: true,
              defaults: {
                credentials: [],
              },
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: false,
        passphrase: false,
        become: false,
        vaultIds: ['foobar'],
      });
    });

    test('should render all password fields when replacement vault and machine creds prompt for it', () => {
      const { container } = renderWithContexts(
        <Formik
          initialValues={{
            credentials: [
              {
                id: 1,
                inputs: {
                  password: 'ASK',
                  become_password: 'ASK',
                  ssh_key_unlock: 'ASK',
                },
              },
              {
                id: 2,
                inputs: {
                  password: null,
                  become_password: null,
                  ssh_key_unlock: null,
                  vault_password: 'ASK',
                  vault_id: 'foobar',
                },
              },
            ],
          }}
        >
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: true,
              defaults: {
                credentials: [],
              },
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: true,
        passphrase: true,
        become: true,
        vaultIds: ['foobar'],
      });
    });
  });

  describe('Credentials have been replaced and creds are not promptable', () => {
    test('should render ssh password field when required', () => {
      const { container } = renderWithContexts(
        <Formik initialValues={{}}>
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: false,
              passwords_needed_to_start: ['ssh_password'],
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: true,
        passphrase: false,
        become: false,
      });
    });

    test('should render become password field when required', () => {
      const { container } = renderWithContexts(
        <Formik initialValues={{}}>
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: false,
              passwords_needed_to_start: ['become_password'],
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: false,
        passphrase: false,
        become: true,
      });
    });

    test('should render private key passphrase field when required', () => {
      const { container } = renderWithContexts(
        <Formik initialValues={{}}>
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: false,
              passwords_needed_to_start: ['ssh_key_unlock'],
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: false,
        passphrase: true,
        become: false,
      });
    });

    test('should render vault password field when required', () => {
      const { container } = renderWithContexts(
        <Formik initialValues={{}}>
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: false,
              passwords_needed_to_start: ['vault_password.foobar'],
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: false,
        passphrase: false,
        become: false,
        vaultIds: ['foobar'],
      });
    });

    test('should render all password fields when required', () => {
      const { container } = renderWithContexts(
        <Formik initialValues={{}}>
          <CredentialPasswordsStep
            launchConfig={{
              ask_credential_on_launch: false,
              passwords_needed_to_start: [
                'ssh_password',
                'become_password',
                'ssh_key_unlock',
                'vault_password.foobar',
              ],
            }}
          />
        </Formik>
      );

      assertPasswordFields(container, {
        ssh: true,
        passphrase: true,
        become: true,
        vaultIds: ['foobar'],
      });
    });
  });
});
