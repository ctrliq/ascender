import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { CredentialsAPI, ExecutionEnvironmentsAPI, RootAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AdHocCommandsWizard from './AdHocCommandsWizard';

jest.mock('../../api/models/CredentialTypes');
jest.mock('../../api/models/Inventories');
jest.mock('../../api/models/Credentials');
jest.mock('../../api/models/ExecutionEnvironments');
jest.mock('../../api/models/Root');

const moduleOptions = [
  ['command', 'command'],
  ['shell', 'shell'],
];
const adHocItems = [
  { name: 'Inventory 1' },
  { name: 'Inventory 2' },
  { name: 'inventory 3' },
];

function renderWizard(onLaunch) {
  return renderWithContexts(
    <AdHocCommandsWizard
      adHocItems={adHocItems}
      onLaunch={onLaunch}
      moduleOptions={moduleOptions}
      onCloseWizard={() => {}}
      credentialTypeId={1}
      organizationId={1}
    />
  );
}

// Fill the details step (module/args/verbosity) so Next is enabled.
async function fillDetails(user) {
  await waitFor(() =>
    expect(document.querySelector('#module_name')).toBeInTheDocument()
  );
  await user.selectOptions(document.querySelector('#module_name'), 'command');
  await user.type(document.querySelector('#module_args'), 'foo');
  // select verbosity by its stable option value ('1'), not the i18n label
  await user.selectOptions(document.querySelector('#verbosity'), '1');
}

// The Wizard footer renders a Next button and a final Launch button.
const nextButton = () => screen.getByRole('button', { name: 'Next' });
const launchButton = () => screen.getByRole('button', { name: 'Launch' });

describe('<AdHocCommandsWizard/>', () => {
  const onLaunch = jest.fn();
  beforeEach(() => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should mount properly', async () => {
    renderWizard(onLaunch);
    // the wizard renders its title in a body portal
    expect(await screen.findByText('Run command')).toBeInTheDocument();
  });

  test('launch button should be disabled', async () => {
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    CredentialsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    const { user } = renderWizard(onLaunch);
    await waitFor(() =>
      expect(document.querySelector('#module_name')).toBeInTheDocument()
    );
    // step through without filling required fields -> preview reports errors.
    // each list step is empty here, so the "No ... Found" empty state is a
    // unique marker that the wizard advanced to that step.
    await user.click(nextButton());
    await screen.findByText('No Execution Environments Found');
    await user.click(nextButton());
    await screen.findByText('No Machine Credential Found');
    await user.click(nextButton());

    // preview step shows the missing-field error and disables Launch
    await waitFor(() =>
      expect(
        screen.getByText('Some of the previous step(s) have errors')
      ).toBeInTheDocument()
    );
    expect(launchButton()).toBeDisabled();
  });

  test('launch button should become active', async () => {
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'EE 1', url: '' },
          { id: 2, name: 'EE 2', url: '' },
        ],
        count: 2,
      },
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'Cred 1', url: '' },
          { id: 2, name: 'Cred2', url: '' },
        ],
        count: 2,
      },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    const { user } = renderWizard(onLaunch);
    await fillDetails(user);
    expect(nextButton()).toBeEnabled();
    await user.click(nextButton());

    // step 2: execution environment list
    await waitFor(() => expect(screen.getByText('EE 1')).toBeInTheDocument());
    const eeRadios = screen.getAllByRole('radio');
    expect(eeRadios).toHaveLength(2);
    await user.click(eeRadios[0]);
    await waitFor(() => expect(eeRadios[0]).toBeChecked());
    await user.click(nextButton());

    // step 3: machine credential list
    await waitFor(() => expect(screen.getByText('Cred 1')).toBeInTheDocument());
    const credRadios = screen.getAllByRole('radio');
    expect(credRadios).toHaveLength(2);
    await user.click(credRadios[0]);
    await waitFor(() => expect(credRadios[0]).toBeChecked());
    await user.click(nextButton());

    // preview step -> launch
    await waitFor(() => expect(launchButton()).toBeEnabled());
    await user.click(launchButton());

    await waitFor(() =>
      expect(onLaunch).toHaveBeenCalledWith({
        become_enabled: '',
        credentials: [{ id: 1, name: 'Cred 1', url: '' }],
        credential_passwords: {},
        diff_mode: false,
        execution_environment: [{ id: 1, name: 'EE 1', url: '' }],
        extra_vars: '---',
        forks: 0,
        job_type: 'run',
        limit: 'Inventory 1, Inventory 2, inventory 3',
        module_args: 'foo',
        module_name: 'command',
        verbosity: '1',
      })
    );
  });

  test('should render credential passwords step', async () => {
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'EE 1', url: '' },
          { id: 2, name: 'EE 2', url: '' },
        ],
        count: 2,
      },
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: [
          {
            id: 1,
            name: 'Cred 1',
            url: '',
            inputs: { password: 'ASK' },
          },
          { id: 2, name: 'Cred2', url: '' },
        ],
        count: 2,
      },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    const { user } = renderWizard(onLaunch);
    await fillDetails(user);
    expect(nextButton()).toBeEnabled();
    await user.click(nextButton());

    // step 2: execution environment
    await waitFor(() => expect(screen.getByText('EE 1')).toBeInTheDocument());
    const eeRadios = screen.getAllByRole('radio');
    expect(eeRadios).toHaveLength(2);
    await user.click(eeRadios[0]);
    await waitFor(() => expect(eeRadios[0]).toBeChecked());
    await user.click(nextButton());

    // step 3: credential (selecting a password-prompting cred adds step 4)
    await waitFor(() => expect(screen.getByText('Cred 1')).toBeInTheDocument());
    const credRadios = screen.getAllByRole('radio');
    expect(credRadios).toHaveLength(2);
    await user.click(credRadios[0]);
    await waitFor(() => expect(credRadios[0]).toBeChecked());
    await user.click(nextButton());

    // step 4: credential passwords - the ssh password field is rendered.
    // Assert inside waitFor (a bare querySelector returning null doesn't throw,
    // so waitFor would resolve immediately even when the field is absent).
    await waitFor(() =>
      expect(
        document.querySelector(
          'input[name="credential_passwords.ssh_password"]'
        )
      ).toBeInTheDocument()
    );
    const sshPassword = document.querySelector(
      'input[name="credential_passwords.ssh_password"]'
    );
    await user.type(sshPassword, 'password');
    expect(sshPassword).toHaveValue('password');
    await user.click(nextButton());

    // preview step -> launch
    await waitFor(() => expect(launchButton()).toBeEnabled());
    await user.click(launchButton());

    await waitFor(() =>
      expect(onLaunch).toHaveBeenCalledWith({
        become_enabled: '',
        credentials: [
          { id: 1, name: 'Cred 1', url: '', inputs: { password: 'ASK' } },
        ],
        credential_passwords: { ssh_password: 'password' },
        diff_mode: false,
        execution_environment: [{ id: 1, name: 'EE 1', url: '' }],
        extra_vars: '---',
        forks: 0,
        job_type: 'run',
        limit: 'Inventory 1, Inventory 2, inventory 3',
        module_args: 'foo',
        module_name: 'command',
        verbosity: '1',
      })
    );
  });

  test('should show error in navigation bar', async () => {
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    const { user } = renderWizard(onLaunch);
    await waitFor(() =>
      expect(document.querySelector('#module_name')).toBeInTheDocument()
    );
    // choose command (requires args) but leave args empty, then advance.
    // advancing marks the details step visited so its nav item flags the error.
    await user.selectOptions(document.querySelector('#module_name'), 'command');
    await user.click(nextButton());
    await screen.findByText('No Execution Environments Found');

    // the details nav item surfaces the error icon (StepName ExclamationCircle)
    await waitFor(() =>
      expect(
        document.querySelector('#details-step svg')
      ).toBeInTheDocument()
    );
  });

  test('expect credential step to throw error', async () => {
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: {
        results: [{ id: 1, name: 'EE 1', url: '' }],
        count: 1,
      },
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    CredentialsAPI.read.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'get',
            url: '/api/v2/credentials',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    const { user } = renderWizard(onLaunch);
    await fillDetails(user);
    expect(nextButton()).toBeEnabled();
    await user.click(nextButton());

    await waitFor(() => expect(screen.getByText('EE 1')).toBeInTheDocument());
    await user.click(nextButton());

    // the credential step's failed fetch renders ContentError
    await waitFor(() =>
      expect(
        within(document.body).getByText(/Something went wrong/i)
      ).toBeInTheDocument()
    );
  });
});
