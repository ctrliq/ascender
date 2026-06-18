import React from 'react';
import { screen } from '@testing-library/react';
import { Formik } from 'formik';
import { TextInput } from '@patternfly/react-core';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import CredentialPluginField from './CredentialPluginField';

const fieldOptions = {
  id: 'username',
  label: 'Username',
  type: 'string',
};

jest.mock('../../../../api');

const pluginButtonName =
  'Populate field from an external secret management system';

describe('<CredentialPluginField />', () => {
  describe('No plugin configured', () => {
    function renderField() {
      return renderWithContexts(
        <Formik
          initialValues={{
            inputs: {
              username: '',
            },
          }}
        >
          {() => (
            <CredentialPluginField
              fieldOptions={fieldOptions}
              isDisabled={false}
              isRequired={false}
            >
              <TextInput id="credential-username" />
            </CredentialPluginField>
          )}
        </Formik>
      );
    }

    test('renders the expected content', () => {
      const { container } = renderField();
      expect(container.querySelectorAll('input')).toHaveLength(1);
      expect(
        screen.getByRole('button', { name: pluginButtonName })
      ).toBeInTheDocument();
      expect(
        screen.queryByText('External Secret Management System')
      ).not.toBeInTheDocument();
    });

    test('clicking plugin button shows plugin prompt', async () => {
      const { user } = renderField();
      expect(
        screen.queryByRole('dialog', {
          name: 'External Secret Management System',
        })
      ).not.toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: pluginButtonName })
      );
      expect(
        await screen.findByRole('dialog', {
          name: 'External Secret Management System',
        })
      ).toBeInTheDocument();
    });
  });

  describe('Plugin already configured', () => {
    function renderField() {
      return renderWithContexts(
        <Formik
          initialValues={{
            inputs: {
              username: {
                credential: {
                  id: 1,
                  name: 'CyberArk Cred',
                  cloud: false,
                  credential_type_id: 20,
                  kind: 'conjur',
                },
              },
            },
          }}
        >
          {() => (
            <CredentialPluginField
              fieldOptions={fieldOptions}
              isDisabled={false}
              isRequired={false}
            >
              <TextInput id="credential-username" />
            </CredentialPluginField>
          )}
        </Formik>
      );
    }

    test('renders the expected content', () => {
      const { container } = renderField();
      expect(
        screen.queryByText('External Secret Management System')
      ).not.toBeInTheDocument();
      expect(container.querySelectorAll('input')).toHaveLength(0);
      // CredentialPluginSelected renders the edit-plugin (KeyIcon) button
      expect(
        screen.getByRole('button', {
          name: 'Edit Credential Plugin Configuration',
        })
      ).toBeInTheDocument();
      expect(screen.getByText('CyberArk Cred')).toBeInTheDocument();
    });
  });
});
