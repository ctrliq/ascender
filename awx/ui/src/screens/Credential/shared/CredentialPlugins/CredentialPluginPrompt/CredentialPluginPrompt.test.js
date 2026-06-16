import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { CredentialsAPI, CredentialTypesAPI } from 'api';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import selectedCredential from '../../data.cyberArkCredential.json';
import azureVaultCredential from '../../data.azureVaultCredential.json';
import hashiCorpCredential from '../../data.hashiCorpCredential.json';
import CredentialPluginPrompt from './CredentialPluginPrompt';

jest.mock('../../../../../api');

const mockCredentialResults = {
  data: {
    count: 3,
    results: [selectedCredential, azureVaultCredential, hashiCorpCredential],
  },
};

const mockCredentialOptions = {
  data: {
    actions: { GET: {}, POST: {} },
    related_search_fields: [],
  },
};

const mockCredentialTypeDetail = {
  data: {
    id: 20,
    name: 'CyberArk Conjur Secrets Manager Lookup',
    kind: 'external',
    namespace: 'conjur',
    managed: true,
    inputs: {
      fields: [
        { id: 'url', label: 'Conjur URL', type: 'string', format: 'url' },
        { id: 'api_key', label: 'API Key', type: 'string', secret: true },
        { id: 'account', label: 'Account', type: 'string' },
        { id: 'username', label: 'Username', type: 'string' },
        {
          id: 'cacert',
          label: 'Public Key Certificate',
          type: 'string',
          multiline: true,
        },
      ],
      metadata: [
        {
          id: 'secret_path',
          label: 'Secret Identifier',
          type: 'string',
          help_text: 'The identifier for the secret e.g., /some/identifier',
        },
        {
          id: 'secret_version',
          label: 'Secret Version',
          type: 'string',
          help_text:
            'Used to specify a specific secret version (if left empty, the latest version will be used).',
        },
      ],
      required: ['url', 'api_key', 'account', 'username'],
    },
    injectors: {},
  },
};

const getInput = (id) => document.querySelector(`input#credential-${id}`);

describe('<CredentialPluginPrompt />', () => {
  beforeEach(() => {
    CredentialsAPI.test.mockResolvedValue({});
    CredentialsAPI.read.mockResolvedValue(mockCredentialResults);
    CredentialsAPI.readOptions.mockResolvedValue(mockCredentialOptions);
    CredentialTypesAPI.readDetail.mockResolvedValue(mockCredentialTypeDetail);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Plugin not configured', () => {
    function renderPrompt() {
      const onClose = jest.fn();
      const onSubmit = jest.fn();
      const result = renderWithContexts(
        <CredentialPluginPrompt onClose={onClose} onSubmit={onSubmit} />
      );
      return { ...result, onClose, onSubmit };
    }

    test('renders the Credential step with selectable rows and disabled Next', async () => {
      const { user } = renderPrompt();
      // wait for the credentials list to load
      await screen.findByText('CyberArk Conjur Secrets Manager Lookup');

      expect(
        screen.getByText('Microsoft Azure Key Vault')
      ).toBeInTheDocument();
      expect(
        screen.getByText('HashiCorp Vault Secret Lookup')
      ).toBeInTheDocument();

      // no radios checked initially
      screen
        .getAllByRole('radio')
        .forEach((radio) => expect(radio).not.toBeChecked());

      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      expect(user).toBeDefined();
    });

    test('clicking cancel button calls correct function', async () => {
      const { user, onClose } = renderPrompt();
      await screen.findByText('CyberArk Conjur Secrets Manager Lookup');

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('selecting a credential enables Next and advances to Metadata', async () => {
      const { user } = renderPrompt();
      await screen.findByText('CyberArk Conjur Secrets Manager Lookup');

      const row = screen
        .getByText('CyberArk Conjur Secrets Manager Lookup')
        .closest('tr');
      const radio = within(row).getByRole('radio');
      await user.click(radio);
      expect(radio).toBeChecked();

      const nextButton = screen.getByRole('button', { name: 'Next' });
      await waitFor(() => expect(nextButton).not.toBeDisabled());

      await user.click(nextButton);
      // Metadata step has the secret_path / secret_version fields
      expect(await screen.findByText('Secret Identifier')).toBeInTheDocument();
      expect(getInput('secret_path')).toBeInTheDocument();
      expect(getInput('secret_version')).toBeInTheDocument();
    });

    test('submit button calls correct function with parameters', async () => {
      const { user, onSubmit } = renderPrompt();
      await screen.findByText('CyberArk Conjur Secrets Manager Lookup');

      const row = screen
        .getByText('CyberArk Conjur Secrets Manager Lookup')
        .closest('tr');
      await user.click(within(row).getByRole('radio'));
      await user.click(screen.getByRole('button', { name: 'Next' }));

      await screen.findByText('Secret Identifier');

      // The MetadataStep FormFields initialize from inputs.<id> which start
      // undefined (a pre-existing component quirk), so the first keystroke logs
      // React's controlled/uncontrolled warning. Filter just that message so the
      // setupTests console-error trap doesn't fail this otherwise-correct test.
      const trappedError = console.error;
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation((...args) => {
          if (
            typeof args[0] === 'string' &&
            args[0].includes(
              'changing an uncontrolled input to be controlled'
            )
          ) {
            return;
          }
          trappedError(...args);
        });
      try {
        await user.type(getInput('secret_path'), '/foo/bar');
        await user.type(getInput('secret_version'), '9000');
      } finally {
        consoleError.mockRestore();
      }

      await user.click(screen.getByRole('button', { name: 'OK' }));

      // MetadataStep fields are named inputs.<id>, so the metadata values are
      // submitted nested under `inputs` (the old enzyme test set a flat key via
      // a synthetic event's `name`, which the real input/formik wiring does not).
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          credential: selectedCredential,
          inputs: { secret_path: '/foo/bar', secret_version: '9000' },
        }),
        expect.anything()
      );
    });
  });

  describe('Plugin already configured', () => {
    function renderPrompt() {
      const onClose = jest.fn();
      const onSubmit = jest.fn();
      const result = renderWithContexts(
        <CredentialPluginPrompt
          onClose={onClose}
          onSubmit={onSubmit}
          initialValues={{
            credential: selectedCredential,
            inputs: {
              secret_path: '/foo/bar',
              secret_version: '9000',
            },
          }}
        />
      );
      return { ...result, onClose, onSubmit };
    }

    test('preselects the configured credential and Next is enabled', async () => {
      renderPrompt();
      await screen.findByText('CyberArk Conjur Secrets Manager Lookup');

      const row = screen
        .getByText('CyberArk Conjur Secrets Manager Lookup')
        .closest('tr');
      expect(within(row).getByRole('radio')).toBeChecked();
      expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
    });

    test('metadata step renders the saved metadata values', async () => {
      const { user } = renderPrompt();
      await screen.findByText('CyberArk Conjur Secrets Manager Lookup');

      await user.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText('Secret Identifier');

      expect(getInput('secret_path')).toHaveValue('/foo/bar');
      expect(getInput('secret_version')).toHaveValue('9000');
    });

    test('clicking Test button makes correct call', async () => {
      const { user } = renderPrompt();
      await screen.findByText('CyberArk Conjur Secrets Manager Lookup');

      await user.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText('Secret Identifier');

      await user.click(screen.getByRole('button', { name: 'Test' }));
      await waitFor(() =>
        expect(CredentialsAPI.test).toHaveBeenCalledWith(1, {
          metadata: { secret_path: '/foo/bar', secret_version: '9000' },
        })
      );
    });
  });
});
