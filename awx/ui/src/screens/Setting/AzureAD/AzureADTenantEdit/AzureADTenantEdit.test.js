import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../../testUtils/enzymeHelpers';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import AzureADTenantEdit from './AzureADTenantEdit';

jest.mock('../../../../api');

describe('<AzureADTenantEdit />', () => {
  let wrapper;
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

  beforeEach(async () => {
    history = createMemoryHistory({
      initialEntries: ['/settings/azure/tenant/edit'],
    });
    await act(async () => {
      wrapper = mountWithContexts(
        <SettingsProvider value={tenantSettings}>
          <AzureADTenantEdit />
        </SettingsProvider>,
        {
          context: { router: { history } },
        }
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
  });

  test('initially renders without crashing', () => {
    expect(wrapper.find('AzureADTenantEdit').length).toBe(1);
  });

  test('should successfully send default values to api on form revert all', async () => {
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(0);
    expect(wrapper.find('RevertAllAlert')).toHaveLength(0);
    await act(async () => {
      wrapper
        .find('button[aria-label="Revert all to default"]')
        .invoke('onClick')();
    });
    wrapper.update();
    expect(wrapper.find('RevertAllAlert')).toHaveLength(1);
    await act(async () => {
      wrapper
        .find('RevertAllAlert button[aria-label="Confirm revert all"]')
        .invoke('onClick')();
    });
    wrapper.update();
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(1);
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith(
      'azuread-oauth2-tenant'
    );
  });

  test('should successfully send request to api on form submission', async () => {
    await act(async () => {
      wrapper.find('Form').invoke('onSubmit')();
    });
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
    const callArgs = SettingsAPI.updateAll.mock.calls[0][0];
    expect(callArgs.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_KEY).toEqual('mock tenant key');
    expect(callArgs.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_SECRET).toEqual('$encrypted$');
    expect(callArgs.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TENANT_ID).toEqual('mock-tenant-id');
    // Nested objects should be properly formatted
    expect(typeof callArgs.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_ORGANIZATION_MAP).toEqual('object');
    expect(typeof callArgs.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TEAM_MAP).toEqual('object');
  });

  test('should navigate to azure tenant detail on successful submission', async () => {
    await act(async () => {
      wrapper.find('Form').invoke('onSubmit')();
    });
    expect(history.location.pathname).toEqual('/settings/azure/tenant/details');
  });

  test('should navigate to azure tenant detail when cancel is clicked', async () => {
    await act(async () => {
      wrapper.find('button[aria-label="Cancel"]').invoke('onClick')();
    });
    expect(history.location.pathname).toEqual('/settings/azure/tenant/details');
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    SettingsAPI.updateAll.mockImplementation(() => Promise.reject(error));
    expect(wrapper.find('FormSubmitError').length).toBe(0);
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await act(async () => {
      wrapper.find('Form').invoke('onSubmit')();
    });
    wrapper.update();
    expect(wrapper.find('FormSubmitError').length).toBe(1);
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    SettingsAPI.readCategory.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await act(async () => {
      wrapper = mountWithContexts(
        <SettingsProvider value={tenantSettings}>
          <AzureADTenantEdit />
        </SettingsProvider>
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    expect(wrapper.find('ContentError').length).toBe(1);
  });
});
