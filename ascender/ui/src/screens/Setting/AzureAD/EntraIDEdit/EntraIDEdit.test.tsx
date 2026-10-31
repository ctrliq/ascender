import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import EntraIDEdit from './EntraIDEdit';

vi.mock('../../../../api');

describe('<EntraIDEdit />', () => {
  let history: TestHistory;

  beforeEach(() => {
    vi.mocked(SettingsAPI.revertCategory).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.revertCategory>
    );
    vi.mocked(SettingsAPI.updateAll).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.updateAll>
    );
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        SOCIAL_AUTH_ENTRA_ID_CALLBACK_URL:
          'https://ascender.example.com/sso/complete/entra-id/',
        SOCIAL_AUTH_ENTRA_ID_KEY: 'mock client id',
        SOCIAL_AUTH_ENTRA_ID_SECRET: '$encrypted$',
        SOCIAL_AUTH_ENTRA_ID_TENANT_ID: 'contoso.onmicrosoft.com',
        SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST: 'login.microsoftonline.us',
        SOCIAL_AUTH_ENTRA_ID_USERNAME_KEY: 'preferred_username',
        SOCIAL_AUTH_ENTRA_ID_USERNAME_STRIP_DOMAIN: true,
        SOCIAL_AUTH_ENTRA_ID_GROUPS_CLAIM: 'roles',
        SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH: true,
        SOCIAL_AUTH_ENTRA_ID_GRAPH_HOST: '',
        SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS: null,
        SOCIAL_AUTH_ENTRA_ID_ORGANIZATION_MAP: null,
        SOCIAL_AUTH_ENTRA_ID_TEAM_MAP: {
          Operators: {
            organization: 'Default',
            triggers: { groups: { has_or: ['Ascender.Operator'] } },
          },
        },
        SOCIAL_AUTH_ENTRA_ID_USER_FLAGS: null,
        SOCIAL_AUTH_ENTRA_ID_LOGOUT_FROM_IDP: false,
        SOCIAL_AUTH_ENTRA_ID_POST_LOGOUT_REDIRECT_URL: '',
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderEdit() {
    history = createMemoryHistory({
      initialEntries: ['/settings/azure/entra/edit'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <EntraIDEdit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('renders the Entra ID fields', async () => {
    await renderEdit();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    [
      'Entra ID Client ID',
      'Entra ID Tenant',
      'Entra ID Authority Host',
      'Entra ID Groups Claim',
      'Read Entra ID Groups from Microsoft Graph',
      'Microsoft Graph Host',
      'Entra ID Login Rule',
      'Entra ID Organization Map',
      'Entra ID Team Map',
      'Entra ID User Flags',
      'Log Out of Entra ID',
    ].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
  });

  test('reverts the entra-id category', async () => {
    const { user } = await renderEdit();
    await user.click(
      screen.getByRole('button', { name: 'Revert all to default' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Confirm revert all' })
    );
    await waitFor(() =>
      expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('entra-id')
    );
  });

  test('sends the settings and goes back to the details', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    const callArgs = vi.mocked(SettingsAPI.updateAll).mock
      .calls[0]![0] as Record<string, unknown>;
    expect(callArgs.SOCIAL_AUTH_ENTRA_ID_KEY).toEqual('mock client id');
    expect(callArgs.SOCIAL_AUTH_ENTRA_ID_TENANT_ID).toEqual(
      'contoso.onmicrosoft.com'
    );
    expect(callArgs.SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST).toEqual(
      'login.microsoftonline.us'
    );
    expect(callArgs.SOCIAL_AUTH_ENTRA_ID_GROUPS_CLAIM).toEqual('roles');
    expect(callArgs.SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH).toEqual(true);
    expect(callArgs.SOCIAL_AUTH_ENTRA_ID_USERNAME_STRIP_DOMAIN).toEqual(true);
    expect(callArgs.SOCIAL_AUTH_ENTRA_ID_TEAM_MAP).toEqual({
      Operators: {
        organization: 'Default',
        triggers: { groups: { has_or: ['Ascender.Operator'] } },
      },
    });
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/settings/azure/entra/details')
    );
  });
});
