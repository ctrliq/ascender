import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  CredentialTypesAPI,
  CredentialsAPI,
  ExecutionEnvironmentsAPI,
  InventoriesAPI,
  RootAPI,
} from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import type { TestUser } from '../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AdHocCommandsFlow from './AdHocCommandsFlow';
import type { AdHocItem } from './types';

vi.mock('../../api/models/CredentialTypes');
vi.mock('../../api/models/Inventories');
vi.mock('../../api/models/Credentials');
vi.mock('../../api/models/ExecutionEnvironments');
vi.mock('../../api/models/Root');

/* One credential that asks for its password at launch and one that does not,
   so the password step is there only for the first. */
const credentials = [
  { id: 3, name: 'Asks', url: '', inputs: { password: 'ASK' } },
  { id: 4, name: 'Machine', url: '', inputs: {} },
];

const adHocItems = [
  { id: 1, name: 'web1' },
  { id: 2, name: 'web2' },
] as AdHocItem[];

function renderFlow() {
  const onClose = vi.fn();
  const utils = renderWithContexts(
    <AdHocCommandsFlow
      adHocItems={adHocItems}
      inventoryId={9}
      onLaunchLoading={() => {}}
      onClose={onClose}
      moduleOptions={[
        ['command', 'command'],
        ['shell', 'shell'],
      ]}
    />
  );
  return { ...utils, onClose };
}

/** Picks the row with this name on the step on screen. */
async function pickRow(user: TestUser, name: string) {
  await screen.findByText(name);
  const radio = screen
    .getByRole('row', { name: new RegExp(name) })
    .querySelector('input') as HTMLInputElement;
  await user.click(radio);
  await waitFor(() => expect(radio).toBeChecked());
}

/**
 * Walks the wizard from its first step to the launch: the details, the
 * execution environment, the credential, its password where it asks for one,
 * and the preview.
 */
async function runToLaunch(user: TestUser, credential: string) {
  await waitFor(() =>
    expect(document.querySelector('#module_name')).toBeInTheDocument()
  );
  await user.selectOptions(document.querySelector('#module_name')!, 'command');
  await user.type(document.querySelector('#module_args')!, 'uptime');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await pickRow(user, 'EE 2');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await pickRow(user, credential);
  await user.click(screen.getByRole('button', { name: 'Next' }));

  if (credential === 'Asks') {
    await waitFor(() =>
      expect(
        document.querySelector(
          'input[name="credential_passwords.ssh_password"]'
        )
      ).toBeInTheDocument()
    );
    await user.type(
      document.querySelector(
        'input[name="credential_passwords.ssh_password"]'
      ) as Element,
      's3cret'
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
  }

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Launch' })).toBeEnabled()
  );
  await user.click(screen.getByRole('button', { name: 'Launch' }));
}

describe('<AdHocCommandsFlow />', () => {
  beforeEach(() => {
    vi.mocked(RootAPI.readAssetVariables).mockResolvedValue({
      data: { BRAND_NAME: 'Ascender' },
    } as unknown as ResponseOf<typeof RootAPI.readAssetVariables>);
    vi.mocked(InventoriesAPI.readDetail).mockResolvedValue({
      data: { id: 9, organization: 1 },
    } as unknown as ResponseOf<typeof InventoriesAPI.readDetail>);
    vi.mocked(CredentialTypesAPI.read).mockResolvedValue({
      data: { count: 1, results: [{ id: 1, name: 'Machine' }] },
    } as unknown as ResponseOf<typeof CredentialTypesAPI.read>);
    vi.mocked(ExecutionEnvironmentsAPI.read).mockResolvedValue({
      data: {
        count: 2,
        results: [
          { id: 1, name: 'EE 1', url: '' },
          { id: 2, name: 'EE 2', url: '' },
        ],
      },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.read>);
    vi.mocked(ExecutionEnvironmentsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} } },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.readOptions>);
    vi.mocked(CredentialsAPI.read).mockResolvedValue({
      data: { count: 2, results: credentials },
    } as unknown as ResponseOf<typeof CredentialsAPI.read>);
    vi.mocked(CredentialsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} } },
    } as unknown as ResponseOf<typeof CredentialsAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * The wizard holds a list of credentials and of execution environments and
   * nests the passwords; the endpoint takes one credential id, one execution
   * environment id and each password at the top level.
   */
  test('should send the command in the shape the api takes', async () => {
    vi.mocked(InventoriesAPI.launchAdHocCommands).mockResolvedValue({
      data: { id: 77 },
    } as unknown as ResponseOf<typeof InventoriesAPI.launchAdHocCommands>);
    const { user, history } = renderFlow();

    await runToLaunch(user, 'Asks');

    await waitFor(() =>
      expect(InventoriesAPI.launchAdHocCommands).toHaveBeenCalledTimes(1)
    );
    const [inventory, body] = vi.mocked(InventoriesAPI.launchAdHocCommands).mock
      .calls[0] as [number, Record<string, unknown>];
    expect(inventory).toEqual(9);
    expect(body).toMatchObject({
      credential: 3,
      ssh_password: 's3cret',
      become_password: undefined,
      ssh_key_unlock: undefined,
      execution_environment: 2,
      limit: 'web1,web2',
      module_name: 'command',
      module_args: 'uptime',
    });
    expect(body).not.toHaveProperty('credentials');
    expect(body).not.toHaveProperty('credential_passwords');
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/runs/command/77/output')
    );
  });

  test('should say why a launch was refused', async () => {
    vi.mocked(InventoriesAPI.launchAdHocCommands).mockRejectedValue(
      Object.assign(new Error('Forbidden'), {
        response: {
          config: {
            method: 'post',
            url: '/api/v2/inventories/9/ad_hoc_commands/',
          },
          data: { detail: 'You do not have permission to run commands.' },
          status: 403,
        },
      })
    );
    const { user, history, onClose } = renderFlow();
    const before = history.location.pathname;

    await runToLaunch(user, 'Machine');

    expect(
      await screen.findByText('Failed to launch job.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(
      screen.getByText('You do not have permission to run commands.')
    ).toBeInTheDocument();
    expect(history.location.pathname).toEqual(before);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  /* Without the inventory's organization there is no credential to offer, so
     the wizard is not shown at all. */
  test('should say so when the inventory cannot be read', async () => {
    vi.mocked(InventoriesAPI.readDetail).mockRejectedValue(
      Object.assign(new Error('Forbidden'), {
        response: {
          config: { method: 'get', url: '/api/v2/inventories/9/' },
          data: {
            detail: 'You do not have permission to perform this action.',
          },
          status: 403,
        },
      })
    );
    renderFlow();

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
    expect(screen.queryByText('Failed to launch job.')).not.toBeInTheDocument();
    expect(InventoriesAPI.launchAdHocCommands).not.toHaveBeenCalled();
  });
});
