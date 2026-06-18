import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import AzureADTenantEdit from './AzureADTenantEdit';

jest.mock('../../../../api');

describe('<AzureADTenantEdit />', () => {
  let history;
  let tenantSettings;

  beforeEach(() => {
    tenantSettings = {
      ...mockAllOptions.actions,
      SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_KEY: {
        label: 'Azure AD Tenant OAuth2 Key',
        help_text: 'The OAuth2 key',
        type: 'string',
        unit: null,
      },
      SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_SECRET: {
        label: 'Azure AD Tenant OAuth2 Secret',
        help_text: 'The OAuth2 secret',
        type: 'password',
        unit: null,
      },
      SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TENANT_ID: {
        label: 'Azure AD Tenant OAuth2 Tenant ID',
        help_text: 'The tenant ID',
        type: 'string',
        unit: null,
      },
      SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_ORGANIZATION_MAP: {
        label: 'Azure AD Tenant OAuth2 Organization Map',
        help_text: 'The organization map',
        type: 'nested object',
        unit: null,
      },
      SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TEAM_MAP: {
        label: 'Azure AD Tenant OAuth2 Team Map',
        help_text: 'The team map',
        type: 'nested object',
        unit: null,
      },
    };

    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_KEY: 'mock tenant key',
        SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_SECRET: '$encrypted$',
        SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TENANT_ID: 'mock-tenant-id',
        SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_ORGANIZATION_MAP: {},
        SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TEAM_MAP: {
          'My Tenant Team': {
            organization: 'tenant-foo',
          },
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderEdit() {
    history = createMemoryHistory({
      initialEntries: ['/settings/azure/tenant/edit'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={tenantSettings}>
        <AzureADTenantEdit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    await renderEdit();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await renderEdit();
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Revert settings')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revert all to default' })
    );
    expect(await screen.findByText('Revert settings')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm revert all' })
    );
    await waitFor(() =>
      expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(1)
    );
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith(
      'azuread-oauth2-tenant'
    );
  });

  test('should successfully send request to api on form submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    const callArgs = SettingsAPI.updateAll.mock.calls[0][0];
    expect(callArgs.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_KEY).toEqual(
      'mock tenant key'
    );
    expect(callArgs.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_SECRET).toEqual(
      '$encrypted$'
    );
    expect(callArgs.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TENANT_ID).toEqual(
      'mock-tenant-id'
    );
    // Nested objects should be properly formatted
    expect(
      typeof callArgs.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_ORGANIZATION_MAP
    ).toEqual('object');
    expect(
      typeof callArgs.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TEAM_MAP
    ).toEqual('object');
  });

  test('should navigate to azure tenant detail on successful submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/settings/azure/tenant/details'
      )
    );
  });

  test('should navigate to azure tenant detail when cancel is clicked', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/settings/azure/tenant/details');
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    SettingsAPI.updateAll.mockImplementation(() => Promise.reject(error));
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    SettingsAPI.readCategory.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await renderEdit();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
