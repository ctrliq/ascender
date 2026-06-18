import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import {
  CredentialTypesAPI,
  InventoriesAPI,
  CredentialsAPI,
  ExecutionEnvironmentsAPI,
  RootAPI,
} from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../testUtils/rtlContexts';
import AdHocCommands from './AdHocCommands';

jest.mock('../../api/models/CredentialTypes');
jest.mock('../../api/models/Inventories');
jest.mock('../../api/models/Credentials');
jest.mock('../../api/models/ExecutionEnvironments');
jest.mock('../../api/models/Root');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({
    id: 1,
  }),
}));
const credentials = [
  { id: 1, kind: 'cloud', name: 'Cred 1', url: 'www.google.com' },
  { id: 2, kind: 'ssh', name: 'Cred 2', url: 'www.google.com' },
  { id: 3, kind: 'Ansible', name: 'Cred 3', url: 'www.google.com' },
  { id: 4, kind: 'Machine', name: 'Cred 4', url: 'www.google.com' },
  { id: 5, kind: 'Machine', name: 'Cred 5', url: 'www.google.com' },
];

const adHocItems = [
  {
    name: 'Inventory 1 Org 0',
  },
  { name: 'Inventory 2 Org 0' },
];

function renderAdHoc(props = {}) {
  return renderWithContexts(
    <AdHocCommands
      adHocItems={adHocItems}
      hasListItems
      onLaunchLoading={() => jest.fn()}
      moduleOptions={[
        ['command', 'command'],
        ['foo', 'foo'],
      ]}
      {...props}
    />
  );
}

// Walk the open wizard from the details step through to launch, selecting the
// EE row at index 2 (EE2) and the credential row at index 4 (Cred 4).
async function runWizardToLaunch(user) {
  await user.selectOptions(document.querySelector('#module_name'), 'command');
  await user.type(document.querySelector('#module_args'), 'foo');
  // select verbosity by its stable option value ('1'), not the i18n label
  await user.selectOptions(document.querySelector('#verbosity'), '1');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  // step 2: execution environment - select EE2
  await screen.findByText('EE2');
  await user.click(screen.getByRole('row', { name: /EE2/ }).querySelector('input'));
  await waitFor(() =>
    expect(
      screen.getByRole('row', { name: /EE2/ }).querySelector('input')
    ).toBeChecked()
  );
  await user.click(screen.getByRole('button', { name: 'Next' }));

  // step 3: machine credential - select Cred 4
  await screen.findByText('Cred 4');
  await user.click(
    screen.getByRole('row', { name: /Cred 4/ }).querySelector('input')
  );
  await waitFor(() =>
    expect(
      screen.getByRole('row', { name: /Cred 4/ }).querySelector('input')
    ).toBeChecked()
  );
  await user.click(screen.getByRole('button', { name: 'Next' }));

  // preview step -> launch
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Launch' })).toBeEnabled()
  );
  await user.click(screen.getByRole('button', { name: 'Launch' }));
}

describe('<AdHocCommands />', () => {
  beforeEach(() => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
    CredentialTypesAPI.read.mockResolvedValue({
      data: { count: 1, results: [{ id: 1, name: 'cred' }] },
    });
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'EE1 1', url: 'wwww.google.com' },
          { id: 2, name: 'EE2', url: 'wwww.google.com' },
        ],
        count: 2,
      },
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('mounts successfully', async () => {
    renderAdHoc();
    expect(
      await screen.findByRole('button', { name: 'Run Command' })
    ).toBeInTheDocument();
    await settleTooltips();
  });

  test('should open the wizard', async () => {
    InventoriesAPI.readDetail.mockResolvedValue({ data: { organization: 1 } });
    CredentialTypesAPI.read.mockResolvedValue({
      data: { results: [{ id: 1 }] },
    });
    const { user } = renderAdHoc();
    const runButton = await screen.findByRole('button', {
      name: 'Run Command',
    });
    await user.click(runButton);

    // the wizard renders its title once open
    expect(await screen.findByText('Run command')).toBeInTheDocument();
    // settle the Run Command button's tooltip timers before unmount
    await settleTooltips();
  });

  test('should submit properly', async () => {
    InventoriesAPI.launchAdHocCommands.mockResolvedValue({ data: { id: 1 } });
    InventoriesAPI.readDetail.mockResolvedValue({
      data: { organization: 1 },
    });
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: credentials,
        count: 5,
      },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    const { user } = renderAdHoc();
    const runButton = await screen.findByRole('button', {
      name: 'Run Command',
    });
    await user.click(runButton);
    await waitFor(() =>
      expect(document.querySelector('#module_name')).toBeInTheDocument()
    );

    await runWizardToLaunch(user);

    await waitFor(() =>
      expect(InventoriesAPI.launchAdHocCommands).toHaveBeenCalledWith(1, {
        module_args: 'foo',
        diff_mode: false,
        credential: 4,
        become_password: undefined,
        job_type: 'run',
        become_enabled: '',
        extra_vars: '---',
        forks: 0,
        limit: 'Inventory 1 Org 0, Inventory 2 Org 0',
        module_name: 'command',
        ssh_key_unlock: undefined,
        ssh_password: undefined,
        verbosity: '1',
        execution_environment: 2,
      })
    );
    // launch navigates away, unmounting the tooltip-wrapped Run Command button
    await settleTooltips();
  });

  test('should throw error on submission properly', async () => {
    InventoriesAPI.launchAdHocCommands.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'post',
            url: '/api/v2/inventories/1/ad_hoc_commands',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    InventoriesAPI.readDetail.mockResolvedValue({
      data: { organization: 1 },
    });
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: credentials,
        count: 5,
      },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    const { user } = renderAdHoc();
    const runButton = await screen.findByRole('button', {
      name: 'Run Command',
    });
    await user.click(runButton);
    await waitFor(() =>
      expect(document.querySelector('#module_name')).toBeInTheDocument()
    );

    await runWizardToLaunch(user);

    // the failed launch surfaces an AlertModal with ErrorDetail
    await waitFor(() =>
      expect(screen.getByText('Failed to launch job.')).toBeInTheDocument()
    );
    expect(
      screen.getByRole('button', { name: 'Details' })
    ).toBeInTheDocument();
    await settleTooltips();
  });

  test('should disable run command button due to lack of list items', async () => {
    InventoriesAPI.readHosts.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    renderAdHoc({ hasListItems: false });
    const runButton = await screen.findByRole('button', {
      name: 'Run Command',
    });
    expect(runButton).toBeDisabled();
    await settleTooltips();
  });

  test('should open alert modal when error on fetching data', async () => {
    InventoriesAPI.readDetail.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'options',
            url: '/api/v2/inventories/1/',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    renderAdHoc();
    const runButton = await screen.findByRole('button', {
      name: 'Run Command',
    });
    // fireEvent (not userEvent) avoids focusing the button, so its tooltip
    // hover/focus timer is not scheduled before the fetch error swaps the
    // button out for the AlertModal (which would log an unmount warning).
    fireEvent.click(runButton);

    // a fetch error while the wizard is open renders the ContentError alert
    await waitFor(() =>
      expect(screen.getByText('Something went wrong...')).toBeInTheDocument()
    );
    await settleTooltips();
  });
});
